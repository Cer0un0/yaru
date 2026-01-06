import { describe, it, expect } from 'vitest';
import {
  type Result,
  type Task,
  type TaskStatus,
  type Priority,
  type TaskError,
  ok,
  err,
  isOk,
  isErr,
  generateTaskId,
  isValidTaskStatus,
  isValidPriority,
  TASK_STATUSES,
  PRIORITIES,
} from './types.js';

describe('Result型', () => {
  describe('ok関数', () => {
    it('成功結果を生成する', () => {
      const result = ok<number, string>(42);
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });
  });

  describe('err関数', () => {
    it('失敗結果を生成する', () => {
      const result = err<number, string>('エラー');
      expect(result.success).toBe(false);
      expect(result.error).toBe('エラー');
    });
  });

  describe('isOk関数', () => {
    it('成功結果の場合trueを返す', () => {
      const result = ok<number, string>(42);
      expect(isOk(result)).toBe(true);
    });

    it('失敗結果の場合falseを返す', () => {
      const result = err<number, string>('エラー');
      expect(isOk(result)).toBe(false);
    });
  });

  describe('isErr関数', () => {
    it('失敗結果の場合trueを返す', () => {
      const result = err<number, string>('エラー');
      expect(isErr(result)).toBe(true);
    });

    it('成功結果の場合falseを返す', () => {
      const result = ok<number, string>(42);
      expect(isErr(result)).toBe(false);
    });
  });
});

describe('TaskId生成', () => {
  describe('generateTaskId関数', () => {
    it('UUID v4形式のIDを生成する', () => {
      const id = generateTaskId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('毎回異なるIDを生成する', () => {
      const id1 = generateTaskId();
      const id2 = generateTaskId();
      expect(id1).not.toBe(id2);
    });
  });
});

describe('TaskStatus検証', () => {
  describe('TASK_STATUSES定数', () => {
    it('3つのステータスを含む', () => {
      expect(TASK_STATUSES).toContain('pending');
      expect(TASK_STATUSES).toContain('in_progress');
      expect(TASK_STATUSES).toContain('completed');
      expect(TASK_STATUSES).toHaveLength(3);
    });
  });

  describe('isValidTaskStatus関数', () => {
    it('有効なステータスの場合trueを返す', () => {
      expect(isValidTaskStatus('pending')).toBe(true);
      expect(isValidTaskStatus('in_progress')).toBe(true);
      expect(isValidTaskStatus('completed')).toBe(true);
    });

    it('無効なステータスの場合falseを返す', () => {
      expect(isValidTaskStatus('invalid')).toBe(false);
      expect(isValidTaskStatus('')).toBe(false);
      expect(isValidTaskStatus('PENDING')).toBe(false);
    });
  });
});

describe('Priority検証', () => {
  describe('PRIORITIES定数', () => {
    it('3つの優先度を含む', () => {
      expect(PRIORITIES).toContain('low');
      expect(PRIORITIES).toContain('medium');
      expect(PRIORITIES).toContain('high');
      expect(PRIORITIES).toHaveLength(3);
    });
  });

  describe('isValidPriority関数', () => {
    it('有効な優先度の場合trueを返す', () => {
      expect(isValidPriority('low')).toBe(true);
      expect(isValidPriority('medium')).toBe(true);
      expect(isValidPriority('high')).toBe(true);
    });

    it('無効な優先度の場合falseを返す', () => {
      expect(isValidPriority('invalid')).toBe(false);
      expect(isValidPriority('')).toBe(false);
      expect(isValidPriority('HIGH')).toBe(false);
    });
  });
});

describe('Task型のparentId', () => {
  it('parentIdはオプショナルである', () => {
    const taskWithoutParent: Task = {
      id: 'test-id',
      title: 'テストタスク',
      description: '',
      status: 'pending',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(taskWithoutParent.parentId).toBeUndefined();
  });

  it('parentIdを設定できる', () => {
    const taskWithParent: Task = {
      id: 'subtask-id',
      title: 'サブタスク',
      description: '',
      status: 'pending',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentId: 'parent-id',
    };
    expect(taskWithParent.parentId).toBe('parent-id');
  });
});

describe('TaskError型のPARENT_COMPLETED', () => {
  it('PARENT_COMPLETEDエラーを生成できる', () => {
    const error: TaskError = {
      type: 'PARENT_COMPLETED',
      parentId: 'parent-id',
    };
    expect(error.type).toBe('PARENT_COMPLETED');
    expect(error.parentId).toBe('parent-id');
  });
});
