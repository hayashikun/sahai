# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

sahai is an AI Coding Agent orchestration tool that manages Claude Code and Codex agents through a web-based Kanban interface. Each task runs in an isolated Git worktree with real-time log streaming via SSE.

## Commands

```bash
# Install dependencies
bun install

# Development (runs both backend and frontend)
bun run dev

# Run individually
bun run dev:backend   # Hono server on port 3001
bun run dev:frontend  # Vite dev server on port 3000

# Linting and formatting (Biome)
bun run lint          # Lint check
bun run format        # Format files
bun run check         # Lint + format with auto-fix
bun run ci            # CI check (run before commits)

# Database (from backend/)
bun run db:generate   # Generate migration from schema changes
bun run db:migrate    # Apply migrations
bun run db:studio     # Open Drizzle Studio

# Frontend build
bun run --filter frontend build
```

## Architecture

### Monorepo Structure (Bun Workspaces)

- **backend/**: Hono + SQLite (drizzle-orm) API server
- **frontend/**: React + Vite + Jotai
- **shared/**: Shared TypeScript types
