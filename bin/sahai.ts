#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const defaultPort = process.env.PORT || "49831";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: defaultPort },
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
  -h, --help         Show this help message
  -v, --version      Show version number

Examples:
  sahai              Start the server on port 49831
  sahai -p 8080      Start the server on port 8080
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

// Find the root directory (where package.json is)
const rootDir = dirname(import.meta.dir);
const distDir = join(rootDir, "packages", "frontend", "dist");

// Check if frontend is built
if (!existsSync(distDir)) {
  console.error("Error: Frontend not built. Run 'bun run build' first.");
  process.exit(1);
}

// Set environment variables
process.env.SAHAI_PORT = String(port);
process.env.SAHAI_STATIC_DIR = distDir;

// Import and start the server
const serverPath = join(rootDir, "packages", "backend", "src", "index.ts");
await import(serverPath);

console.log(`
  ╭─────────────────────────────────────╮
  │                                     │
  │   sahai is running!                 │
  │                                     │
  │   Local:  http://localhost:${port.toString().padEnd(5)} │
  │                                     │
  ╰─────────────────────────────────────╯
`);
