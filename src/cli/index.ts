#!/usr/bin/env node
import { Command } from 'commander';
import { createDaemonManager, SOCKET_PATH } from '../infrastructure/daemon.js';
import { createIPCClient } from '../infrastructure/ipc-client.js';
import { createIPCRequest, type IPCResponse } from '../infrastructure/ipc-protocol.js';
import { isOk } from '../domain/types.js';
import { type Task } from '../domain/types.js';

const VERSION = '1.0.0';

const program = new Command();

program
  .name('yaru')
  .description('A simple CLI task manager')
  .version(VERSION, '-v, --version', 'Show version');

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_SYNTAX_ERROR = 2;
const EXIT_CONNECTION_ERROR = 3;

// Output utilities
function printSuccess(message: string): void {
  console.log(`✓ ${message}`);
}

function printError(message: string): void {
  console.error(`✗ ${message}`);
}

function printTask(task: Task): void {
  const statusIcon = task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○';
  const priorityColor = task.priority === 'high' ? '!' : task.priority === 'medium' ? '-' : ' ';
  console.log(`[${priorityColor}] ${statusIcon} ${task.id.slice(0, 8)} ${task.title}`);
}

function printTaskDetail(task: Task): void {
  console.log(`ID:          ${task.id}`);
  console.log(`Title:       ${task.title}`);
  if (task.description) {
    console.log(`Description: ${task.description}`);
  }
  console.log(`Status:      ${task.status}`);
  console.log(`Priority:    ${task.priority}`);
  console.log(`Created:     ${new Date(task.createdAt).toLocaleString()}`);
  console.log(`Updated:     ${new Date(task.updatedAt).toLocaleString()}`);
  if (task.startedAt) {
    console.log(`Started:     ${new Date(task.startedAt).toLocaleString()}`);
  }
  if (task.completedAt) {
    console.log(`Completed:   ${new Date(task.completedAt).toLocaleString()}`);
  }
}

function printTaskTable(tasks: Task[]): void {
  if (tasks.length === 0) {
    console.log('No tasks found');
    return;
  }

  console.log('ID       Pri Status      Title');
  console.log('-------- --- ----------- ------------------');
  for (const task of tasks) {
    const id = task.id.slice(0, 8);
    const priority = task.priority === 'high' ? 'H' : task.priority === 'medium' ? 'M' : 'L';
    const status = task.status === 'completed' ? 'completed' : task.status === 'in_progress' ? 'in_progress' : 'pending';
    console.log(`${id} ${priority.padEnd(3)} ${status.padEnd(11)} ${task.title}`);
  }
  console.log(`\nTotal: ${tasks.length} task(s)`);
}

async function sendRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<IPCResponse<T> | null> {
  const client = createIPCClient();
  const connectResult = await client.connect(SOCKET_PATH);

  if (!isOk(connectResult)) {
    printError('Cannot connect to daemon. Run `yaru start` first.');
    process.exit(EXIT_CONNECTION_ERROR);
    return null;
  }

  const request = createIPCRequest(method as any, params);
  const result = await client.send<T>(request);
  client.disconnect();

  if (!isOk(result)) {
    printError(`Communication error: ${result.error.type}`);
    process.exit(EXIT_ERROR);
    return null;
  }

  return result.data;
}

// Daemon commands
program
  .command('start')
  .description('Start the daemon')
  .action(async () => {
    const daemon = createDaemonManager();
    const result = await daemon.start();

    if (isOk(result)) {
      printSuccess(`Daemon started (PID: ${result.data.pid})`);
      process.exit(EXIT_SUCCESS);
    } else if (result.error.type === 'ALREADY_RUNNING') {
      printSuccess(`Daemon already running (PID: ${result.error.pid})`);
      process.exit(EXIT_SUCCESS);
    } else {
      printError(`Failed to start daemon: ${result.error.type}`);
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('stop')
  .description('Stop the daemon')
  .action(async () => {
    const daemon = createDaemonManager();
    const result = await daemon.stop();

    if (isOk(result)) {
      printSuccess('Daemon stopped');
      process.exit(EXIT_SUCCESS);
    } else if (result.error.type === 'NOT_RUNNING') {
      printSuccess('Daemon is not running');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(`Failed to stop daemon: ${result.error.type}`);
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('status')
  .description('Show daemon status')
  .action(async () => {
    const daemon = createDaemonManager();
    const result = await daemon.status();

    if (isOk(result)) {
      if (result.data.running) {
        console.log('Daemon:  running');
        console.log(`PID:     ${result.data.info.pid}`);
        console.log(`Socket:  ${result.data.info.socketPath}`);
        console.log(`Started: ${new Date(result.data.info.startedAt).toLocaleString()}`);
      } else {
        console.log('Daemon: stopped');
      }
      process.exit(EXIT_SUCCESS);
    } else {
      printError('Failed to get status');
      process.exit(EXIT_ERROR);
    }
  });

// Task commands
program
  .command('add <title>')
  .description('Create a new task')
  .option('-d, --description <desc>', 'Task description')
  .option('-p, --priority <level>', 'Priority (low|medium|high)', 'medium')
  .action(async (title, options) => {
    const response = await sendRequest<Task>('task.create', {
      title,
      description: options.description,
      priority: options.priority,
    });

    if (response?.success) {
      printSuccess(`Task created: ${response.data!.id.slice(0, 8)}`);
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to create task');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('list')
  .description('List all tasks')
  .option('-s, --status <status>', 'Filter by status (pending|in_progress|completed)')
  .option('-p, --priority <level>', 'Filter by priority (low|medium|high)')
  .option('--sort <field>', 'Sort by (priority|createdAt|updatedAt)')
  .option('--order <order>', 'Sort order (asc|desc)', 'desc')
  .action(async (options) => {
    const response = await sendRequest<Task[]>('task.list', {
      status: options.status,
      priority: options.priority,
      sortBy: options.sort,
      sortOrder: options.order,
    });

    if (response?.success) {
      printTaskTable(response.data!);
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to list tasks');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('show <id>')
  .description('Show task details')
  .action(async (id) => {
    const response = await sendRequest<Task>('task.get', { id });

    if (response?.success) {
      printTaskDetail(response.data!);
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Task not found');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('update <id>')
  .description('Update a task')
  .option('-t, --title <title>', 'New title')
  .option('-d, --description <desc>', 'New description')
  .option('-p, --priority <level>', 'New priority (low|medium|high)')
  .action(async (id, options) => {
    const response = await sendRequest<Task>('task.update', {
      id,
      title: options.title,
      description: options.description,
      priority: options.priority,
    });

    if (response?.success) {
      printSuccess('Task updated');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to update task');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('done <id>')
  .description('Mark task as completed')
  .action(async (id) => {
    const response = await sendRequest<Task>('task.updateStatus', {
      id,
      status: 'completed',
    });

    if (response?.success) {
      printSuccess('Task completed');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to update status');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('delete <id>')
  .description('Delete a task')
  .action(async (id) => {
    const response = await sendRequest<{ success: boolean }>('task.delete', { id });

    if (response?.success) {
      printSuccess('Task deleted');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to delete task');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('search <query>')
  .description('Search tasks')
  .action(async (query) => {
    const response = await sendRequest<Task[]>('task.search', { query });

    if (response?.success) {
      if (response.data!.length === 0) {
        console.log('No matching tasks found');
      } else {
        printTaskTable(response.data!);
      }
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Search failed');
      process.exit(EXIT_ERROR);
    }
  });

// Error handling
program.showHelpAfterError(true);
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
});

program.parse();
