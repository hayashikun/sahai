#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const defaultPort = process.env.PORT || "49381";
const defaultHost = process.env.HOST || "localhost";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: defaultPort },
    host: { type: "string", short: "H", default: defaultHost },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
  strict: true,
});

if (values.help) {
  console.log(`
sahai - AI Coding Agent Orchestration Tool

Usage:
  sahai [options]

Options:
  -p, --port <port>  Port to run the server on (default: 49831, or PORT env)
  -H, --host <host>  Host to bind the server to (default: localhost, or HOST env)
  -h, --help         Show this help message
  -v, --version      Show version number

Examples:
  sahai                       Start the server on localhost:49831
  sahai -p 8080               Start the server on port 8080
  sahai -H 0.0.0.0            Bind to all interfaces
  sahai -H 0.0.0.0 -p 8080    Bind to all interfaces on port 8080
`);
  process.exit(0);
}

if (values.version) {
  const packageJson = await Bun.file(
    join(dirname(import.meta.dir), "package.json"),
  ).json();
  console.log(`sahai v${packageJson.version}`);
  process.exit(0);
}

const port = Number.parseInt(values.port || defaultPort, 10);
const host = values.host || defaultHost;

// Find the root directory (where package.json is)
const rootDir = dirname(import.meta.dir);
const distDir = join(rootDir, "packages", "frontend", "dist");

// Check if frontend is built
if (!existsSync(distDir)) {
  console.error("Error: Frontend not built. Run 'bun run build' first.");
  process.exit(1);
}

// Set environment variables
process.env.API_PORT = String(port);
process.env.HOST = host;
process.env.SAHAI_STATIC_DIR = distDir;

// Import and start the server
const serverPath = join(rootDir, "packages", "backend", "src", "index.ts");
await import(serverPath);

const url = `http://${host}:${port}`;

console.log(`
  ╭─────────────────────────────────────────╮
  │                                         │
  │   sahai is running!                     │
  │                                         │
  │   Local:  ${url.padEnd(29)} │
  │                                         │
  ╰─────────────────────────────────────────╯
`);
