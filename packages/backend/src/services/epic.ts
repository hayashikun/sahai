import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { isExecutorEnabled } from "../config/agent";
import { db } from "../db/client";
import { epics, projectRepositories, repositories } from "../db/schema";
import { createExecutor } from "./task";

// Generate the initial prompt for an epic executor
function generateEpicPrompt(
  description: string,
  repos: Array<{
    id: string;
    name: string;
    path: string;
    defaultBranch: string;
  }>,
): string {
  const repoList = repos
    .map(
      (r) =>
        `  - ${r.name} (ID: ${r.id}, path: ${r.path}, default branch: ${r.defaultBranch})`,
    )
    .join("\n");

  return `You are an orchestration agent managing tasks across multiple repositories in a project.

Your goal is to achieve the following epic:
---
${description}
---

Available repositories in this project:
${repoList}

Instructions:
1. Analyze the epic requirements and break them down into individual tasks
2. Create tasks in the appropriate repositories using the MCP tools
3. Start tasks and monitor their progress
4. Coordinate dependencies between tasks as needed

MCP Tools available:
- create_task: Create a new task in a repository
- start_task: Start a TODO task
- get_task: Get task status and details
- resume_task: Resume a paused task with additional context

When all tasks are complete and the epic goal is achieved, report completion.`;
}

export interface EpicExecutionResult {
  success: boolean;
  error?: string;
}

export async function startEpicExecution(
  epicId: string,
): Promise<EpicExecutionResult> {
  // Get epic details
  const epicResult = await db.select().from(epics).where(eq(epics.id, epicId));
  if (epicResult.length === 0) {
    return { success: false, error: "Epic not found" };
  }

  const epic = epicResult[0];

  // Check if the executor/agent is enabled
  const isEnabled = await isExecutorEnabled(epic.executor);
  if (!isEnabled) {
    return {
      success: false,
      error: `Agent "${epic.executor}" is disabled in settings`,
    };
  }

  // Get repositories associated with the project
  const projectRepos = await db
    .select({
      id: repositories.id,
      name: repositories.name,
      path: repositories.path,
      defaultBranch: repositories.defaultBranch,
    })
    .from(projectRepositories)
    .innerJoin(
      repositories,
      eq(projectRepositories.repositoryId, repositories.id),
    )
    .where(eq(projectRepositories.projectId, epic.projectId));

  if (projectRepos.length === 0) {
    return {
      success: false,
      error: "No repositories found for this project",
    };
  }

  // Create the directory for the epic executor
  const directoryPath =
    epic.directoryPath || `${tmpdir()}/sahai-epics/${epicId}`;
  await mkdir(directoryPath, { recursive: true });

  // Update the epic with the directory path if not set
  if (!epic.directoryPath) {
    await db
      .update(epics)
      .set({
        directoryPath,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(epics.id, epicId));
  }

  // Generate the initial prompt
  const prompt = generateEpicPrompt(
    epic.description || epic.title,
    projectRepos,
  );

  // Create and start the executor
  const executor = createExecutor(epic.executor);

  executor.onOutput((output) => {
    // Log epic executor output
    console.log(`[epic:${epicId}] ${output.logType}: ${output.content}`);
  });

  executor.onExit(() => {
    console.log(`[epic:${epicId}] Executor completed`);
  });

  try {
    await executor.start({
      taskId: epicId, // Use epicId as taskId for the executor
      workingDirectory: directoryPath,
      prompt,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to start executor: ${message}` };
  }
}
