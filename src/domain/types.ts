import { randomUUID } from 'node:crypto';

// Result型
export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

export function ok<T, E>(data: T): Result<T, E> {
  return { success: true, data };
}

export function err<T, E>(error: E): Result<T, E> {
  return { success: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success === true;
}

export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

// TaskId
export type TaskId = string;

export function generateTaskId(): TaskId {
  return randomUUID();
}

// TaskStatus
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export function isValidTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

// Priority
export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = typeof PRIORITIES[number];

export function isValidPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}

// Task
export interface Task {
  id: TaskId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  startedAt?: string;  // ISO 8601, in_progress時に設定
  completedAt?: string; // ISO 8601, completed時に設定
}

// TaskStore
export interface TaskStore {
  version: string;
  tasks: Task[];
  metadata: StoreMetadata;
}

export interface StoreMetadata {
  lastModified: string;
  taskCount: number;
}

// エラー型
export type TaskError =
  | { type: 'NOT_FOUND'; taskId: TaskId }
  | { type: 'INVALID_STATUS'; status: string }
  | { type: 'VALIDATION_ERROR'; message: string }
  | { type: 'STORAGE_ERROR'; cause: Error };

export type StorageError =
  | { type: 'FILE_NOT_FOUND' }
  | { type: 'CORRUPTED_DATA'; cause: Error }
  | { type: 'WRITE_ERROR'; cause: Error }
  | { type: 'BACKUP_NOT_FOUND' };
