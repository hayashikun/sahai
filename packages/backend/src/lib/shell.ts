/**
 * Cross-platform shell utilities for opening files/directories in terminal and file explorer
 */

import { resolve } from "node:path";
import { getTerminalConfig } from "../config/terminal";

async function runCommand(
  command: string[],
  errorMessage: string,
): Promise<void> {
  try {
    const process = Bun.spawn(command, {
      stdout: "ignore",
      stderr: "pipe",
    });
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(process.stderr).text();
      throw new Error(stderr || `Command exited with code ${exitCode}`);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error: ${String(error)}`;
    throw new Error(`${errorMessage}: ${message}`);
  }
}

function escapeShellPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

/**
 * Open a path in the system's file explorer (Finder on macOS, Explorer on Windows, etc.)
 */
export async function openInFileExplorer(path: string): Promise<void> {
  const normalizedPath = resolve(path);
  const platform = process.platform;

  if (platform === "darwin") {
    await runCommand(["open", normalizedPath], "Failed to open in Finder");
    return;
  }

  if (platform === "win32") {
    await runCommand(
      ["explorer", normalizedPath],
      "Failed to open in Explorer",
    );
    return;
  }

  await runCommand(
    ["xdg-open", normalizedPath],
    "Failed to open in file explorer",
  );
}

/**
 * Open a path in the system's terminal application
 * Supports macOS, Windows, and Linux with configurable terminal settings
 */
export async function openInTerminal(path: string): Promise<void> {
  const normalizedPath = resolve(path);
  const platform = process.platform;
  const terminalConfig = await getTerminalConfig();

  if (platform === "darwin") {
    const terminalApp = terminalConfig.macosApp || "Terminal";
    await runCommand(
      ["open", "-a", terminalApp, normalizedPath],
      `Failed to open ${terminalApp}`,
    );
    return;
  }

  if (platform === "win32") {
    const escapedPath = normalizedPath.replace(/'/g, "''");
    await runCommand(
      [
        "powershell",
        "-NoProfile",
        "-Command",
        `Start-Process powershell -WorkingDirectory '${escapedPath}'`,
      ],
      "Failed to open terminal",
    );
    return;
  }

  const customCommand = terminalConfig.linuxCommand;
  if (customCommand) {
    const escapedPath = escapeShellPath(normalizedPath);
    const rendered = customCommand.replaceAll("{path}", `'${escapedPath}'`);
    await runCommand(["bash", "-lc", rendered], "Failed to open terminal");
    return;
  }

  const candidates: string[][] = [
    ["gnome-terminal", "--working-directory", normalizedPath],
    ["konsole", "--workdir", normalizedPath],
    ["xfce4-terminal", "--working-directory", normalizedPath],
    ["x-terminal-emulator", "--working-directory", normalizedPath],
    ["alacritty", "--working-directory", normalizedPath],
  ];

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      await runCommand(candidate, "Failed to open terminal");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    lastError?.message ??
      "No supported terminal launcher found. Configure in Settings.",
  );
}
