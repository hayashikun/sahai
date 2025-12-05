#!/usr/bin/env bun
/**
 * Seed script for creating test data
 * Creates a test git repository in /tmp and populates the database with sample data
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, runMigrations } from "../src/db/client";
import {
  epicLogs,
  epics,
  executionLogs,
  projectRepositories,
  projects,
  repositories,
  taskMessages,
  tasks,
} from "../src/db/schema";

const REPO_BASE_PATH = "/tmp/sahai-test-repos";

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function createTestRepository(name: string): string {
  const repoPath = join(REPO_BASE_PATH, name);

  if (existsSync(repoPath)) {
    console.log(`Repository already exists: ${repoPath}`);
    return repoPath;
  }

  console.log(`Creating repository: ${repoPath}`);
  mkdirSync(repoPath, { recursive: true });

  // Initialize git repository
  execSync("git init", { cwd: repoPath, stdio: "inherit" });

  // Create initial files
  writeFileSync(
    join(repoPath, "README.md"),
    `# ${name}\n\nThis is a test repository for sahai.\n`,
  );
  writeFileSync(join(repoPath, ".gitignore"), "node_modules/\n.env\n*.log\n");
  writeFileSync(
    join(repoPath, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description: "Test repository for sahai",
        main: "index.js",
        scripts: {
          test: 'echo "Error: no test specified" && exit 1',
        },
      },
      null,
      2,
    ),
  );

  // Create initial commit
  execSync("git add .", { cwd: repoPath, stdio: "inherit" });
  execSync('git commit -m "Initial commit"', {
    cwd: repoPath,
    stdio: "inherit",
  });

  console.log(`Repository created: ${repoPath}`);
  return repoPath;
}

async function seed(): Promise<void> {
  console.log("Running migrations...");
  runMigrations();

  console.log("Creating test repositories...");

  // Create test git repositories
  const repo1Path = createTestRepository("test-app");
  const repo2Path = createTestRepository("test-lib");
  const repo3Path = createTestRepository("test-service");

  const now = nowISO();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Project IDs
  const project1Id = generateId();
  const project2Id = generateId();

  // Repository IDs
  const repo1Id = generateId();
  const repo2Id = generateId();
  const repo3Id = generateId();

  // Epic IDs
  const epic1Id = generateId();
  const epic2Id = generateId();

  // Task IDs
  const task1Id = generateId();
  const task2Id = generateId();
  const task3Id = generateId();
  const task4Id = generateId();
  const task5Id = generateId();

  console.log("Inserting projects...");
  await db.insert(projects).values([
    {
      id: project1Id,
      name: "Web Application",
      description: "Main web application project with React frontend",
      createdAt: twoHoursAgo,
      updatedAt: now,
    },
    {
      id: project2Id,
      name: "Microservices",
      description: "Backend microservices project",
      createdAt: oneHourAgo,
      updatedAt: now,
    },
  ]);

  console.log("Inserting repositories...");
  await db.insert(repositories).values([
    {
      id: repo1Id,
      name: "test-app",
      description: "Main application repository",
      path: repo1Path,
      defaultBranch: "main",
      createdAt: twoHoursAgo,
      updatedAt: now,
    },
    {
      id: repo2Id,
      name: "test-lib",
      description: "Shared library repository",
      path: repo2Path,
      defaultBranch: "main",
      createdAt: twoHoursAgo,
      updatedAt: now,
    },
    {
      id: repo3Id,
      name: "test-service",
      description: "Backend service repository",
      path: repo3Path,
      defaultBranch: "main",
      createdAt: oneHourAgo,
      updatedAt: now,
    },
  ]);

  console.log("Inserting project-repository associations...");
  await db.insert(projectRepositories).values([
    {
      projectId: project1Id,
      repositoryId: repo1Id,
      createdAt: twoHoursAgo,
    },
    {
      projectId: project1Id,
      repositoryId: repo2Id,
      createdAt: twoHoursAgo,
    },
    {
      projectId: project2Id,
      repositoryId: repo3Id,
      createdAt: oneHourAgo,
    },
  ]);

  console.log("Inserting epics...");
  await db.insert(epics).values([
    {
      id: epic1Id,
      projectId: project1Id,
      title: "User Authentication Feature",
      description: "Implement complete user authentication with OAuth2",
      executor: "ClaudeCode",
      directoryPath: repo1Path,
      createdAt: twoHoursAgo,
      updatedAt: now,
    },
    {
      id: epic2Id,
      projectId: project2Id,
      title: "API Rate Limiting",
      description: "Add rate limiting to all API endpoints",
      executor: "Gemini",
      directoryPath: repo3Path,
      createdAt: oneHourAgo,
      updatedAt: now,
    },
  ]);

  console.log("Inserting tasks...");
  await db.insert(tasks).values([
    {
      id: task1Id,
      repositoryId: repo1Id,
      epicId: epic1Id,
      title: "Add login form component",
      description: "Create a React login form with email and password fields",
      status: "Done",
      executor: "ClaudeCode",
      branchName: "feature/login-form",
      baseBranch: "main",
      worktreePath: null,
      sessionId: null,
      createdAt: twoHoursAgo,
      updatedAt: now,
      startedAt: twoHoursAgo,
      completedAt: oneHourAgo,
    },
    {
      id: task2Id,
      repositoryId: repo1Id,
      epicId: epic1Id,
      title: "Implement JWT authentication",
      description: "Add JWT token handling for API requests",
      status: "InProgress",
      executor: "ClaudeCode",
      branchName: "feature/jwt-auth",
      baseBranch: "main",
      worktreePath: null,
      sessionId: "test-session-123",
      createdAt: oneHourAgo,
      updatedAt: now,
      startedAt: oneHourAgo,
      completedAt: null,
    },
    {
      id: task3Id,
      repositoryId: repo1Id,
      epicId: epic1Id,
      title: "Add OAuth2 provider integration",
      description: "Integrate Google and GitHub OAuth2 providers",
      status: "TODO",
      executor: "Codex",
      branchName: "feature/oauth2",
      baseBranch: "main",
      worktreePath: null,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    },
    {
      id: task4Id,
      repositoryId: repo2Id,
      epicId: null,
      title: "Add validation utilities",
      description: "Create common validation functions for forms",
      status: "InReview",
      executor: "Copilot",
      branchName: "feature/validation-utils",
      baseBranch: "main",
      worktreePath: null,
      sessionId: null,
      createdAt: oneHourAgo,
      updatedAt: now,
      startedAt: oneHourAgo,
      completedAt: null,
    },
    {
      id: task5Id,
      repositoryId: repo3Id,
      epicId: epic2Id,
      title: "Implement rate limiter middleware",
      description: "Create Express middleware for rate limiting",
      status: "TODO",
      executor: "Gemini",
      branchName: "feature/rate-limiter",
      baseBranch: "main",
      worktreePath: null,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    },
  ]);

  console.log("Inserting execution logs...");
  await db.insert(executionLogs).values([
    {
      id: generateId(),
      taskId: task1Id,
      content: "Starting task execution...",
      logType: "system",
      createdAt: twoHoursAgo,
    },
    {
      id: generateId(),
      taskId: task1Id,
      content: "Creating login form component...",
      logType: "stdout",
      createdAt: twoHoursAgo,
    },
    {
      id: generateId(),
      taskId: task1Id,
      content: "Task completed successfully",
      logType: "system",
      createdAt: oneHourAgo,
    },
    {
      id: generateId(),
      taskId: task2Id,
      content: "Starting JWT implementation...",
      logType: "system",
      createdAt: oneHourAgo,
    },
    {
      id: generateId(),
      taskId: task2Id,
      content: "Installing jsonwebtoken package...",
      logType: "stdout",
      createdAt: oneHourAgo,
    },
  ]);

  console.log("Inserting epic logs...");
  await db.insert(epicLogs).values([
    {
      id: generateId(),
      epicId: epic1Id,
      content: "Epic orchestration started",
      logType: "system",
      createdAt: twoHoursAgo,
    },
    {
      id: generateId(),
      epicId: epic1Id,
      content: "Processing task: Add login form component",
      logType: "stdout",
      createdAt: twoHoursAgo,
    },
  ]);

  console.log("Inserting task messages...");
  await db.insert(taskMessages).values([
    {
      id: generateId(),
      taskId: task2Id,
      content: "Please also add refresh token support",
      status: "pending",
      createdAt: now,
      deliveredAt: null,
    },
  ]);

  console.log("\n✅ Seed completed successfully!");
  console.log("\nCreated:");
  console.log("  - 2 projects");
  console.log("  - 3 repositories (in /tmp/sahai-test-repos/)");
  console.log("  - 2 epics");
  console.log("  - 5 tasks");
  console.log("  - 5 execution logs");
  console.log("  - 2 epic logs");
  console.log("  - 1 task message");
  console.log("\nRepository paths:");
  console.log(`  - ${repo1Path}`);
  console.log(`  - ${repo2Path}`);
  console.log(`  - ${repo3Path}`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
