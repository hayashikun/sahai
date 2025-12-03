import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";
import { TERMINAL_DEFAULTS } from "./defaults";

export interface TerminalConfig {
  macosApp: string;
  linuxCommand: string | null;
}

export async function getTerminalConfig(): Promise<TerminalConfig> {
  const [macosAppSetting, linuxCommandSetting] = await Promise.all([
    db.select().from(settings).where(eq(settings.key, "terminal.macosApp")),
    db.select().from(settings).where(eq(settings.key, "terminal.linuxCommand")),
  ]);

  return {
    macosApp:
      macosAppSetting.length > 0
        ? macosAppSetting[0].value
        : TERMINAL_DEFAULTS.macosApp,
    linuxCommand:
      linuxCommandSetting.length > 0 && linuxCommandSetting[0].value !== "null"
        ? linuxCommandSetting[0].value
        : TERMINAL_DEFAULTS.linuxCommand,
  };
}
