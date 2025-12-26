/**
 * Cross-platform desktop notification utility
 * Uses osascript on macOS and notify-send on Linux
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Show a desktop notification
 * @param title - Notification title
 * @param message - Notification body message
 */
export async function showDesktopNotification(
  title: string,
  message: string,
): Promise<void> {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS: use osascript
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedMessage = message.replace(/"/g, '\\"');
      await execAsync(
        `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}"'`,
      );
    } else if (platform === "linux") {
      // Linux: use notify-send
      const escapedTitle = title.replace(/'/g, "'\\''");
      const escapedMessage = message.replace(/'/g, "'\\''");
      await execAsync(`notify-send '${escapedTitle}' '${escapedMessage}'`);
    }
    // Windows and other platforms: silently skip
  } catch (error) {
    // Silently ignore errors - notification is not critical
    console.error("Failed to show desktop notification:", error);
  }
}

/**
 * Show task completion notification
 * @param taskTitle - Title of the completed task
 */
export async function showTaskCompletedNotification(
  taskTitle: string,
): Promise<void> {
  await showDesktopNotification(
    "Task Completed",
    `"${taskTitle}" moved to In Review`,
  );
}
