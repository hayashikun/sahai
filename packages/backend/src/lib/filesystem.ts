import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
  isSubmodule?: boolean;
  hasSubmodules?: boolean;
}

export async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    const gitDir = join(dirPath, ".git");
    const stats = await stat(gitDir);
    // .git can be a directory (normal repo) or a file (submodule/worktree)
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

// Parse .gitmodules file to get submodule paths
async function parseGitmodules(repoPath: string): Promise<string[]> {
  try {
    const gitmodulesPath = join(repoPath, ".gitmodules");
    const content = await readFile(gitmodulesPath, "utf-8");

    // Match "path = <submodule-path>" lines
    const pathRegex = /^\s*path\s*=\s*(.+?)\s*$/gm;
    const matches = content.matchAll(pathRegex);
    return Array.from(matches, (m) => m[1]);
  } catch {
    // No .gitmodules file or can't read it
    return [];
  }
}

export async function getGitSubmodules(
  repoPath: string,
): Promise<DirectoryEntry[]> {
  const submodulePaths = await parseGitmodules(repoPath);
  const submodules: DirectoryEntry[] = [];

  for (const submodulePath of submodulePaths) {
    const fullPath = join(repoPath, submodulePath);
    const name = submodulePath.split("/").pop() || submodulePath;

    try {
      const stats = await stat(fullPath);
      if (stats.isDirectory()) {
        const isGit = await isGitRepository(fullPath);
        // Check if submodule has its own submodules
        const nestedPaths = isGit ? await parseGitmodules(fullPath) : [];
        submodules.push({
          name,
          path: fullPath,
          isDirectory: true,
          isGitRepo: isGit,
          isSubmodule: true,
          hasSubmodules: nestedPaths.length > 0,
        });
      }
    } catch {
      // Submodule directory doesn't exist or isn't accessible
    }
  }

  return submodules;
}

// Find parent git repository by checking if .git is a file pointing to parent
export async function findParentGitRepo(
  dirPath: string,
): Promise<string | null> {
  try {
    const gitPath = join(dirPath, ".git");
    const stats = await stat(gitPath);

    if (stats.isFile()) {
      // .git file contains "gitdir: <path>" - parse to find parent
      const content = await readFile(gitPath, "utf-8");
      const match = content.match(/^gitdir:\s*(.+?)\s*$/m);
      if (match?.[1]) {
        // gitdir points to .git/modules/<name>, so parent repo is 2+ levels up
        // e.g., "../.git/modules/submodule" -> parent is "../"
        const gitdir = resolve(dirPath, match[1]);
        // Find the .git directory (parent of modules)
        let current = gitdir;
        while (current && !current.endsWith(".git")) {
          current = dirname(current);
        }
        if (current.endsWith(".git")) {
          return dirname(current); // Return the repo root, not .git
        }
      }
    }
  } catch {
    // Not a submodule or can't read .git file
  }
  return null;
}

export async function hasSubmodules(repoPath: string): Promise<boolean> {
  const paths = await parseGitmodules(repoPath);
  return paths.length > 0;
}
