import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTaskService, type TaskService } from './task-service.js';
import { createStorageService } from '../infrastructure/storage.js';
import { isOk, isErr } from './types.js';

describe('TaskService', () => {
  let tempDir: string;
  let taskService: TaskService;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'task-service-test-'));
    const storageService = createStorageService(tempDir);
    taskService = createTaskService(storageService);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('タイトルのみでタスクを作成できる', async () => {
      const result = await taskService.create({ title: 'テストタスク' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.title).toBe('テストタスク');
        expect(result.data.description).toBe('');
        expect(result.data.status).toBe('pending');
        expect(result.data.priority).toBe('medium');
        expect(result.data.id).toBeDefined();
        expect(result.data.createdAt).toBeDefined();
        expect(result.data.updatedAt).toBeDefined();
      }
    });

    it('説明付きでタスクを作成できる', async () => {
      const result = await taskService.create({
        title: 'タスク',
        description: 'これはタスクの説明です',
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.description).toBe('これはタスクの説明です');
      }
    });

    it('優先度を指定してタスクを作成できる', async () => {
      const result = await taskService.create({
        title: 'タスク',
        priority: 'high',
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.priority).toBe('high');
      }
    });

    it('空のタイトルではエラーを返す', async () => {
      const result = await taskService.create({ title: '' });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });

    it('空白のみのタイトルではエラーを返す', async () => {
      const result = await taskService.create({ title: '   ' });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('VALIDATION_ERROR');
      }
    });

    it('一意のIDを生成する', async () => {
      const result1 = await taskService.create({ title: 'タスク1' });
      const result2 = await taskService.create({ title: 'タスク2' });

      expect(isOk(result1) && isOk(result2)).toBe(true);
      if (isOk(result1) && isOk(result2)) {
        expect(result1.data.id).not.toBe(result2.data.id);
      }
    });
  });

  describe('list', () => {
    it('タスクが存在しない場合、空の配列を返す', async () => {
      const result = await taskService.list();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual([]);
      }
    });

    it('すべてのタスクを取得できる', async () => {
      await taskService.create({ title: 'タスク1' });
      await taskService.create({ title: 'タスク2' });
      await taskService.create({ title: 'タスク3' });

      const result = await taskService.list();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(3);
      }
    });

    it('ステータスでフィルタリングできる', async () => {
      await taskService.create({ title: 'タスク1' });
      const r2 = await taskService.create({ title: 'タスク2' });
      if (isOk(r2)) {
        await taskService.updateStatus(r2.data.id, 'in_progress');
      }
      await taskService.create({ title: 'タスク3' });

      const result = await taskService.list({ status: 'pending' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data.every(t => t.status === 'pending')).toBe(true);
      }
    });

    it('優先度でフィルタリングできる', async () => {
      await taskService.create({ title: 'タスク1', priority: 'high' });
      await taskService.create({ title: 'タスク2', priority: 'low' });
      await taskService.create({ title: 'タスク3', priority: 'high' });

      const result = await taskService.list({ priority: 'high' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(2);
        expect(result.data.every(t => t.priority === 'high')).toBe(true);
      }
    });

    it('優先度でソートできる', async () => {
      await taskService.create({ title: 'タスク1', priority: 'low' });
      await taskService.create({ title: 'タスク2', priority: 'high' });
      await taskService.create({ title: 'タスク3', priority: 'medium' });

      const result = await taskService.list({ sortBy: 'priority', sortOrder: 'desc' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data[0].priority).toBe('high');
        expect(result.data[1].priority).toBe('medium');
        expect(result.data[2].priority).toBe('low');
      }
    });
  });

  describe('get', () => {
    it('IDでタスクを取得できる', async () => {
      const createResult = await taskService.create({ title: 'テストタスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.get(createResult.data.id);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.title).toBe('テストタスク');
      }
    });

    it('存在しないIDの場合、NOT_FOUNDエラーを返す', async () => {
      const result = await taskService.get('non-existent-id');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('search', () => {
    it('タイトルでタスクを検索できる', async () => {
      await taskService.create({ title: '買い物に行く' });
      await taskService.create({ title: 'レポートを書く' });
      await taskService.create({ title: '買い物リストを作成' });

      const result = await taskService.search('買い物');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('説明でタスクを検索できる', async () => {
      await taskService.create({ title: 'タスク1', description: '重要な会議' });
      await taskService.create({ title: 'タスク2', description: '通常の作業' });
      await taskService.create({ title: 'タスク3', description: '会議の準備' });

      const result = await taskService.search('会議');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('検索結果が存在しない場合、空の配列を返す', async () => {
      await taskService.create({ title: 'タスク1' });

      const result = await taskService.search('存在しないキーワード');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('update', () => {
    it('タイトルを更新できる', async () => {
      const createResult = await taskService.create({ title: '古いタイトル' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.update(createResult.data.id, { title: '新しいタイトル' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.title).toBe('新しいタイトル');
      }
    });

    it('説明を更新できる', async () => {
      const createResult = await taskService.create({ title: 'タスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.update(createResult.data.id, { description: '新しい説明' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.description).toBe('新しい説明');
      }
    });

    it('優先度を更新できる', async () => {
      const createResult = await taskService.create({ title: 'タスク', priority: 'low' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.update(createResult.data.id, { priority: 'high' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.priority).toBe('high');
      }
    });

    it('更新日時が更新される', async () => {
      const createResult = await taskService.create({ title: 'タスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const originalUpdatedAt = createResult.data.updatedAt;
      await new Promise(r => setTimeout(r, 10)); // 少し待機

      const result = await taskService.update(createResult.data.id, { title: '更新' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.updatedAt).not.toBe(originalUpdatedAt);
      }
    });

    it('存在しないIDの場合、NOT_FOUNDエラーを返す', async () => {
      const result = await taskService.update('non-existent-id', { title: '更新' });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('updateStatus', () => {
    it('ステータスを変更できる', async () => {
      const createResult = await taskService.create({ title: 'タスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.updateStatus(createResult.data.id, 'in_progress');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe('in_progress');
      }
    });

    it('in_progressへの遷移時に開始日時を記録する', async () => {
      const createResult = await taskService.create({ title: 'タスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.updateStatus(createResult.data.id, 'in_progress');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.startedAt).toBeDefined();
      }
    });

    it('completedへの遷移時に完了日時を記録する', async () => {
      const createResult = await taskService.create({ title: 'タスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.updateStatus(createResult.data.id, 'completed');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.completedAt).toBeDefined();
      }
    });

    it('存在しないIDの場合、NOT_FOUNDエラーを返す', async () => {
      const result = await taskService.updateStatus('non-existent-id', 'in_progress');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('delete', () => {
    it('タスクを削除できる', async () => {
      const createResult = await taskService.create({ title: '削除するタスク' });
      expect(isOk(createResult)).toBe(true);
      if (!isOk(createResult)) return;

      const result = await taskService.delete(createResult.data.id);

      expect(isOk(result)).toBe(true);

      // 削除後は取得できない
      const getResult = await taskService.get(createResult.data.id);
      expect(isErr(getResult)).toBe(true);
    });

    it('存在しないIDの場合、NOT_FOUNDエラーを返す', async () => {
      const result = await taskService.delete('non-existent-id');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });
});
