import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

const DB_PATH =
  process.env.DB_PATH ?? resolve(import.meta.dirname, "../../data/sahai.db");
const MIGRATIONS_PATH = resolve(import.meta.dirname, "../../drizzle");

function ensureDbDirectory(): void {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function createConnection(): Database {
  ensureDbDirectory();
  return new Database(DB_PATH);
}

const sqlite = createConnection();
export const db = drizzle(sqlite, { schema });

export function runMigrations(): void {
  migrate(db, { migrationsFolder: MIGRATIONS_PATH });
}

export function closeConnection(): void {
  sqlite.close();
}
