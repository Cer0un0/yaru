import { createIPCServer } from './ipc-server.js';
import { createStorageService } from './storage.js';
import { createTaskService } from '../domain/task-service.js';
import { createRequestHandler } from './daemon.js';

const dataDir = process.env.YARU_DATA_DIR ?? '';
const socketPath = process.env.YARU_SOCKET_PATH ?? '';

if (!dataDir || !socketPath) {
  console.error('YARU_DATA_DIR and YARU_SOCKET_PATH must be set');
  process.exit(1);
}

async function main() {
  const storageService = createStorageService(dataDir);
  const taskService = createTaskService(storageService);
  const server = createIPCServer();

  server.onRequest(createRequestHandler(taskService));

  await server.listen(socketPath);
  console.log(`Daemon started on ${socketPath}`);

  // グレースフルシャットダウン
  const shutdown = async () => {
    console.log('Shutting down...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start daemon:', err);
  process.exit(1);
});
