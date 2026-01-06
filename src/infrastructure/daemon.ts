import { spawn } from 'node:child_process';
import { readFile, writeFile, unlink, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  type Result,
  ok,
  err,
} from '../domain/types.js';
import { createIPCServer, type IPCServer } from './ipc-server.js';
import { createIPCClient, type IPCClient } from './ipc-client.js';
import {
  type IPCRequest,
  type IPCResponse,
  createIPCRequest,
  createIPCResponse,
  createIPCErrorResponse,
} from './ipc-protocol.js';
import { createStorageService } from './storage.js';
import { createTaskService, type TaskService } from '../domain/task-service.js';
import { isOk } from '../domain/types.js';

export interface DaemonInfo {
  pid: number;
  socketPath: string;
  startedAt: string;
}

export type DaemonStatus =
  | { running: true; info: DaemonInfo }
  | { running: false };

export type DaemonError =
  | { type: 'ALREADY_RUNNING'; pid: number }
  | { type: 'NOT_RUNNING' }
  | { type: 'START_FAILED'; cause: Error }
  | { type: 'STOP_FAILED'; cause: Error };

export interface DaemonManager {
  start(): Promise<Result<DaemonInfo, DaemonError>>;
  stop(): Promise<Result<void, DaemonError>>;
  status(): Promise<Result<DaemonStatus, DaemonError>>;
  isRunning(): Promise<boolean>;
}

const DATA_DIR = join(homedir(), '.yaru');
const PID_FILE = join(DATA_DIR, 'daemon.pid');
const SOCKET_PATH = join(DATA_DIR, 'daemon.sock');

async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {
    // 既に存在する場合は無視
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

async function readPidFile(): Promise<DaemonInfo | null> {
  try {
    const content = await readFile(PID_FILE, 'utf-8');
    return JSON.parse(content) as DaemonInfo;
  } catch {
    return null;
  }
}

async function writePidFile(info: DaemonInfo): Promise<void> {
  await writeFile(PID_FILE, JSON.stringify(info, null, 2));
}

async function removePidFile(): Promise<void> {
  try {
    await unlink(PID_FILE);
  } catch {
    // ファイルが存在しない場合は無視
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function createDaemonManager(): DaemonManager {
  return {
    async start(): Promise<Result<DaemonInfo, DaemonError>> {
      await ensureDataDir();

      const existingInfo = await readPidFile();
      if (existingInfo && isProcessRunning(existingInfo.pid)) {
        return err({ type: 'ALREADY_RUNNING', pid: existingInfo.pid });
      }

      // 古いPIDファイルをクリーンアップ
      await removePidFile();

      try {
        const daemonScript = new URL('./daemon-process.js', import.meta.url).pathname;

        const child = spawn(process.execPath, [daemonScript], {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            YARU_DATA_DIR: DATA_DIR,
            YARU_SOCKET_PATH: SOCKET_PATH,
          },
        });

        child.unref();

        const info: DaemonInfo = {
          pid: child.pid!,
          socketPath: SOCKET_PATH,
          startedAt: new Date().toISOString(),
        };

        await writePidFile(info);

        // デーモンが起動するまで少し待機
        await new Promise(resolve => setTimeout(resolve, 500));

        return ok(info);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return err({ type: 'START_FAILED', cause: error });
      }
    },

    async stop(): Promise<Result<void, DaemonError>> {
      const info = await readPidFile();
      if (!info) {
        return err({ type: 'NOT_RUNNING' });
      }

      if (!isProcessRunning(info.pid)) {
        await removePidFile();
        return err({ type: 'NOT_RUNNING' });
      }

      try {
        // IPCでstopコマンドを送信
        const client = createIPCClient();
        const connectResult = await client.connect(info.socketPath);
        if (isOk(connectResult)) {
          const request = createIPCRequest('daemon.stop', {});
          await client.send(request);
          client.disconnect();
        }

        // プロセスが終了するまで待機
        await new Promise(resolve => setTimeout(resolve, 500));

        // まだ動いていたらSIGTERMを送信
        if (isProcessRunning(info.pid)) {
          process.kill(info.pid, 'SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        await removePidFile();
        return ok(undefined);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return err({ type: 'STOP_FAILED', cause: error });
      }
    },

    async status(): Promise<Result<DaemonStatus, DaemonError>> {
      const info = await readPidFile();
      if (!info) {
        return ok({ running: false });
      }

      if (!isProcessRunning(info.pid)) {
        await removePidFile();
        return ok({ running: false });
      }

      return ok({ running: true, info });
    },

    async isRunning(): Promise<boolean> {
      const result = await this.status();
      return isOk(result) && result.data.running;
    },
  };
}

// デーモンプロセス内で使用するリクエストハンドラー
export function createRequestHandler(taskService: TaskService): (request: IPCRequest) => Promise<IPCResponse<unknown>> {
  return async (request: IPCRequest): Promise<IPCResponse<unknown>> => {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'task.create': {
          const result = await taskService.create({
            title: params.title as string,
            description: params.description as string | undefined,
            priority: params.priority as 'low' | 'medium' | 'high' | undefined,
          });
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'task.list': {
          const result = await taskService.list({
            status: params.status as 'pending' | 'in_progress' | 'completed' | undefined,
            priority: params.priority as 'low' | 'medium' | 'high' | undefined,
            sortBy: params.sortBy as 'priority' | 'createdAt' | 'updatedAt' | undefined,
            sortOrder: params.sortOrder as 'asc' | 'desc' | undefined,
          });
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'task.get': {
          const result = await taskService.get(params.id as string);
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'task.update': {
          const result = await taskService.update(params.id as string, {
            title: params.title as string | undefined,
            description: params.description as string | undefined,
            priority: params.priority as 'low' | 'medium' | 'high' | undefined,
          });
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'task.updateStatus': {
          const result = await taskService.updateStatus(
            params.id as string,
            params.status as 'pending' | 'in_progress' | 'completed'
          );
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'task.delete': {
          const result = await taskService.delete(params.id as string);
          if (isOk(result)) {
            return createIPCResponse(id, { success: true });
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'task.search': {
          const result = await taskService.search(params.query as string);
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'subtask.create': {
          const result = await taskService.createSubtask({
            parentId: params.parentId as string,
            title: params.title as string,
            description: params.description as string | undefined,
            priority: params.priority as 'low' | 'medium' | 'high' | undefined,
          });
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'subtask.list': {
          const result = await taskService.listSubtasks(params.parentId as string);
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'subtask.progress': {
          const result = await taskService.getProgress(params.parentId as string);
          if (isOk(result)) {
            return createIPCResponse(id, result.data);
          }
          return createIPCErrorResponse(id, result.error.type, getErrorMessage(result.error));
        }

        case 'daemon.status': {
          return createIPCResponse(id, { status: 'running' });
        }

        case 'daemon.stop': {
          // プロセスを終了するためにシグナルを送る
          setImmediate(() => process.exit(0));
          return createIPCResponse(id, { status: 'stopping' });
        }

        default:
          return createIPCErrorResponse(id, 'UNKNOWN_METHOD', `Unknown method: ${method}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return createIPCErrorResponse(id, 'INTERNAL_ERROR', message);
    }
  };
}

function getErrorMessage(error: { type: string; message?: string; taskId?: string; parentId?: string }): string {
  switch (error.type) {
    case 'NOT_FOUND':
      return `Task not found: ${error.taskId}`;
    case 'VALIDATION_ERROR':
      return error.message ?? 'Validation error';
    case 'STORAGE_ERROR':
      return 'Failed to save data';
    case 'INVALID_STATUS':
      return 'Invalid status';
    case 'PARENT_COMPLETED':
      return `Parent task is already completed: ${error.parentId}`;
    default:
      return 'An error occurred';
  }
}

export { DATA_DIR, PID_FILE, SOCKET_PATH };
