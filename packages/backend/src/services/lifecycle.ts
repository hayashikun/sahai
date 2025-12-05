import { spawn } from "node:child_process";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { glob } from "glob";

/**
 * Check if a path is a regular file (not a directory, socket, symlink, etc.)
 */
async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Run a lifecycle script in the specified working directory
 * @param script The script content to run
 * @param workingDirectory The directory to run the script in
 * @returns Promise that resolves when script completes, or rejects on error
 */
export function runLifecycleScript(
  script: string,
  workingDirectory: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", script], {
      cwd: workingDirectory,
      env: {
        ...process.env,
        SAHAI_WORKTREE: workingDirectory,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to run script: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Script exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        );
      }
    });
  });
}

/**
 * Copy files from source repository to worktree
 * @param copyFilesSpec Newline-separated list of file paths or glob patterns
 * @param sourceRepoPath The source repository path
 * @param worktreePath The worktree path to copy files to
 */
export async function copyFilesToWorktree(
  copyFilesSpec: string,
  sourceRepoPath: string,
  worktreePath: string,
): Promise<{ copied: string[]; errors: string[] }> {
  const copied: string[] = [];
  const errors: string[] = [];

  const patterns = copyFilesSpec
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  for (const pattern of patterns) {
    try {
      // Use glob to expand patterns
      const matches = await glob(pattern, {
        cwd: sourceRepoPath,
        nodir: true,
        dot: true,
      });

      if (matches.length === 0) {
        // If no glob matches, try as a direct file path
        const sourcePath = join(sourceRepoPath, pattern);
        const destPath = join(worktreePath, pattern);

        try {
          // Skip non-regular files (sockets, symlinks, directories, etc.)
          if (!(await isRegularFile(sourcePath))) {
            errors.push(`${pattern}: not a regular file, skipped`);
            continue;
          }
          // Ensure destination directory exists
          await mkdir(dirname(destPath), { recursive: true });
          await copyFile(sourcePath, destPath);
          copied.push(pattern);
        } catch (e) {
          errors.push(
            `${pattern}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      } else {
        // Copy all matched files
        for (const match of matches) {
          const sourcePath = join(sourceRepoPath, match);
          const destPath = join(worktreePath, match);

          try {
            // Skip non-regular files (sockets, symlinks, directories, etc.)
            if (!(await isRegularFile(sourcePath))) {
              continue; // Silently skip non-regular files in glob matches
            }
            // Ensure destination directory exists
            await mkdir(dirname(destPath), { recursive: true });
            await copyFile(sourcePath, destPath);
            copied.push(match);
          } catch (e) {
            errors.push(
              `${match}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
    } catch (e) {
      errors.push(
        `Pattern ${pattern}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { copied, errors };
}
