import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

const DB_PATH = resolve(import.meta.dirname, "../../data/sahai.db");
const MIGRATIONS_PATH = resolve(import.meta.dirname, "../../drizzle");

function ensureDbDirectory(): void {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function createConnection(): Database.Database {
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
