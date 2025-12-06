import { access, constants } from "node:fs/promises";
import { Hono } from "hono";
import type { Settings, SettingsUpdate } from "../../../shared/index.js";
import { SETTING_KEYS, SETTINGS_DEFAULTS } from "../config/defaults";
import { db } from "../db/client";
import { settings } from "../db/schema";

const app = new Hono();

// Helper to get all settings with defaults
async function getAllSettings(): Promise<Settings> {
  const storedSettings = await db.select().from(settings);
  const settingsMap = new Map(storedSettings.map((s) => [s.key, s.value]));

  const result: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const stored = settingsMap.get(key);
    if (stored !== undefined) {
      // Parse stored value based on the default type
      const defaultValue = SETTINGS_DEFAULTS[key];
      if (typeof defaultValue === "boolean") {
        result[key] = stored === "true";
      } else if (defaultValue === null || typeof defaultValue === "string") {
        result[key] = stored === "null" ? null : stored;
      } else {
        result[key] = stored;
      }
    } else {
      result[key] = SETTINGS_DEFAULTS[key];
    }
  }

  return result as Settings;
}

// GET /v1/settings - Get all settings
app.get("/", async (c) => {
  const allSettings = await getAllSettings();
  return c.json({ settings: allSettings });
});

// PUT /v1/settings - Update settings (partial update)
app.put("/", async (c) => {
  const body = (await c.req.json()) as SettingsUpdate;
  const now = new Date().toISOString();

  // Update only provided keys
  for (const [key, value] of Object.entries(body)) {
    if (SETTING_KEYS.includes(key as keyof Settings)) {
      const stringValue =
        value === null
          ? "null"
          : typeof value === "boolean"
            ? String(value)
            : String(value);

      await db
        .insert(settings)
        .values({ key, value: stringValue, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: stringValue, updatedAt: now },
        });
    }
  }

  const allSettings = await getAllSettings();
  return c.json({ settings: allSettings });
});

// POST /v1/settings/validate-path - Validate a command path
app.post("/validate-path", async (c) => {
  const body = await c.req.json();
  const { path } = body as { path: string };

  if (!path) {
    return c.json({
      valid: false,
      exists: false,
      executable: false,
      error: "Path is required",
    });
  }

  try {
    // Check if path exists and is executable
    await access(path, constants.F_OK);
    const _exists = true;

    try {
      await access(path, constants.X_OK);
      return c.json({
        valid: true,
        exists: true,
        executable: true,
      });
    } catch {
      return c.json({
        valid: false,
        exists: true,
        executable: false,
        error: "File exists but is not executable",
      });
    }
  } catch {
    // Path doesn't exist - try to find it in PATH
    const { execSync } = await import("node:child_process");
    try {
      const result = execSync(`which ${path}`, { encoding: "utf-8" }).trim();
      if (result) {
        return c.json({
          valid: true,
          exists: true,
          executable: true,
        });
      }
    } catch {
      // Command not found in PATH
    }

    return c.json({
      valid: false,
      exists: false,
      executable: false,
      error: "Path does not exist",
    });
  }
});

export default app;
