import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StorageService, createStorageService } from './storage.js';
import { isOk, isErr, type TaskStore } from '../domain/types.js';

describe('StorageService', () => {
  let tempDir: string;
  let storageService: StorageService;
  let dataFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'task-tools-test-'));
    dataFilePath = join(tempDir, 'data.json');
    storageService = createStorageService(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('ファイルが存在しない場合、空のストアを作成して返す', async () => {
      const result = await storageService.load();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.version).toBe('1.0.0');
        expect(result.data.tasks).toEqual([]);
        expect(result.data.metadata.taskCount).toBe(0);
      }
    });

    it('有効なJSONファイルが存在する場合、データを読み込む', async () => {
      const store: TaskStore = {
        version: '1.0.0',
        tasks: [
          {
            id: 'test-id',
            title: 'テストタスク',
            description: '',
            status: 'pending',
            priority: 'medium',
            createdAt: '2026-01-06T00:00:00.000Z',
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
        ],
        metadata: {
          lastModified: '2026-01-06T00:00:00.000Z',
          taskCount: 1,
        },
      };
      await writeFile(dataFilePath, JSON.stringify(store, null, 2));

      const result = await storageService.load();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.tasks).toHaveLength(1);
        expect(result.data.tasks[0].title).toBe('テストタスク');
      }
    });

    it('破損したJSONファイルの場合、CORRUPTED_DATAエラーを返す', async () => {
      await writeFile(dataFilePath, 'invalid json {');

      const result = await storageService.load();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('CORRUPTED_DATA');
      }
    });
  });

  describe('save', () => {
    it('データをJSONファイルに保存する', async () => {
      const store: TaskStore = {
        version: '1.0.0',
        tasks: [
          {
            id: 'test-id',
            title: '保存テスト',
            description: '',
            status: 'pending',
            priority: 'medium',
            createdAt: '2026-01-06T00:00:00.000Z',
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
        ],
        metadata: {
          lastModified: '2026-01-06T00:00:00.000Z',
          taskCount: 1,
        },
      };

      const result = await storageService.save(store);

      expect(isOk(result)).toBe(true);

      const content = await readFile(dataFilePath, 'utf-8');
      const savedStore = JSON.parse(content);
      expect(savedStore.tasks[0].title).toBe('保存テスト');
    });

    it('ディレクトリが存在しない場合、自動作成する', async () => {
      const nestedDir = join(tempDir, 'nested', 'dir');
      const nestedStorage = createStorageService(nestedDir);
      const store: TaskStore = {
        version: '1.0.0',
        tasks: [],
        metadata: {
          lastModified: '2026-01-06T00:00:00.000Z',
          taskCount: 0,
        },
      };

      const result = await nestedStorage.save(store);

      expect(isOk(result)).toBe(true);
    });

    it('メタデータを自動更新する', async () => {
      const store: TaskStore = {
        version: '1.0.0',
        tasks: [
          {
            id: 'task-1',
            title: 'タスク1',
            description: '',
            status: 'pending',
            priority: 'medium',
            createdAt: '2026-01-06T00:00:00.000Z',
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
          {
            id: 'task-2',
            title: 'タスク2',
            description: '',
            status: 'pending',
            priority: 'medium',
            createdAt: '2026-01-06T00:00:00.000Z',
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
        ],
        metadata: {
          lastModified: '2020-01-01T00:00:00.000Z',
          taskCount: 0,
        },
      };

      const result = await storageService.save(store);

      expect(isOk(result)).toBe(true);

      const content = await readFile(dataFilePath, 'utf-8');
      const savedStore = JSON.parse(content) as TaskStore;
      expect(savedStore.metadata.taskCount).toBe(2);
      expect(savedStore.metadata.lastModified).not.toBe('2020-01-01T00:00:00.000Z');
    });
  });

  describe('getDataDir', () => {
    it('データディレクトリのパスを返す', () => {
      expect(storageService.getDataDir()).toBe(tempDir);
    });
  });

  describe('backup', () => {
    it('データファイルのバックアップを作成する', async () => {
      const store: TaskStore = {
        version: '1.0.0',
        tasks: [
          {
            id: 'backup-test',
            title: 'バックアップテスト',
            description: '',
            status: 'pending',
            priority: 'medium',
            createdAt: '2026-01-06T00:00:00.000Z',
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
        ],
        metadata: {
          lastModified: '2026-01-06T00:00:00.000Z',
          taskCount: 1,
        },
      };
      await storageService.save(store);

      const result = await storageService.backup();

      expect(isOk(result)).toBe(true);

      const backupPath = join(tempDir, 'data.json.bak');
      const backupContent = await readFile(backupPath, 'utf-8');
      const backupStore = JSON.parse(backupContent) as TaskStore;
      expect(backupStore.tasks[0].title).toBe('バックアップテスト');
    });

    it('データファイルが存在しない場合、FILE_NOT_FOUNDエラーを返す', async () => {
      const result = await storageService.backup();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('FILE_NOT_FOUND');
      }
    });
  });

  describe('restore', () => {
    it('バックアップからデータを復元する', async () => {
      const backupPath = join(tempDir, 'data.json.bak');
      const backupStore: TaskStore = {
        version: '1.0.0',
        tasks: [
          {
            id: 'restore-test',
            title: '復元テスト',
            description: '',
            status: 'pending',
            priority: 'medium',
            createdAt: '2026-01-06T00:00:00.000Z',
            updatedAt: '2026-01-06T00:00:00.000Z',
          },
        ],
        metadata: {
          lastModified: '2026-01-06T00:00:00.000Z',
          taskCount: 1,
        },
      };
      await writeFile(backupPath, JSON.stringify(backupStore, null, 2));

      const result = await storageService.restore();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.tasks[0].title).toBe('復元テスト');
      }

      // データファイルも復元されているか確認
      const dataContent = await readFile(dataFilePath, 'utf-8');
      const dataStore = JSON.parse(dataContent) as TaskStore;
      expect(dataStore.tasks[0].title).toBe('復元テスト');
    });

    it('バックアップファイルが存在しない場合、BACKUP_NOT_FOUNDエラーを返す', async () => {
      const result = await storageService.restore();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('BACKUP_NOT_FOUND');
      }
    });
  });
});
