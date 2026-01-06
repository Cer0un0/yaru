#!/usr/bin/env node
import { Command } from 'commander';
import { createDaemonManager, SOCKET_PATH } from '../infrastructure/daemon.js';
import { createIPCClient } from '../infrastructure/ipc-client.js';
import { createIPCRequest, type IPCResponse } from '../infrastructure/ipc-protocol.js';
import { isOk } from '../domain/types.js';
import { type Task } from '../domain/types.js';
import { type SubtaskProgress, type TaskWithAllSubtasksCompleted } from '../domain/task-service.js';

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

// ANSI color utilities
const colors = {
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
};

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

interface TaskWithProgress extends Task {
  subtaskProgress?: SubtaskProgress;
}

function wrapText(text: string, maxWidth: number, indent: string): string {
  if (text.length <= maxWidth) {
    return text;
  }

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      lines.push(remaining);
      break;
    }

    // 最大幅以内で最後のスペースを探す
    let breakPoint = remaining.lastIndexOf(' ', maxWidth);
    if (breakPoint === -1 || breakPoint === 0) {
      breakPoint = maxWidth;
    }

    lines.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return lines.join('\n' + indent);
}

function printTaskTableWithTree(tasks: Task[], showDesc: boolean = false): void {
  if (tasks.length === 0) {
    console.log('No tasks found');
    return;
  }

  // 親タスクとサブタスクを分離
  const parentTasks = tasks.filter(t => !t.parentId);
  const subtasksByParent = new Map<string, Task[]>();

  for (const task of tasks) {
    if (task.parentId) {
      const existing = subtasksByParent.get(task.parentId) || [];
      existing.push(task);
      subtasksByParent.set(task.parentId, existing);
    }
  }

  console.log('ID       Pri Status      Title');
  console.log('-------- --- ----------- ------------------');

  // ターミナル幅を取得（デフォルト80）
  const termWidth = process.stdout.columns || 80;
  // 固定部分の幅: ID(8) + space(1) + Pri(3) + space(1) + Status(11) + space(1) = 25
  const fixedWidth = 25;
  const descIndent = ' '.repeat(fixedWidth);

  let taskCount = 0;
  let subtaskCount = 0;

  // カラー付きの優先度・ステータス文字列を生成
  const formatPriority = (p: string): string => {
    const char = p === 'high' ? 'H' : p === 'medium' ? 'M' : 'L';
    const padded = char.padEnd(3);
    return p === 'high' ? colors.red(padded) : padded;
  };

  const formatStatus = (s: string): string => {
    const padded = s.padEnd(11);
    return s === 'in_progress' ? colors.yellow(padded) : padded;
  };

  for (const task of parentTasks) {
    const id = task.id.slice(0, 8);
    const priority = formatPriority(task.priority);
    const status = formatStatus(task.status);

    const subtasks = subtasksByParent.get(task.id) || [];
    const progressStr = subtasks.length > 0
      ? ` [${subtasks.filter(s => s.status === 'completed').length}/${subtasks.length}]`
      : '';

    const titlePart = `${task.title}${progressStr}`;

    if (showDesc && task.description) {
      const titleWidth = titlePart.length;
      const availableWidth = termWidth - fixedWidth - titleWidth - 3; // " - " の分
      if (availableWidth > 10) {
        const wrappedDesc = wrapText(task.description, availableWidth, descIndent + ' '.repeat(titleWidth + 3));
        console.log(`${id} ${priority} ${status} ${titlePart} - ${wrappedDesc}`);
      } else {
        // 幅が狭すぎる場合は次の行に説明を表示
        console.log(`${id} ${priority} ${status} ${titlePart}`);
        const wrappedDesc = wrapText(task.description, termWidth - fixedWidth, descIndent);
        console.log(`${descIndent}${wrappedDesc}`);
      }
    } else {
      console.log(`${id} ${priority} ${status} ${titlePart}`);
    }

    taskCount++;

    // サブタスクを表示
    const subFixedWidth = fixedWidth + 4; // prefix "  └ " の分
    const subDescIndent = ' '.repeat(subFixedWidth);

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      const isLast = i === subtasks.length - 1;
      const prefix = isLast ? '  └' : '  ├';
      const subId = subtask.id.slice(0, 8);
      const subPriority = formatPriority(subtask.priority);
      const subStatus = formatStatus(subtask.status);

      if (showDesc && subtask.description) {
        const subTitleWidth = subtask.title.length;
        const subAvailableWidth = termWidth - subFixedWidth - subTitleWidth - 3;
        if (subAvailableWidth > 10) {
          const wrappedDesc = wrapText(subtask.description, subAvailableWidth, subDescIndent + ' '.repeat(subTitleWidth + 3));
          console.log(`${prefix} ${subId} ${subPriority} ${subStatus} ${subtask.title} - ${wrappedDesc}`);
        } else {
          console.log(`${prefix} ${subId} ${subPriority} ${subStatus} ${subtask.title}`);
          const wrappedDesc = wrapText(subtask.description, termWidth - subFixedWidth, subDescIndent);
          console.log(`${subDescIndent}${wrappedDesc}`);
        }
      } else {
        console.log(`${prefix} ${subId} ${subPriority} ${subStatus} ${subtask.title}`);
      }

      subtaskCount++;
    }
  }

  if (subtaskCount > 0) {
    console.log(`\nTotal: ${taskCount} task(s), ${subtaskCount} subtask(s)`);
  } else {
    console.log(`\nTotal: ${taskCount} task(s)`);
  }
}

function printTaskTable(tasks: Task[]): void {
  printTaskTableWithTree(tasks, false);
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
  .option('-D, --desc', 'Show task descriptions')
  .action(async (options) => {
    const response = await sendRequest<Task[]>('task.list', {
      status: options.status,
      priority: options.priority,
      sortBy: options.sort,
      sortOrder: options.order,
    });

    if (response?.success) {
      printTaskTableWithTree(response.data!, options.desc || false);
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to list tasks');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('show <id>')
  .description('Show task details')
  .option('-D, --desc', 'Show task descriptions')
  .action(async (id, options) => {
    const response = await sendRequest<Task>('task.get', { id });

    if (response?.success) {
      const task = response.data!;
      printTaskDetail(task);

      // 親タスクの場合、サブタスク一覧と進捗を表示
      if (!task.parentId) {
        const subtasksResponse = await sendRequest<Task[]>('subtask.list', { parentId: task.id });
        const progressResponse = await sendRequest<SubtaskProgress>('subtask.progress', { parentId: task.id });

        if (subtasksResponse?.success && progressResponse?.success) {
          const subtasks = subtasksResponse.data!;
          const progress = progressResponse.data!;

          if (subtasks.length > 0) {
            console.log('');
            console.log(`Subtasks:    ${progress.completed}/${progress.total} (${progress.percentage}%)`);
            for (let i = 0; i < subtasks.length; i++) {
              const subtask = subtasks[i];
              const isLast = i === subtasks.length - 1;
              const prefix = isLast ? '└' : '├';
              const statusIcon = subtask.status === 'completed' ? '✓' : subtask.status === 'in_progress' ? '▶' : '○';
              console.log(`  ${prefix} ${statusIcon} ${subtask.id.slice(0, 8)} ${subtask.title}`);
              if (options.desc && subtask.description) {
                const descPrefix = isLast ? ' ' : '│';
                console.log(`  ${descPrefix}   ${subtask.description}`);
              }
            }
          }
        }
      }

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
  .command('begin <id>')
  .description('Begin working on a task (set to in_progress)')
  .action(async (id) => {
    const response = await sendRequest<Task>('task.updateStatus', {
      id,
      status: 'in_progress',
    });

    if (response?.success) {
      printSuccess('Task begun');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to begin task');
      process.exit(EXIT_ERROR);
    }
  });

program
  .command('reopen <id>')
  .description('Reopen a task (set to pending)')
  .action(async (id) => {
    const response = await sendRequest<Task>('task.updateStatus', {
      id,
      status: 'pending',
    });

    if (response?.success) {
      printSuccess('Task reopened');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to reopen task');
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
  .option('-D, --desc', 'Show task descriptions')
  .action(async (query, options) => {
    const response = await sendRequest<Task[]>('task.search', { query });

    if (response?.success) {
      if (response.data!.length === 0) {
        console.log('No matching tasks found');
      } else {
        printTaskTableWithTree(response.data!, options.desc || false);
      }
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Search failed');
      process.exit(EXIT_ERROR);
    }
  });

// Subtask commands
const subtaskCmd = program
  .command('subtask')
  .description('Manage subtasks');

subtaskCmd
  .command('add <parent-id> <title>')
  .description('Add a subtask to a parent task')
  .option('-d, --description <desc>', 'Subtask description')
  .option('-p, --priority <level>', 'Priority (low|medium|high)', 'medium')
  .action(async (parentId, title, options) => {
    const response = await sendRequest<Task>('subtask.create', {
      parentId,
      title,
      description: options.description,
      priority: options.priority,
    });

    if (response?.success) {
      printSuccess(`Subtask created: ${response.data!.id.slice(0, 8)}`);
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to create subtask');
      process.exit(EXIT_ERROR);
    }
  });

subtaskCmd
  .command('done <subtask-id>')
  .description('Mark a subtask as completed')
  .action(async (subtaskId) => {
    const response = await sendRequest<TaskWithAllSubtasksCompleted>('task.updateStatus', {
      id: subtaskId,
      status: 'completed',
    });

    if (response?.success) {
      const task = response.data as TaskWithAllSubtasksCompleted;
      printSuccess('Subtask completed');
      if (task.allSubtasksCompleted) {
        console.log('💡 All subtasks completed! Consider completing the parent task.');
      }
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to complete subtask');
      process.exit(EXIT_ERROR);
    }
  });

subtaskCmd
  .command('delete <subtask-id>')
  .description('Delete a subtask')
  .action(async (subtaskId) => {
    const response = await sendRequest<{ success: boolean }>('task.delete', { id: subtaskId });

    if (response?.success) {
      printSuccess('Subtask deleted');
      process.exit(EXIT_SUCCESS);
    } else {
      printError(response?.error?.message ?? 'Failed to delete subtask');
      process.exit(EXIT_ERROR);
    }
  });

// Error handling
program.showHelpAfterError(true);
program.configureOutput({
  writeErr: (str) => process.stderr.write(str),
});

program.parse();
