import { $ } from "bun";

export class GitError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export async function createBranch(
  repoPath: string,
  branchName: string,
  baseBranch?: string,
): Promise<void> {
  const base = baseBranch ?? "HEAD";

  // Use 'git branch' instead of 'git checkout -b' to avoid checking out the branch
  // This is important because worktree cannot use a branch that is already checked out
  const result = await $`git -C ${repoPath} branch ${branchName} ${base}`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    throw new GitError(
      `Failed to create branch '${branchName}'`,
      result.stderr.toString(),
    );
  }
}

export async function deleteBranch(
  repoPath: string,
  branchName: string,
  force = false,
): Promise<void> {
  const flag = force ? "-D" : "-d";

  const result = await $`git -C ${repoPath} branch ${flag} ${branchName}`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    throw new GitError(
      `Failed to delete branch '${branchName}'`,
      result.stderr.toString(),
    );
  }
}

export async function getDiff(
  repoPath: string,
  baseBranch: string,
  targetBranch: string,
): Promise<string> {
  const result =
    await $`git -C ${repoPath} diff ${baseBranch}...${targetBranch}`
      .nothrow()
      .quiet();

  if (result.exitCode !== 0) {
    throw new GitError(
      `Failed to get diff between '${baseBranch}' and '${targetBranch}'`,
      result.stderr.toString(),
    );
  }

  return result.stdout.toString();
}
