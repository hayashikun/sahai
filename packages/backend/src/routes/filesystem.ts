import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Hono } from "hono";

const app = new Hono();

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
}

async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    const gitDir = join(dirPath, ".git");
    const stats = await stat(gitDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// GET /v1/filesystem/browse - List directory contents
app.get("/browse", async (c) => {
  const queryPath = c.req.query("path");
  const targetPath = queryPath ? resolve(queryPath) : homedir();

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      return c.json({ error: "Path is not a directory" }, 400);
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    const directories: DirectoryEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files/directories except .git check
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        const fullPath = join(targetPath, entry.name);
        const isGitRepo = await isGitRepository(fullPath);
        directories.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          isGitRepo,
        });
      }
    }

    // Sort: git repos first, then alphabetically
    directories.sort((a, b) => {
      if (a.isGitRepo && !b.isGitRepo) return -1;
      if (!a.isGitRepo && b.isGitRepo) return 1;
      return a.name.localeCompare(b.name);
    });

    return c.json({
      currentPath: targetPath,
      parentPath: resolve(targetPath, ".."),
      entries: directories,
    });
  } catch {
    return c.json({ error: "Cannot read directory" }, 400);
  }
});

// GET /v1/filesystem/git-info - Get git repository info
app.get("/git-info", async (c) => {
  const queryPath = c.req.query("path");
  if (!queryPath) {
    return c.json({ error: "Path is required" }, 400);
  }

  const targetPath = resolve(queryPath);

  try {
    const isGitRepo = await isGitRepository(targetPath);
    if (!isGitRepo) {
      return c.json({ error: "Not a git repository" }, 400);
    }

    // Get current branch
    const currentBranchResult =
      await Bun.$`git -C ${targetPath} symbolic-ref --short HEAD`
        .nothrow()
        .quiet();
    const currentBranch =
      currentBranchResult.exitCode === 0
        ? currentBranchResult.text().trim()
        : "main";

    // Get all branches
    const branchesResult =
      await Bun.$`git -C ${targetPath} branch --format='%(refname:short)'`
        .nothrow()
        .quiet();
    const branches =
      branchesResult.exitCode === 0
        ? branchesResult
            .text()
            .trim()
            .split("\n")
            .filter((b) => b.length > 0)
        : [currentBranch];

    return c.json({
      path: targetPath,
      isGitRepo: true,
      currentBranch,
      branches,
    });
  } catch {
    return c.json({ error: "Cannot read git info" }, 400);
  }
});

export default app;
