import {
  type Result,
  type Task,
  type TaskId,
  type TaskStatus,
  type Priority,
  type TaskError,
  type TaskStore,
  ok,
  err,
  generateTaskId,
} from './types.js';
import { type StorageService } from '../infrastructure/storage.js';

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: Priority;
}

export interface CreateSubtaskInput {
  parentId: TaskId;
  title: string;
  description?: string;
  priority?: Priority;
}

export interface SubtaskProgress {
  total: number;
  completed: number;
  percentage: number;
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: Priority;
  sortBy?: 'priority' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface TaskWithAllSubtasksCompleted extends Task {
  allSubtasksCompleted?: boolean;
}

export interface TaskService {
  create(input: CreateTaskInput): Promise<Result<Task, TaskError>>;
  list(filter?: TaskFilter): Promise<Result<Task[], TaskError>>;
  get(id: TaskId): Promise<Result<Task, TaskError>>;
  update(id: TaskId, input: UpdateTaskInput): Promise<Result<Task, TaskError>>;
  updateStatus(id: TaskId, status: TaskStatus): Promise<Result<TaskWithAllSubtasksCompleted, TaskError>>;
  delete(id: TaskId): Promise<Result<void, TaskError>>;
  search(query: string): Promise<Result<Task[], TaskError>>;
  createSubtask(input: CreateSubtaskInput): Promise<Result<Task, TaskError>>;
  listSubtasks(parentId: TaskId): Promise<Result<Task[], TaskError>>;
  getProgress(parentId: TaskId): Promise<Result<SubtaskProgress, TaskError>>;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Find task by ID prefix (short or full ID)
function findTaskByIdPrefix(tasks: Task[], idPrefix: string): { task: Task; index: number } | { error: TaskError } {
  const matches = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.id.startsWith(idPrefix));

  if (matches.length === 0) {
    return { error: { type: 'NOT_FOUND', taskId: idPrefix } };
  }
  if (matches.length > 1) {
    return { error: { type: 'VALIDATION_ERROR', message: `Multiple tasks match. Please use a longer ID: ${matches.map(m => m.task.id.slice(0, 8)).join(', ')}` } };
  }
  return matches[0];
}

export function createTaskService(storageService: StorageService): TaskService {
  return {
    async create(input: CreateTaskInput): Promise<Result<Task, TaskError>> {
      const trimmedTitle = input.title.trim();
      if (!trimmedTitle) {
        return err({ type: 'VALIDATION_ERROR', message: 'Title is required' });
      }

      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const now = new Date().toISOString();
      const task: Task = {
        id: generateTaskId(),
        title: trimmedTitle,
        description: input.description ?? '',
        status: 'pending',
        priority: input.priority ?? 'medium',
        createdAt: now,
        updatedAt: now,
      };

      const store = loadResult.data;
      store.tasks.push(task);

      const saveResult = await storageService.save(store);
      if (!saveResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to save data') });
      }

      return ok(task);
    },

    async list(filter?: TaskFilter): Promise<Result<Task[], TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      let tasks = [...loadResult.data.tasks];

      // フィルタリング
      if (filter?.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter?.priority) {
        tasks = tasks.filter(t => t.priority === filter.priority);
      }

      // ソート
      if (filter?.sortBy) {
        const isDesc = filter.sortOrder !== 'asc';
        tasks.sort((a, b) => {
          if (filter.sortBy === 'priority') {
            const diff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
            return isDesc ? diff : -diff;
          }
          const aVal = a[filter.sortBy!];
          const bVal = b[filter.sortBy!];
          const diff = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return isDesc ? -diff : diff;
        });
      }

      return ok(tasks);
    },

    async get(id: TaskId): Promise<Result<Task, TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const result = findTaskByIdPrefix(loadResult.data.tasks, id);
      if ('error' in result) {
        return err(result.error);
      }

      return ok(result.task);
    },

    async update(id: TaskId, input: UpdateTaskInput): Promise<Result<Task, TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const store = loadResult.data;
      const result = findTaskByIdPrefix(store.tasks, id);
      if ('error' in result) {
        return err(result.error);
      }

      const task = store.tasks[result.index];
      const now = new Date().toISOString();

      if (input.title !== undefined) {
        task.title = input.title;
      }
      if (input.description !== undefined) {
        task.description = input.description;
      }
      if (input.priority !== undefined) {
        task.priority = input.priority;
      }
      task.updatedAt = now;

      const saveResult = await storageService.save(store);
      if (!saveResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to save data') });
      }

      return ok(task);
    },

    async updateStatus(id: TaskId, status: TaskStatus): Promise<Result<TaskWithAllSubtasksCompleted, TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const store = loadResult.data;
      const result = findTaskByIdPrefix(store.tasks, id);
      if ('error' in result) {
        return err(result.error);
      }

      const task = store.tasks[result.index];
      const now = new Date().toISOString();

      // サブタスクの場合、親タスクが完了済みかチェック
      if (task.parentId) {
        const parentResult = findTaskByIdPrefix(store.tasks, task.parentId);
        if ('task' in parentResult && parentResult.task.status === 'completed') {
          return err({ type: 'PARENT_COMPLETED', parentId: task.parentId });
        }
      }

      task.status = status;
      task.updatedAt = now;

      if (status === 'in_progress' && !task.startedAt) {
        task.startedAt = now;
      }
      if (status === 'completed') {
        task.completedAt = now;
      }

      const saveResult = await storageService.save(store);
      if (!saveResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to save data') });
      }

      // サブタスクが完了した場合、全サブタスクが完了したかチェック
      let allSubtasksCompleted = false;
      if (task.parentId && status === 'completed') {
        const siblings = store.tasks.filter(t => t.parentId === task.parentId);
        allSubtasksCompleted = siblings.every(t => t.status === 'completed');
      }

      return ok({ ...task, allSubtasksCompleted });
    },

    async delete(id: TaskId): Promise<Result<void, TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const store = loadResult.data;
      const result = findTaskByIdPrefix(store.tasks, id);
      if ('error' in result) {
        return err(result.error);
      }

      const task = result.task;

      // カスケード削除: サブタスクも削除
      store.tasks = store.tasks.filter(t => t.parentId !== task.id);

      // タスク自体を削除
      const newResult = findTaskByIdPrefix(store.tasks, id);
      if ('index' in newResult) {
        store.tasks.splice(newResult.index, 1);
      }

      const saveResult = await storageService.save(store);
      if (!saveResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to save data') });
      }

      return ok(undefined);
    },

    async search(query: string): Promise<Result<Task[], TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const lowerQuery = query.toLowerCase();
      const tasks = loadResult.data.tasks.filter(
        t =>
          t.title.toLowerCase().includes(lowerQuery) ||
          t.description.toLowerCase().includes(lowerQuery)
      );

      return ok(tasks);
    },

    async createSubtask(input: CreateSubtaskInput): Promise<Result<Task, TaskError>> {
      const trimmedTitle = input.title.trim();
      if (!trimmedTitle) {
        return err({ type: 'VALIDATION_ERROR', message: 'Title is required' });
      }

      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const store = loadResult.data;

      // 親タスクの存在確認
      const parentResult = findTaskByIdPrefix(store.tasks, input.parentId);
      if ('error' in parentResult) {
        return err(parentResult.error);
      }

      const parentTask = parentResult.task;

      // 親タスクがサブタスクでないことを確認（ネスト禁止）
      if (parentTask.parentId) {
        return err({ type: 'VALIDATION_ERROR', message: 'Cannot create subtask of a subtask' });
      }

      const now = new Date().toISOString();
      const subtask: Task = {
        id: generateTaskId(),
        title: trimmedTitle,
        description: input.description ?? '',
        status: 'pending',
        priority: input.priority ?? 'medium',
        createdAt: now,
        updatedAt: now,
        parentId: parentTask.id,
      };

      store.tasks.push(subtask);

      const saveResult = await storageService.save(store);
      if (!saveResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to save data') });
      }

      return ok(subtask);
    },

    async listSubtasks(parentId: TaskId): Promise<Result<Task[], TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const store = loadResult.data;

      // 親タスクの存在確認
      const parentResult = findTaskByIdPrefix(store.tasks, parentId);
      if ('error' in parentResult) {
        return err(parentResult.error);
      }

      const subtasks = store.tasks.filter(t => t.parentId === parentResult.task.id);
      return ok(subtasks);
    },

    async getProgress(parentId: TaskId): Promise<Result<SubtaskProgress, TaskError>> {
      const loadResult = await storageService.load();
      if (!loadResult.success) {
        return err({ type: 'STORAGE_ERROR', cause: new Error('Failed to load data') });
      }

      const store = loadResult.data;

      // 親タスクの存在確認
      const parentResult = findTaskByIdPrefix(store.tasks, parentId);
      if ('error' in parentResult) {
        return err(parentResult.error);
      }

      const subtasks = store.tasks.filter(t => t.parentId === parentResult.task.id);
      const total = subtasks.length;
      const completed = subtasks.filter(t => t.status === 'completed').length;
      const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

      return ok({ total, completed, percentage });
    },
  };
}
