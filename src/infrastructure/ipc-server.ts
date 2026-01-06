import { createServer, Server, Socket } from 'node:net';
import { unlink } from 'node:fs/promises';
import {
  type IPCRequest,
  type IPCResponse,
  type RequestHandler,
  serializeMessage,
  parseMessage,
  createIPCErrorResponse,
} from './ipc-protocol.js';

export interface IPCServer {
  listen(socketPath: string): Promise<void>;
  close(): Promise<void>;
  onRequest(handler: RequestHandler): void;
}

export function createIPCServer(): IPCServer {
  let server: Server | null = null;
  let requestHandler: RequestHandler | null = null;
  let socketPath: string = '';

  async function cleanupSocket(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch {
      // ソケットファイルが存在しない場合は無視
    }
  }

  function handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        const message = parseMessage(line);
        if (!message) {
          const errorResponse = createIPCErrorResponse('unknown', 'PARSE_ERROR', 'Invalid message format');
          socket.write(serializeMessage(errorResponse));
          continue;
        }

        if (!isIPCRequest(message)) {
          continue;
        }

        if (!requestHandler) {
          const errorResponse = createIPCErrorResponse(message.id, 'NO_HANDLER', 'Request handler is not configured');
          socket.write(serializeMessage(errorResponse));
          continue;
        }

        try {
          const response = await requestHandler(message);
          socket.write(serializeMessage(response));
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          const errorResponse = createIPCErrorResponse(message.id, 'INTERNAL_ERROR', errorMessage);
          socket.write(serializeMessage(errorResponse));
        }
      }
    });

    socket.on('error', () => {
      // クライアント切断などのエラーは無視
    });
  }

  function isIPCRequest(message: unknown): message is IPCRequest {
    return (
      typeof message === 'object' &&
      message !== null &&
      'id' in message &&
      'method' in message &&
      'params' in message
    );
  }

  return {
    async listen(path: string): Promise<void> {
      socketPath = path;
      await cleanupSocket(path);

      return new Promise((resolve, reject) => {
        server = createServer(handleConnection);

        server.on('error', (err) => {
          reject(err);
        });

        server.listen(path, () => {
          resolve();
        });
      });
    },

    async close(): Promise<void> {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }

        server.close(() => {
          cleanupSocket(socketPath).then(() => {
            server = null;
            resolve();
          });
        });
      });
    },

    onRequest(handler: RequestHandler): void {
      requestHandler = handler;
    },
  };
}
