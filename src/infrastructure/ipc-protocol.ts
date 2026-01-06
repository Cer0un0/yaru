import { randomUUID } from 'node:crypto';

export type IPCMethod =
  | 'task.create'
  | 'task.list'
  | 'task.get'
  | 'task.update'
  | 'task.updateStatus'
  | 'task.delete'
  | 'task.search'
  | 'daemon.status'
  | 'daemon.stop';

export interface IPCRequest {
  id: string;
  method: IPCMethod;
  params: Record<string, unknown>;
}

export interface IPCResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: IPCResponseError;
}

export interface IPCResponseError {
  code: string;
  message: string;
}

export type RequestHandler = (request: IPCRequest) => Promise<IPCResponse<unknown>>;

export function createIPCRequest(
  method: IPCMethod,
  params: Record<string, unknown> = {}
): IPCRequest {
  return {
    id: randomUUID(),
    method,
    params,
  };
}

export function createIPCResponse<T>(
  requestId: string,
  data: T
): IPCResponse<T> {
  return {
    id: requestId,
    success: true,
    data,
  };
}

export function createIPCErrorResponse(
  requestId: string,
  code: string,
  message: string
): IPCResponse<never> {
  return {
    id: requestId,
    success: false,
    error: { code, message },
  };
}

export function serializeMessage(message: IPCRequest | IPCResponse): string {
  return JSON.stringify(message) + '\n';
}

export function parseMessage(data: string): IPCRequest | IPCResponse | null {
  try {
    return JSON.parse(data.trim());
  } catch {
    return null;
  }
}

export type IPCError =
  | { type: 'CONNECTION_FAILED'; cause: Error }
  | { type: 'TIMEOUT' }
  | { type: 'SOCKET_ERROR'; cause: Error };
