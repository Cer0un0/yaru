import { readFile, writeFile, mkdir, rename, access, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Result,
  type TaskStore,
  type StorageError,
  ok,
  err,
} from '../domain/types.js';

export interface StorageService {
  load(): Promise<Result<TaskStore, StorageError>>;
  save(store: TaskStore): Promise<Result<void, StorageError>>;
  backup(): Promise<Result<void, StorageError>>;
  restore(): Promise<Result<TaskStore, StorageError>>;
  getDataDir(): string;
}

const DATA_FILE_NAME = 'data.json';
const TEMP_FILE_NAME = 'data.json.tmp';
const BACKUP_FILE_NAME = 'data.json.bak';

function createEmptyStore(): TaskStore {
  return {
    version: '1.0.0',
    tasks: [],
    metadata: {
      lastModified: new Date().toISOString(),
      taskCount: 0,
    },
  };
}

export function createStorageService(dataDir: string): StorageService {
  const dataFilePath = join(dataDir, DATA_FILE_NAME);
  const tempFilePath = join(dataDir, TEMP_FILE_NAME);
  const backupFilePath = join(dataDir, BACKUP_FILE_NAME);

  async function ensureDataDir(): Promise<void> {
    try {
      await mkdir(dataDir, { recursive: true });
    } catch {
      // ディレクトリが既に存在する場合は無視
    }
  }

  async function fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  return {
    async load(): Promise<Result<TaskStore, StorageError>> {
      try {
        if (!(await fileExists(dataFilePath))) {
          const emptyStore = createEmptyStore();
          const saveResult = await this.save(emptyStore);
          if (!saveResult.success) {
            return saveResult as Result<TaskStore, StorageError>;
          }
          return ok(emptyStore);
        }

        const content = await readFile(dataFilePath, 'utf-8');
        const store = JSON.parse(content) as TaskStore;
        return ok(store);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return err({ type: 'CORRUPTED_DATA', cause: error });
      }
    },

    async save(store: TaskStore): Promise<Result<void, StorageError>> {
      try {
        await ensureDataDir();

        // メタデータを更新
        const updatedStore: TaskStore = {
          ...store,
          metadata: {
            lastModified: new Date().toISOString(),
            taskCount: store.tasks.length,
          },
        };

        const content = JSON.stringify(updatedStore, null, 2);

        // アトミック書き込み: 一時ファイルに書き込み後、rename
        await writeFile(tempFilePath, content, 'utf-8');
        await rename(tempFilePath, dataFilePath);

        return ok(undefined);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return err({ type: 'WRITE_ERROR', cause: error });
      }
    },

    async backup(): Promise<Result<void, StorageError>> {
      try {
        if (!(await fileExists(dataFilePath))) {
          return err({ type: 'FILE_NOT_FOUND' });
        }

        await copyFile(dataFilePath, backupFilePath);
        return ok(undefined);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return err({ type: 'WRITE_ERROR', cause: error });
      }
    },

    async restore(): Promise<Result<TaskStore, StorageError>> {
      try {
        if (!(await fileExists(backupFilePath))) {
          return err({ type: 'BACKUP_NOT_FOUND' });
        }

        await copyFile(backupFilePath, dataFilePath);

        const content = await readFile(dataFilePath, 'utf-8');
        const store = JSON.parse(content) as TaskStore;
        return ok(store);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return err({ type: 'CORRUPTED_DATA', cause: error });
      }
    },

    getDataDir(): string {
      return dataDir;
    },
  };
}
