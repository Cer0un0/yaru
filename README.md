# yaru

A simple CLI task manager with daemon architecture.

> **yaru** (やる) means "to do" in Japanese.

## Features

- Daemon-based architecture for fast response
- Simple and intuitive commands
- Short ID support (use first few characters)
- Filter and sort tasks
- Search across title and description

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
yaru start           # Start daemon
yaru add "Buy milk"  # Add a task
yaru list            # List tasks
yaru done abc        # Complete task (short ID)
yaru stop            # Stop daemon
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
| `yaru list` | List all tasks |
| `yaru show <id>` | Show task details |
| `yaru update <id>` | Update a task |
| `yaru done <id>` | Mark task as completed |
| `yaru delete <id>` | Delete a task |
| `yaru search <query>` | Search tasks |

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
yaru list --sort priority --order asc
```

| Option | Description |
|--------|-------------|
| `-s, --status <status>` | Filter: pending, in_progress, completed |
| `-p, --priority <level>` | Filter: low, medium, high |
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
