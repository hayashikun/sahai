import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { GitError } from "../git";
import { createWorktree, deleteWorktree, listWorktrees } from "../worktree";

let testRepoPath: string;
let worktreeBasePath: string;

beforeAll(async () => {
  // Create a temporary directory for the test repository
  // Use realpathSync to resolve symlinks (e.g., /var -> /private/var on macOS)
  testRepoPath = realpathSync(mkdtempSync(join(tmpdir(), "worktree-test-")));
  worktreeBasePath = realpathSync(mkdtempSync(join(tmpdir(), "worktrees-")));

  // Initialize a git repository
  await $`git init ${testRepoPath}`.quiet();
  await $`git -C ${testRepoPath} config user.email "test@test.com"`.quiet();
  await $`git -C ${testRepoPath} config user.name "Test"`.quiet();

  // Create an initial commit
  await $`touch ${testRepoPath}/README.md`.quiet();
  await $`git -C ${testRepoPath} add .`.quiet();
  await $`git -C ${testRepoPath} commit -m "Initial commit"`.quiet();

  // Create a test branch
  await $`git -C ${testRepoPath} branch test-branch`.quiet();
});

afterAll(() => {
  // Clean up the temporary directories
  rmSync(testRepoPath, { recursive: true, force: true });
  rmSync(worktreeBasePath, { recursive: true, force: true });
});

describe("createWorktree", () => {
  test("creates a worktree for an existing branch", async () => {
    const worktreePath = join(worktreeBasePath, "worktree-1");

    await createWorktree(testRepoPath, worktreePath, "test-branch");

    // Verify worktree was created
    expect(existsSync(worktreePath)).toBe(true);
    expect(existsSync(join(worktreePath, "README.md"))).toBe(true);

    // Clean up
    await $`git -C ${testRepoPath} worktree remove --force ${worktreePath}`.quiet();
  });

  test("throws GitError for non-existent branch", async () => {
    const worktreePath = join(worktreeBasePath, "worktree-error");

    try {
      await createWorktree(testRepoPath, worktreePath, "non-existent-branch");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      expect((error as GitError).message).toContain("Failed to create worktree");
    }
  });

  test("throws GitError when worktree path already exists", async () => {
    const worktreePath = join(worktreeBasePath, "worktree-exists");

    // Create first worktree
    await $`git -C ${testRepoPath} branch another-branch`.quiet();
    await createWorktree(testRepoPath, worktreePath, "another-branch");

    // Try to create another worktree at the same path
    try {
      await createWorktree(testRepoPath, worktreePath, "test-branch");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
    }

    // Clean up
    await $`git -C ${testRepoPath} worktree remove --force ${worktreePath}`.quiet();
    await $`git -C ${testRepoPath} branch -D another-branch`.quiet();
  });
});

describe("deleteWorktree", () => {
  test("deletes an existing worktree", async () => {
    const worktreePath = join(worktreeBasePath, "worktree-to-delete");

    // Create a worktree first
    await $`git -C ${testRepoPath} branch delete-test-branch`.quiet();
    await createWorktree(testRepoPath, worktreePath, "delete-test-branch");

    await deleteWorktree(testRepoPath, worktreePath);

    // Verify worktree was deleted
    expect(existsSync(worktreePath)).toBe(false);

    // Clean up
    await $`git -C ${testRepoPath} branch -D delete-test-branch`.quiet();
  });

  test("force deletes a worktree with changes", async () => {
    const worktreePath = join(worktreeBasePath, "worktree-force-delete");

    // Create a worktree
    await $`git -C ${testRepoPath} branch force-delete-branch`.quiet();
    await createWorktree(testRepoPath, worktreePath, "force-delete-branch");

    // Make changes in the worktree
    await $`echo "changes" > ${worktreePath}/changes.txt`.quiet();

    await deleteWorktree(testRepoPath, worktreePath, true);

    // Verify worktree was deleted
    expect(existsSync(worktreePath)).toBe(false);

    // Clean up
    await $`git -C ${testRepoPath} branch -D force-delete-branch`.quiet();
  });

  test("throws GitError for non-existent worktree", async () => {
    const worktreePath = join(worktreeBasePath, "non-existent-worktree");

    try {
      await deleteWorktree(testRepoPath, worktreePath);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      expect((error as GitError).message).toContain("Failed to delete worktree");
    }
  });
});

describe("listWorktrees", () => {
  test("lists all worktrees including the main working directory", async () => {
    const worktrees = await listWorktrees(testRepoPath);

    // Should have at least the main worktree
    expect(worktrees.length).toBeGreaterThanOrEqual(1);
    expect(worktrees[0].path).toBe(testRepoPath);
    expect(worktrees[0].head).toBeDefined();
  });

  test("lists multiple worktrees", async () => {
    const worktreePath1 = join(worktreeBasePath, "list-worktree-1");
    const worktreePath2 = join(worktreeBasePath, "list-worktree-2");

    // Create branches and worktrees
    await $`git -C ${testRepoPath} branch list-branch-1`.quiet();
    await $`git -C ${testRepoPath} branch list-branch-2`.quiet();
    await createWorktree(testRepoPath, worktreePath1, "list-branch-1");
    await createWorktree(testRepoPath, worktreePath2, "list-branch-2");

    const worktrees = await listWorktrees(testRepoPath);

    // Should have 3 worktrees (main + 2 created)
    expect(worktrees.length).toBe(3);

    const paths = worktrees.map((w) => w.path);
    expect(paths).toContain(testRepoPath);
    expect(paths).toContain(worktreePath1);
    expect(paths).toContain(worktreePath2);

    // Clean up
    await $`git -C ${testRepoPath} worktree remove --force ${worktreePath1}`.quiet();
    await $`git -C ${testRepoPath} worktree remove --force ${worktreePath2}`.quiet();
    await $`git -C ${testRepoPath} branch -D list-branch-1`.quiet();
    await $`git -C ${testRepoPath} branch -D list-branch-2`.quiet();
  });

  test("returns worktree with branch information", async () => {
    const worktreePath = join(worktreeBasePath, "branch-info-worktree");

    // Create branch and worktree
    await $`git -C ${testRepoPath} branch branch-info-test`.quiet();
    await createWorktree(testRepoPath, worktreePath, "branch-info-test");

    const worktrees = await listWorktrees(testRepoPath);
    const createdWorktree = worktrees.find((w) => w.path === worktreePath);

    expect(createdWorktree).toBeDefined();
    expect(createdWorktree?.branch).toContain("branch-info-test");

    // Clean up
    await $`git -C ${testRepoPath} worktree remove --force ${worktreePath}`.quiet();
    await $`git -C ${testRepoPath} branch -D branch-info-test`.quiet();
  });
});
