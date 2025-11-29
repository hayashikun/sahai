import { $ } from "bun";
import { GitError } from "./git";

export interface Worktree {
  path: string;
  head: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  const result =
    await $`git -C ${repoPath} worktree add ${worktreePath} ${branch}`
      .nothrow()
      .quiet();

  if (result.exitCode !== 0) {
    throw new GitError(
      `Failed to create worktree at '${worktreePath}'`,
      result.stderr.toString(),
    );
  }
}

export async function deleteWorktree(
  repoPath: string,
  worktreePath: string,
  force = false,
): Promise<void> {
  const args = force
    ? ["worktree", "remove", "--force"]
    : ["worktree", "remove"];

  const result = await $`git -C ${repoPath} ${args} ${worktreePath}`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    throw new GitError(
      `Failed to delete worktree at '${worktreePath}'`,
      result.stderr.toString(),
    );
  }
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const result = await $`git -C ${repoPath} worktree list --porcelain`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    throw new GitError("Failed to list worktrees", result.stderr.toString());
  }

  return parseWorktreeList(result.stdout.toString());
}

function parseWorktreeList(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const lines = output.trim().split("\n");

  let current: Partial<Worktree> = {};

  for (const line of lines) {
    if (line === "") {
      if (current.path && current.head) {
        worktrees.push(current as Worktree);
      }
      current = {};
      continue;
    }

    if (line.startsWith("worktree ")) {
      current.path = line.slice(9);
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    }
  }

  if (current.path && current.head) {
    worktrees.push(current as Worktree);
  }

  return worktrees;
}
