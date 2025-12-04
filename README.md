# Sahai

An AI Coding Agent orchestration tool that manages multiple AI coding agents (Claude Code, GitHub Copilot CLI, Google Gemini, OpenAI Codex) through a web-based Kanban interface. Each task runs in an isolated Git worktree with real-time log streaming.

## Features

- **Kanban Board**: Visual task management with drag-and-drop (TODO → In Progress → In Review → Done)
- **Multi-Agent Support**: Run tasks with Claude Code, GitHub Copilot CLI, Google Gemini, or OpenAI Codex
- **Git Worktree Isolation**: Each task gets its own isolated worktree and branch
- **Real-time Streaming**: Live execution logs via Server-Sent Events (SSE)
- **Session Resume**: Continue interrupted agent sessions
- **Diff Viewer**: Review code changes before merging
- **Quick Access**: Open worktrees directly in file explorer or terminal

## Supported AI Coding Agents

At least one of the following is required:

- [Claude Code](https://www.claude.com/product/claude-code)
- [GitHub Copilot CLI](https://github.com/features/copilot/cli)
- [Google Gemini](https://geminicli.com)
- [OpenAI Codex](https://openai.com/codex/)

## Quick Start

```bash
npx sahai@latest
```

Open `http://localhost:49831` in your browser.

### CLI Options

```bash
npx sahai@latest --port 8080   # Custom port
npx sahai@latest --help        # Show help
npx sahai@latest --version     # Show version
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `49831` | Server port |

## How It Works

1. **Create a Project**: Group related repositories together
2. **Register Repositories**: Add Git repositories to your project
3. **Create Tasks**: Define tasks with a title, description, and select an AI agent executor
4. **Start Task**: Sahai creates an isolated worktree and branch, then launches the AI agent
5. **Monitor Progress**: Watch real-time logs as the agent works
6. **Review Changes**: View diffs, open the worktree in your editor, or resume the agent for refinements
7. **Finish Task**: Clean up the worktree and branch when done

## Task Workflow

```
TODO ──────> In Progress ──────> In Review ──────> Done
     start()              auto/complete()    finish()
              <────────
               resume()
```

- **TODO**: Task created, waiting to start
- **In Progress**: Agent is running (or paused)
- **In Review**: Agent completed, awaiting human review
- **Done**: Task finished, worktree and branch cleaned up

## Development

To contribute to Sahai, you'll need [Bun](https://bun.sh/) (v1.0.0+).

```bash
# Clone the repository
git clone https://github.com/hayashikun/sahai.git
cd sahai
bun install

# Run in development mode (backend + frontend with hot reload)
bun run dev

# Run individually
bun run dev:backend   # Hono server on port 49382
bun run dev:frontend  # Vite dev server on port 49381
```

### Project Structure

```
sahai/
├── packages/
│   ├── backend/    # Hono + SQLite (Drizzle ORM) API server
│   ├── frontend/   # React + Vite + Jotai + Tailwind CSS
│   └── shared/     # Shared TypeScript types and schemas
└── bin/            # CLI entry point
```

### Commands

```bash
# Development
bun run dev              # Run backend + frontend
bun run dev:backend      # Backend only (hot reload)
bun run dev:frontend     # Frontend only (Vite)

# Build
bun run build            # Build frontend for production

# Code Quality (Biome)
bun run lint             # Lint check
bun run format           # Format files
bun run check            # Lint + format with auto-fix
bun run ci               # CI check (run before commits)

# Database (from packages/backend/)
bun run db:generate      # Generate migration from schema changes
bun run db:migrate       # Apply migrations
bun run db:studio        # Open Drizzle Studio
```

### Development Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `49381` | Frontend dev server port |
| `API_PORT` | `49382` | Backend API server port |
| `VITE_API_BASE_URL` | `http://localhost:49382` | API URL for frontend |

## License

Apache-2.0
