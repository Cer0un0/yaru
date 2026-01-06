# yaru

A simple CLI task manager with daemon architecture.

> **yaru** (やる) means "to do" in Japanese.

## Features

- Daemon-based architecture for fast response
- Simple and intuitive commands
- Short ID support (use first few characters)
- Filter and sort tasks
- Search across title and description
- **Subtasks** - Break down complex tasks into smaller units
- **Tree view** - Visualize task hierarchy with progress indicators

## Installation

```bash
# From GitHub
npm install -g git+https://github.com/Cer0un0/yaru.git

# Or clone and link
git clone git@github.com:Cer0un0/yaru.git
cd yaru
npm install
npm run build
npm link
```

## Quick Start

```bash
yaru start                          # Start daemon
yaru add "Buy milk"                 # Add a task
yaru list                           # List tasks
yaru subtask add abc "Get eggs"     # Add subtask to task
yaru subtask done def               # Complete subtask
yaru done abc                       # Complete task (short ID)
yaru stop                           # Stop daemon
```

## Commands

### Daemon Control

| Command | Description |
|---------|-------------|
| `yaru start` | Start the daemon |
| `yaru stop` | Stop the daemon |
| `yaru status` | Show daemon status |

### Task Operations

| Command | Description |
|---------|-------------|
| `yaru add <title>` | Create a new task |
| `yaru list` | List all tasks (tree view) |
| `yaru show <id>` | Show task details with subtasks |
| `yaru update <id>` | Update a task |
| `yaru done <id>` | Mark task as completed |
| `yaru delete <id>` | Delete a task (with subtasks) |
| `yaru search <query>` | Search tasks |

### Subtask Operations

| Command | Description |
|---------|-------------|
| `yaru subtask add <parent-id> <title>` | Add subtask to a task |
| `yaru subtask done <id>` | Mark subtask as completed |
| `yaru subtask delete <id>` | Delete a subtask |

## Options

### add

```bash
yaru add "Task title"
yaru add "Task title" -d "Description"
yaru add "Task title" -p high
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --description <text>` | Task description | - |
| `-p, --priority <level>` | Priority: low, medium, high | medium |

### list

```bash
yaru list
yaru list -s pending
yaru list -p high
yaru list -D                       # Show descriptions
yaru list --sort priority --order asc
```

| Option | Description |
|--------|-------------|
| `-s, --status <status>` | Filter: pending, in_progress, completed |
| `-p, --priority <level>` | Filter: low, medium, high |
| `-D, --desc` | Show task descriptions |
| `--sort <field>` | Sort by: priority, createdAt, updatedAt |
| `--order <order>` | Order: asc, desc |

### update

```bash
yaru update abc -t "New title"
yaru update abc -d "New description"
yaru update abc -p low
```

| Option | Description |
|--------|-------------|
| `-t, --title <title>` | New title |
| `-d, --description <text>` | New description |
| `-p, --priority <level>` | New priority |

### subtask add

```bash
yaru subtask add abc "Subtask title"
yaru subtask add abc "Subtask" -d "Description"
yaru subtask add abc "Subtask" -p high
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --description <text>` | Subtask description | - |
| `-p, --priority <level>` | Priority: low, medium, high | medium |

## Subtasks & Tree View

Tasks can have subtasks to break down complex work:

```bash
# Create a parent task
yaru add "Build API" -d "REST API implementation"

# Add subtasks
yaru subtask add a1b2 "Auth endpoint" -d "JWT authentication"
yaru subtask add a1b2 "User API" -p high
yaru subtask add a1b2 "Settings API"

# View with tree structure
yaru list
```

Output:
```
ID       Pri Status      Title
-------- --- ----------- ------------------
a1b2c3d4 M   pending     Build API [1/3]
  ├ b2c3d4e5 M   completed   Auth endpoint
  ├ c3d4e5f6 H   pending     User API
  └ d4e5f6g7 M   pending     Settings API

Total: 1 task(s), 3 subtask(s)
```

With descriptions (`-D`):
```bash
yaru list -D
```

```
ID       Pri Status      Title
-------- --- ----------- ------------------
a1b2c3d4 M   pending     Build API [1/3]
                         REST API implementation
  ├ b2c3d4e5 M   completed   Auth endpoint
  │                          JWT authentication
  ├ c3d4e5f6 H   pending     User API
  └ d4e5f6g7 M   pending     Settings API

Total: 1 task(s), 3 subtask(s)
```

### Subtask Completion

When all subtasks are completed, you'll be prompted to complete the parent:

```bash
yaru subtask done d4e5
# ✓ Subtask completed
# 💡 All subtasks completed! Consider completing the parent task.
```

### Rules

- Subtasks cannot have their own subtasks (single level only)
- Deleting a parent task deletes all its subtasks
- Subtasks of a completed parent cannot change status

## Short IDs

Task IDs can be abbreviated. Use just the first few characters:

```bash
yaru done a3f      # 3 chars
yaru show a3f9b2   # 6 chars
yaru delete a3f9b2c1  # 8 chars (shown in list)
```

## Data Location

All data is stored in `~/.yaru/`:

```
~/.yaru/
├── data.json      # Task data
├── daemon.pid     # Daemon process info
└── daemon.sock    # Unix socket
```

## License

MIT
