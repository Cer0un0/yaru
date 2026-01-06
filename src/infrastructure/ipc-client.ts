import { createConnection, Socket } from 'node:net';
import {
  type Result,
  ok,
  err,
} from '../domain/types.js';
import {
  type IPCRequest,
  type IPCResponse,
  type IPCError,
  serializeMessage,
  parseMessage,
} from './ipc-protocol.js';

export interface IPCClient {
  connect(socketPath: string): Promise<Result<void, IPCError>>;
  disconnect(): void;
  send<T>(request: IPCRequest): Promise<Result<IPCResponse<T>, IPCError>>;
  isConnected(): boolean;
}

const DEFAULT_TIMEOUT = 5000;

export function createIPCClient(timeout: number = DEFAULT_TIMEOUT): IPCClient {
  let socket: Socket | null = null;
  let connected = false;

  return {
    async connect(socketPath: string): Promise<Result<void, IPCError>> {
      return new Promise((resolve) => {
        socket = createConnection(socketPath);

        const connectTimeout = setTimeout(() => {
          socket?.destroy();
          resolve(err({ type: 'TIMEOUT' }));
        }, timeout);

        socket.on('connect', () => {
          clearTimeout(connectTimeout);
          connected = true;
          resolve(ok(undefined));
        });

        socket.on('error', (error) => {
          clearTimeout(connectTimeout);
          connected = false;
          resolve(err({ type: 'CONNECTION_FAILED', cause: error }));
        });

        socket.on('close', () => {
          connected = false;
        });
      });
    },

    disconnect(): void {
      if (socket) {
        socket.destroy();
        socket = null;
        connected = false;
      }
    },

    async send<T>(request: IPCRequest): Promise<Result<IPCResponse<T>, IPCError>> {
      if (!socket || !connected) {
        return err({ type: 'CONNECTION_FAILED', cause: new Error('Not connected') });
      }

      return new Promise((resolve) => {
        let buffer = '';
        const responseTimeout = setTimeout(() => {
          resolve(err({ type: 'TIMEOUT' }));
        }, timeout);

        const onData = (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;

            const message = parseMessage(line);
            if (message && 'success' in message && message.id === request.id) {
              clearTimeout(responseTimeout);
              socket?.removeListener('data', onData);
              resolve(ok(message as IPCResponse<T>));
              return;
            }
          }
        };

        const onError = (error: Error) => {
          clearTimeout(responseTimeout);
          socket?.removeListener('data', onData);
          socket?.removeListener('error', onError);
          resolve(err({ type: 'SOCKET_ERROR', cause: error }));
        };

        socket!.on('data', onData);
        socket!.once('error', onError);

        socket!.write(serializeMessage(request));
      });
    },

    isConnected(): boolean {
      return connected;
    },
  };
}
