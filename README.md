# Sahai

A monorepo project with Hono backend and React frontend.

## Structure

```
sahai/
├── backend/   # Hono server (port 49382, or API_PORT env)
└── frontend/  # React + Vite (port 49381, or PORT env)
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

- Backend listens on `49382` by default; override with `API_PORT=xxxxx`.
- Frontend dev server listens on `49381` by default; override with `PORT=xxxxx`.
- Frontend API calls target the backend at `VITE_API_BASE_URL` (default `http://localhost:49382`) when not served from the same origin.

## License

Apache-2.0
