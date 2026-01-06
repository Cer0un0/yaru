import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createIPCServer, type IPCServer } from './ipc-server.js';
import { createIPCClient, type IPCClient } from './ipc-client.js';
import { createIPCRequest, createIPCResponse } from './ipc-protocol.js';
import { isOk, isErr } from '../domain/types.js';

describe('IPC通信', () => {
  let tempDir: string;
  let socketPath: string;
  let server: IPCServer;
  let client: IPCClient;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ipc-test-'));
    socketPath = join(tempDir, 'test.sock');
    server = createIPCServer();
    client = createIPCClient();
  });

  afterEach(async () => {
    client.disconnect();
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('基本的な通信', () => {
    it('サーバーに接続できる', async () => {
      await server.listen(socketPath);
      const result = await client.connect(socketPath);

      expect(isOk(result)).toBe(true);
      expect(client.isConnected()).toBe(true);
    });

    it('リクエストを送信してレスポンスを受信できる', async () => {
      server.onRequest(async (request) => {
        return createIPCResponse(request.id, { message: 'Hello from server' });
      });
      await server.listen(socketPath);
      await client.connect(socketPath);

      const request = createIPCRequest('daemon.status', {});
      const result = await client.send(request);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.success).toBe(true);
        expect(result.data.data).toEqual({ message: 'Hello from server' });
      }
    });

    it('複数のリクエストを順番に処理できる', async () => {
      let counter = 0;
      server.onRequest(async (request) => {
        counter++;
        return createIPCResponse(request.id, { count: counter });
      });
      await server.listen(socketPath);
      await client.connect(socketPath);

      const result1 = await client.send(createIPCRequest('daemon.status', {}));
      const result2 = await client.send(createIPCRequest('daemon.status', {}));

      expect(isOk(result1) && isOk(result2)).toBe(true);
      if (isOk(result1) && isOk(result2)) {
        expect((result1.data.data as { count: number }).count).toBe(1);
        expect((result2.data.data as { count: number }).count).toBe(2);
      }
    });
  });

  describe('エラーハンドリング', () => {
    it('サーバーが起動していない場合、接続エラーを返す', async () => {
      const result = await client.connect(socketPath);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('CONNECTION_FAILED');
      }
    });

    it('未接続状態でリクエストを送信するとエラーを返す', async () => {
      const request = createIPCRequest('daemon.status', {});
      const result = await client.send(request);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('CONNECTION_FAILED');
      }
    });
  });
});
