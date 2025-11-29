# Sahai

A monorepo project with Hono backend and React frontend.

## Structure

```
sahai/
├── backend/   # Hono server (port 3001)
└── frontend/  # React + Vite (port 3000)
```

## Requirements

- [Bun](https://bun.sh/)

## Setup

```bash
bun install
```

## Development

```bash
# Run both backend and frontend
bun run dev

# Run individually
bun run dev:backend
bun run dev:frontend
```

## License

Apache-2.0
