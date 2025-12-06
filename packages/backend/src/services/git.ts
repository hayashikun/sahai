import { existsSync } from "node:fs";
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
  options?: { worktreePath?: string },
): Promise<string> {
  const useWorktree = options?.worktreePath && existsSync(options.worktreePath);

  const baseDiff = useWorktree
    ? await $`git -C ${options.worktreePath} diff ${baseBranch}`
        .nothrow()
        .quiet()
    : await $`git -C ${repoPath} diff ${baseBranch}...${targetBranch}`
        .nothrow()
        .quiet();

  const hasError = (code: number) => code !== 0 && code !== 1;

  if (hasError(baseDiff.exitCode)) {
    throw new GitError(
      `Failed to get diff between '${baseBranch}' and '${targetBranch}'`,
      baseDiff.stderr.toString(),
    );
  }

  if (!useWorktree) {
    return baseDiff.stdout.toString();
  }

  // Include untracked files from the worktree (git diff --no-index returns 1 when diffs exist)
  const untrackedResult =
    await $`git -C ${options.worktreePath} ls-files --others --exclude-standard`
      .nothrow()
      .quiet();

  if (hasError(untrackedResult.exitCode)) {
    throw new GitError(
      "Failed to list untracked files in worktree",
      untrackedResult.stderr.toString(),
    );
  }

  const untrackedFiles = untrackedResult.stdout
    .toString()
    .split("\n")
    .filter(Boolean);

  const untrackedDiffs: string[] = [];

  for (const file of untrackedFiles) {
    const diffResult =
      await $`git -C ${options.worktreePath} diff --no-index -- /dev/null ${file}`
        .nothrow()
        .quiet();

    if (hasError(diffResult.exitCode)) {
      throw new GitError(
        `Failed to diff untracked file '${file}'`,
        diffResult.stderr.toString(),
      );
    }

    untrackedDiffs.push(diffResult.stdout.toString());
  }

  return [baseDiff.stdout.toString(), ...untrackedDiffs].join("\n");
}

export async function listBranches(repoPath: string): Promise<string[]> {
  const result =
    await $`git -C ${repoPath} branch --format=${"%(refname:short)"}`
      .nothrow()
      .quiet();

  if (result.exitCode !== 0) {
    throw new GitError("Failed to list branches", result.stderr.toString());
  }

  return result.stdout
    .toString()
    .split("\n")
    .filter(Boolean)
    .map((branch) => branch.trim());
}

export async function getRemoteUrl(
  repoPath: string,
  remoteName = "origin",
): Promise<string | null> {
  const result = await $`git -C ${repoPath} remote get-url ${remoteName}`
    .nothrow()
    .quiet();

  if (result.exitCode !== 0) {
    return null;
  }

  const url = result.stdout.toString().trim();
  return url || null;
}

export function convertToGitHubUrl(remoteUrl: string): string | null {
  // Handle SSH format: git@github.com:user/repo.git
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`;
  }

  // Handle HTTPS format: https://github.com/user/repo.git
  const httpsMatch = remoteUrl.match(
    /^https:\/\/github\.com\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}`;
  }

  return null;
}
