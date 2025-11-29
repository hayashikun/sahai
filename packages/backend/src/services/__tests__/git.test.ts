import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { createBranch, deleteBranch, getDiff, GitError } from "../git";

let testRepoPath: string;

beforeAll(async () => {
  // Create a temporary directory for the test repository
  testRepoPath = mkdtempSync(join(tmpdir(), "git-test-"));

  // Initialize a git repository
  await $`git init ${testRepoPath}`.quiet();
  await $`git -C ${testRepoPath} config user.email "test@test.com"`.quiet();
  await $`git -C ${testRepoPath} config user.name "Test"`.quiet();

  // Create an initial commit
  await $`touch ${testRepoPath}/README.md`.quiet();
  await $`git -C ${testRepoPath} add .`.quiet();
  await $`git -C ${testRepoPath} commit -m "Initial commit"`.quiet();
});

afterAll(() => {
  // Clean up the temporary directory
  rmSync(testRepoPath, { recursive: true, force: true });
});

describe("createBranch", () => {
  test("creates a new branch from HEAD", async () => {
    await createBranch(testRepoPath, "test-branch-1");

    // Verify branch was created
    const result = await $`git -C ${testRepoPath} branch --list test-branch-1`
      .quiet()
      .text();
    expect(result).toContain("test-branch-1");

    // Clean up
    await $`git -C ${testRepoPath} checkout main || git -C ${testRepoPath} checkout master`.quiet();
    await $`git -C ${testRepoPath} branch -D test-branch-1`.quiet();
  });

  test("creates a new branch from a specific base branch", async () => {
    // First create a base branch
    await $`git -C ${testRepoPath} branch base-branch`.quiet();

    await createBranch(testRepoPath, "test-branch-2", "base-branch");

    // Verify branch was created
    const result = await $`git -C ${testRepoPath} branch --list test-branch-2`
      .quiet()
      .text();
    expect(result).toContain("test-branch-2");

    // Clean up
    await $`git -C ${testRepoPath} checkout main || git -C ${testRepoPath} checkout master`.quiet();
    await $`git -C ${testRepoPath} branch -D test-branch-2`.quiet();
    await $`git -C ${testRepoPath} branch -D base-branch`.quiet();
  });

  test("throws GitError when branch already exists", async () => {
    // Create the branch first
    await $`git -C ${testRepoPath} branch existing-branch`.quiet();

    try {
      await createBranch(testRepoPath, "existing-branch");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      expect((error as GitError).message).toContain(
        "Failed to create branch 'existing-branch'",
      );
    }

    // Clean up
    await $`git -C ${testRepoPath} branch -D existing-branch`.quiet();
  });
});

describe("deleteBranch", () => {
  test("deletes an existing branch", async () => {
    // Create a branch to delete
    await $`git -C ${testRepoPath} branch branch-to-delete`.quiet();

    await deleteBranch(testRepoPath, "branch-to-delete");

    // Verify branch was deleted
    const result =
      await $`git -C ${testRepoPath} branch --list branch-to-delete`
        .quiet()
        .text();
    expect(result.trim()).toBe("");
  });

  test("force deletes an unmerged branch", async () => {
    // Create a branch with a commit
    await $`git -C ${testRepoPath} checkout -b unmerged-branch`.quiet();
    await $`touch ${testRepoPath}/new-file.txt`.quiet();
    await $`git -C ${testRepoPath} add .`.quiet();
    await $`git -C ${testRepoPath} commit -m "New commit"`.quiet();
    await $`git -C ${testRepoPath} checkout main || git -C ${testRepoPath} checkout master`.quiet();

    await deleteBranch(testRepoPath, "unmerged-branch", true);

    // Verify branch was deleted
    const result =
      await $`git -C ${testRepoPath} branch --list unmerged-branch`.quiet().text();
    expect(result.trim()).toBe("");
  });

  test("throws GitError when branch does not exist", async () => {
    try {
      await deleteBranch(testRepoPath, "non-existent-branch");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      expect((error as GitError).message).toContain(
        "Failed to delete branch 'non-existent-branch'",
      );
    }
  });
});

describe("getDiff", () => {
  test("returns diff between two branches", async () => {
    // Create a branch with changes
    await $`git -C ${testRepoPath} checkout -b diff-branch`.quiet();
    await $`echo "new content" > ${testRepoPath}/diff-file.txt`.quiet();
    await $`git -C ${testRepoPath} add .`.quiet();
    await $`git -C ${testRepoPath} commit -m "Add diff file"`.quiet();

    // Get the default branch name
    const defaultBranch =
      (await $`git -C ${testRepoPath} rev-parse --abbrev-ref HEAD`.quiet().text()) ===
      "diff-branch"
        ? "main"
        : "master";

    // Go back to main/master
    await $`git -C ${testRepoPath} checkout main || git -C ${testRepoPath} checkout master`.quiet();

    const diff = await getDiff(testRepoPath, "main", "diff-branch").catch(() =>
      getDiff(testRepoPath, "master", "diff-branch"),
    );

    expect(diff).toContain("diff-file.txt");
    expect(diff).toContain("new content");

    // Clean up
    await $`git -C ${testRepoPath} branch -D diff-branch`.quiet();
  });

  test("returns empty diff for identical branches", async () => {
    // Create a branch at the same commit
    await $`git -C ${testRepoPath} branch same-branch`.quiet();

    const diff = await getDiff(testRepoPath, "main", "same-branch").catch(() =>
      getDiff(testRepoPath, "master", "same-branch"),
    );

    expect(diff.trim()).toBe("");

    // Clean up
    await $`git -C ${testRepoPath} branch -D same-branch`.quiet();
  });

  test("throws GitError for non-existent branch", async () => {
    try {
      await getDiff(testRepoPath, "main", "non-existent-branch");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
    }
  });
});
