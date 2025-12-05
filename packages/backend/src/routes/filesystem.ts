import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { badRequest } from "../lib/errors";
import {
  type DirectoryEntry,
  findParentGitRepo,
  getGitSubmodules,
  hasSubmodules,
  isGitRepository,
} from "../lib/filesystem";

const app = new Hono();

// GET /v1/filesystem/browse - List directory contents
app.get("/browse", async (c) => {
  const queryPath = c.req.query("path");
  const targetPath = queryPath ? resolve(queryPath) : homedir();

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      return badRequest(c, "Path is not a directory");
    }

    // Check if the target path itself is a git repository
    const isTargetGitRepo = await isGitRepository(targetPath);

    // If target is a git repo, only show submodules (not regular directories)
    if (isTargetGitRepo) {
      const submodules = await getGitSubmodules(targetPath);

      // Determine parent path:
      // - If this is a submodule, parent should be the superproject
      // - Otherwise, parent is the normal parent directory
      const parentRepo = await findParentGitRepo(targetPath);
      const parentPath = parentRepo || resolve(targetPath, "..");

      return c.json({
        currentPath: targetPath,
        parentPath,
        entries: submodules,
      });
    }

    // Normal directory browsing
    const entries = await readdir(targetPath, { withFileTypes: true });
    const directories: DirectoryEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith(".")) {
        continue;
      }

      if (entry.isDirectory()) {
        const fullPath = join(targetPath, entry.name);
        const isGitRepo = await isGitRepository(fullPath);
        const directoryEntry: DirectoryEntry = {
          name: entry.name,
          path: fullPath,
          isDirectory: true,
          isGitRepo,
        };

        // If it's a git repository, check for submodules
        if (isGitRepo) {
          directoryEntry.hasSubmodules = await hasSubmodules(fullPath);
        }

        directories.push(directoryEntry);
      }
    }

    // Sort: git repos first, then alphabetically
    directories.sort((a, b) => {
      if (a.isGitRepo && !b.isGitRepo) {
        return -1;
      }
      if (!a.isGitRepo && b.isGitRepo) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return c.json({
      currentPath: targetPath,
      parentPath: resolve(targetPath, ".."),
      entries: directories,
    });
  } catch {
    return badRequest(c, "Cannot read directory");
  }
});

// GET /v1/filesystem/git-info - Get git repository info
app.get("/git-info", async (c) => {
  const queryPath = c.req.query("path");
  if (!queryPath) {
    return badRequest(c, "Path is required");
  }

  const targetPath = resolve(queryPath);

  try {
    const isGitRepo = await isGitRepository(targetPath);
    if (!isGitRepo) {
      return badRequest(c, "Not a git repository");
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

    // Get remote default branch (falls back to current branch)
    const defaultBranchResult =
      await Bun.$`git -C ${targetPath} symbolic-ref refs/remotes/origin/HEAD`
        .nothrow()
        .quiet();
    const rawDefaultBranch =
      defaultBranchResult.exitCode === 0
        ? defaultBranchResult.text().trim()
        : "";
    const defaultBranch = rawDefaultBranch
      ? rawDefaultBranch.replace(/^refs\/remotes\/origin\//, "")
      : currentBranch;

    // Get all branches and ensure the default branch is present
    const branchesResult =
      await Bun.$`git -C ${targetPath} branch --format='%(refname:short)'`
        .nothrow()
        .quiet();
    const branchesList =
      branchesResult.exitCode === 0
        ? branchesResult
            .text()
            .trim()
            .split("\n")
            .filter((b) => b.length > 0)
        : [currentBranch];
    const branches = Array.from(new Set([...branchesList, defaultBranch]));

    return c.json({
      path: targetPath,
      isGitRepo: true,
      currentBranch,
      defaultBranch,
      branches,
    });
  } catch {
    return badRequest(c, "Cannot read git info");
  }
});

export default app;
