/**
 * Cross-platform sound notification utility
 * Now uses settings for notification configuration
 */

import { getNotificationConfig } from "../config/notification";
import { playSound as playSoundByName } from "../config/sounds";

/**
 * Play notification sound based on settings
 * @param trigger - The event trigger type ('completed' or 'failed')
 */
export async function playNotificationSound(
  trigger: "completed" | "failed",
): Promise<void> {
  try {
    const config = await getNotificationConfig();

    // Check if notifications are enabled
    if (!config.enabled) {
      return;
    }

    // Check if this trigger should play sound
    const shouldPlay = config.trigger === "all" || config.trigger === trigger;

    if (!shouldPlay) {
      return;
    }

    // Play the configured sound
    if (config.sound) {
      await playSoundByName(config.sound);
    }
  } catch (error) {
    // Silently ignore errors - sound notification is not critical
    console.error("Failed to play notification sound:", error);
  }
}

/**
 * Play success sound (task completed)
 */
export function playSuccessSound(): void {
  playNotificationSound("completed");
}

/**
 * Play error sound
 */
export function playErrorSound(): void {
  playNotificationSound("failed");
}
