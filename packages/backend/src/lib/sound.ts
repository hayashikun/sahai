/**
 * Cross-platform sound notification utility
 * Supports macOS, Linux, and Windows
 */

import { platform } from "node:os";

type SoundType = "success" | "error";

interface PlatformSoundConfig {
  command: string[];
  successSound: string;
  errorSound: string;
}

function getPlatformConfig(): PlatformSoundConfig | null {
  const os = platform();

  switch (os) {
    case "darwin":
      // macOS: use afplay with system sounds
      return {
        command: ["afplay"],
        successSound: "/System/Library/Sounds/Glass.aiff",
        errorSound: "/System/Library/Sounds/Basso.aiff",
      };
    case "linux":
      // Linux: use paplay (PulseAudio) with freedesktop sounds
      return {
        command: ["paplay"],
        successSound: "/usr/share/sounds/freedesktop/stereo/complete.oga",
        errorSound: "/usr/share/sounds/freedesktop/stereo/dialog-error.oga",
      };
    case "win32":
      // Windows: use PowerShell to play system sounds
      return {
        command: ["powershell", "-c"],
        successSound: "[System.Media.SystemSounds]::Asterisk.Play()",
        errorSound: "[System.Media.SystemSounds]::Hand.Play()",
      };
    default:
      return null;
  }
}

/**
 * Play a system sound asynchronously
 * @param type - The type of sound to play ('success' or 'error')
 */
export async function playSound(type: SoundType): Promise<void> {
  const config = getPlatformConfig();
  if (!config) {
    // Unsupported platform - silently skip
    return;
  }

  try {
    const sound = type === "success" ? config.successSound : config.errorSound;
    const os = platform();

    let cmd: string[];
    if (os === "win32") {
      // Windows: PowerShell command is the sound itself
      cmd = [...config.command, sound];
    } else {
      // macOS/Linux: command followed by sound file path
      cmd = [...config.command, sound];
    }

    const process = Bun.spawn(cmd, {
      stdout: "ignore",
      stderr: "ignore",
    });
    // Don't await - let sound play in background without blocking
    process.exited.catch(() => {
      // Ignore errors (e.g., sound file not found, command not available)
    });
  } catch {
    // Ignore errors silently - sound notification is not critical
  }
}

/**
 * Play success sound (task completed)
 */
export function playSuccessSound(): void {
  playSound("success");
}

/**
 * Play error sound
 */
export function playErrorSound(): void {
  playSound("error");
}
