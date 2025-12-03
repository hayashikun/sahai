import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, extname } from "node:path";

export interface Sound {
  name: string;
  path: string;
}

export async function getAvailableSounds(): Promise<Sound[]> {
  const platform = process.platform;

  if (platform === "darwin") {
    // macOS: /System/Library/Sounds/ からサウンドを取得
    const soundDir = "/System/Library/Sounds";
    try {
      const files = await readdir(soundDir);
      return files
        .filter((f) => f.endsWith(".aiff"))
        .map((f) => ({
          name: basename(f, extname(f)),
          path: `${soundDir}/${f}`,
        }));
    } catch {
      return [];
    }
  }

  if (platform === "linux") {
    // Linux: /usr/share/sounds/ から取得（ディストリビューションにより異なる）
    const soundDirs = [
      "/usr/share/sounds/freedesktop/stereo",
      "/usr/share/sounds",
    ];
    const sounds: Sound[] = [];
    for (const dir of soundDirs) {
      try {
        const files = await readdir(dir);
        sounds.push(
          ...files
            .filter((f) => f.endsWith(".ogg") || f.endsWith(".wav"))
            .map((f) => ({
              name: basename(f, extname(f)),
              path: `${dir}/${f}`,
            })),
        );
      } catch {
        // ディレクトリが存在しない場合はスキップ
      }
    }
    return sounds;
  }

  // Windows: 未実装
  return [];
}

export async function playSound(soundName: string): Promise<void> {
  const platform = process.platform;
  const sounds = await getAvailableSounds();
  const sound = sounds.find((s) => s.name === soundName);

  if (!sound) {
    throw new Error(`Sound not found: ${soundName}`);
  }

  if (platform === "darwin") {
    // macOS: afplay コマンドを使用
    return new Promise((resolve, reject) => {
      const proc = spawn("afplay", [sound.path]);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`afplay exited with code ${code}`));
      });
      proc.on("error", reject);
    });
  }

  if (platform === "linux") {
    // Linux: paplay (PulseAudio) または aplay を使用
    return new Promise((resolve, reject) => {
      const proc = spawn("paplay", [sound.path]);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`paplay exited with code ${code}`));
      });
      proc.on("error", (_err) => {
        // paplayが失敗した場合、aplayを試す
        const aplayProc = spawn("aplay", [sound.path]);
        aplayProc.on("close", (aplayCode) => {
          if (aplayCode === 0) resolve();
          else reject(new Error(`aplay exited with code ${aplayCode}`));
        });
        aplayProc.on("error", reject);
      });
    });
  }

  throw new Error(`Unsupported platform: ${platform}`);
}
