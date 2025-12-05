import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findParentGitRepo,
  getGitSubmodules,
  hasSubmodules,
  isGitRepository,
} from "../filesystem";

let testDir: string;
let gitRepoPath: string;
let nonGitPath: string;
let repoWithSubmodulePath: string;
let submodulePath: string;

beforeAll(() => {
  // Test directory structure:
  //
  // testDir/
  // ├── git-repo/                    # Regular git repository
  // │   └── .git/                    # (directory)
  // │
  // ├── non-git/                     # Non-git directory (no .git)
  // │
  // └── repo-with-submodule/         # Git repo with submodule
  //     ├── .git/
  //     │   └── modules/
  //     │       └── submodule/       # Submodule's actual git data
  //     ├── .gitmodules              # Submodule configuration file
  //     └── submodule/               # Submodule directory
  //         └── .git                 # (file) points to ../../.git/modules/submodule

  testDir = mkdtempSync(join(tmpdir(), "filesystem-test-"));

  // git-repo/
  gitRepoPath = join(testDir, "git-repo");
  mkdirSync(gitRepoPath);
  mkdirSync(join(gitRepoPath, ".git"));

  // non-git/
  nonGitPath = join(testDir, "non-git");
  mkdirSync(nonGitPath);

  // repo-with-submodule/
  repoWithSubmodulePath = join(testDir, "repo-with-submodule");
  mkdirSync(repoWithSubmodulePath);
  mkdirSync(join(repoWithSubmodulePath, ".git", "modules", "submodule"), {
    recursive: true,
  });

  writeFileSync(
    join(repoWithSubmodulePath, ".gitmodules"),
    `[submodule "submodule"]
	path = submodule
	url = https://example.com/repo.git
`,
  );

  // repo-with-submodule/submodule/
  submodulePath = join(repoWithSubmodulePath, "submodule");
  mkdirSync(submodulePath);
  writeFileSync(
    join(submodulePath, ".git"),
    `gitdir: ${join(repoWithSubmodulePath, ".git", "modules", "submodule")}\n`,
  );
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("isGitRepository", () => {
  test("returns true for a directory with .git directory", async () => {
    const result = await isGitRepository(gitRepoPath);
    expect(result).toBe(true);
  });

  test("returns true for a directory with .git file (submodule)", async () => {
    const result = await isGitRepository(submodulePath);
    expect(result).toBe(true);
  });

  test("returns false for a non-git directory", async () => {
    const result = await isGitRepository(nonGitPath);
    expect(result).toBe(false);
  });

  test("returns false for a non-existent directory", async () => {
    const result = await isGitRepository(join(testDir, "non-existent"));
    expect(result).toBe(false);
  });
});

describe("hasSubmodules", () => {
  test("returns true for a repository with .gitmodules", async () => {
    const result = await hasSubmodules(repoWithSubmodulePath);
    expect(result).toBe(true);
  });

  test("returns false for a repository without .gitmodules", async () => {
    const result = await hasSubmodules(gitRepoPath);
    expect(result).toBe(false);
  });

  test("returns false for a non-git directory", async () => {
    const result = await hasSubmodules(nonGitPath);
    expect(result).toBe(false);
  });
});

describe("getGitSubmodules", () => {
  test("returns submodule entries from .gitmodules", async () => {
    const result = await getGitSubmodules(repoWithSubmodulePath);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("submodule");
    expect(result[0].path).toBe(submodulePath);
    expect(result[0].isDirectory).toBe(true);
    expect(result[0].isGitRepo).toBe(true);
    expect(result[0].isSubmodule).toBe(true);
    expect(result[0].hasSubmodules).toBe(false);
  });

  test("returns empty array for a repository without .gitmodules", async () => {
    const result = await getGitSubmodules(gitRepoPath);
    expect(result).toHaveLength(0);
  });

  test("handles nested submodule paths", async () => {
    const nestedRepoPath = join(testDir, "nested-repo");
    mkdirSync(nestedRepoPath);
    mkdirSync(join(nestedRepoPath, ".git"));
    mkdirSync(join(nestedRepoPath, "libs", "nested-sub", ".git"), {
      recursive: true,
    });

    writeFileSync(
      join(nestedRepoPath, ".gitmodules"),
      `[submodule "libs/nested-sub"]
	path = libs/nested-sub
	url = https://example.com/repo.git
`,
    );

    const result = await getGitSubmodules(nestedRepoPath);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("nested-sub");
    expect(result[0].path).toBe(join(nestedRepoPath, "libs", "nested-sub"));
  });
});

describe("findParentGitRepo", () => {
  test("returns parent repo path for a submodule", async () => {
    const result = await findParentGitRepo(submodulePath);
    expect(result).toBe(repoWithSubmodulePath);
  });

  test("returns null for a regular git repository", async () => {
    const result = await findParentGitRepo(gitRepoPath);
    expect(result).toBe(null);
  });

  test("returns null for a non-git directory", async () => {
    const result = await findParentGitRepo(nonGitPath);
    expect(result).toBe(null);
  });
});
