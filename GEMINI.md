# GEMINI.md

## Project Overview

This project, "sahai," is an AI Coding Agent orchestration tool. It provides a web-based Kanban interface to manage tasks for AI agents like Claude Code and Codex. Each task is executed in an isolated Git worktree, with real-time log streaming.

The project is a TypeScript monorepo using `bun` as the package manager. It's structured into three main packages:

*   **`packages/backend`**: A Hono server that provides the API. It uses Drizzle ORM for database interactions with SQLite.
*   **`packages/frontend`**: A React application built with Vite. It uses Jotai for state management, React Router for navigation, and Tailwind CSS for styling. The UI includes a Kanban board using `@dnd-kit` and components from Radix UI.
*   **`packages/shared`**: Contains shared TypeScript types and schemas used by both the frontend and backend.

The project is set up with Biome for linting and formatting.

## Building and Running

### Development

To run the project in development mode (with hot-reloading for both backend and frontend):

```bash
bun install
bun run dev
```

The frontend will be available at `http://localhost:49381` and the backend at `http://localhost:49382`.

You can also run the frontend and backend separately:

*   **Backend only**: `bun run dev:backend`
*   **Frontend only**: `bun run dev:frontend`

### Production

To build the frontend for production:

```bash
bun run build
```

To run the application in production mode:

```bash
npx sahai@latest
```

This will start the server on the default port `49831`. You can specify a different port with the `--port` flag.

### Testing

To run the test suites for all packages:

```bash
bun test
```

## Development Conventions

### Code Style

The project uses Biome for code formatting and linting. Before committing, it's recommended to run:

```bash
bun run check
```

This will format and lint the code with auto-fixing. The CI pipeline also runs `bun run ci` to ensure code quality.

### Database Migrations

The backend uses Drizzle ORM. To manage database schemas, use the following commands from the `packages/backend` directory:

*   **Generate a migration**: `bun run db:generate`
*   **Apply migrations**: `bun run db:migrate`
*   **Open Drizzle Studio**: `bun run db:studio`

### Git Workflow

Each task is executed in a separate Git worktree. This isolates the changes for each task. The workflow is managed through the Kanban board:

1.  **TODO**: A new task is created.
2.  **In Progress**: The task is started, and an AI agent begins working on it in a new worktree.
3.  **In Review**: The agent has completed its work, and the changes are ready for review.
4.  **Done**: The task is finished, and the worktree is cleaned up.
