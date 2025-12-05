import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { isExecutorEnabled } from "../config/agent";
import { db } from "../db/client";
import {
  epicLogs,
  epics,
  projectRepositories,
  repositories,
} from "../db/schema";
import type { Executor } from "../executors/interface";
import { createExecutor } from "./task";

// In-memory store for active epic executors
const activeEpicExecutors = new Map<string, Executor>();

export function isEpicExecutorActive(epicId: string): boolean {
  return activeEpicExecutors.has(epicId);
}

export function getEpicExecutor(epicId: string): Executor | undefined {
  return activeEpicExecutors.get(epicId);
}

export function removeEpicExecutor(epicId: string): void {
  activeEpicExecutors.delete(epicId);
}

// Add isExecuting field to epic based on activeEpicExecutors
export function withEpicExecutingStatus<T extends { id: string }>(
  epic: T,
): T & { isExecuting: boolean } {
  return {
    ...epic,
    isExecuting: activeEpicExecutors.has(epic.id),
  };
}

// Generate the initial prompt for an epic executor
function generateEpicPrompt(
  epicId: string,
  description: string,
  repos: Array<{
    id: string;
    name: string;
    description: string | null;
    defaultBranch: string;
  }>,
): string {
  const repoList = repos
    .map((r) => {
      const desc = r.description ? `\n    Description: ${r.description}` : "";
      return `  - ${r.name} (ID: ${r.id})${desc}\n    Default branch: ${r.defaultBranch}`;
    })
    .join("\n\n");

  return `You are an orchestration agent managing tasks across multiple repositories in a project.

Your goal is to achieve the following epic:
---
${description}
---

Epic ID: ${epicId}

Available repositories in this project:
${repoList}

Instructions:
1. Analyze the epic requirements and break them down into individual tasks
2. Create tasks in the appropriate repositories using the MCP tools (use the Epic ID above when creating tasks)
3. Start tasks and monitor their progress
4. Coordinate dependencies between tasks as needed

MCP Tools available:
- create_task: Create a new task in a repository (requires epicId: "${epicId}")
- start_task: Start a TODO task
- get_task: Get task status and details
- get_task_logs: Get logs for a task
- resume_task: Resume a paused task with additional context

When all tasks are complete and the epic goal is achieved, report completion.`;
}

export interface EpicExecutionResult {
  success: boolean;
  error?: string;
}

export interface EpicEventHandler {
  onLog?: (log: {
    id: string;
    epicId: string;
    content: string;
    logType: string;
    createdAt: string;
  }) => void;
  onExecutorExit?: (epicId: string) => void;
}

export async function startEpicExecution(
  epicId: string,
  eventHandler?: EpicEventHandler,
): Promise<EpicExecutionResult> {
  // Check if already executing
  if (activeEpicExecutors.has(epicId)) {
    return { success: false, error: "Epic is already executing" };
  }

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
      description: repositories.description,
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
    epicId,
    epic.description || epic.title,
    projectRepos,
  );

  // Create and start the executor
  const executor = createExecutor(epic.executor);

  executor.onOutput(async (output) => {
    const log = {
      id: crypto.randomUUID(),
      epicId,
      content: output.content,
      logType: output.logType,
      createdAt: new Date().toISOString(),
    };
    await db.insert(epicLogs).values(log);
    eventHandler?.onLog?.(log);
  });

  executor.onExit(() => {
    console.log(`[epic:${epicId}] Executor completed`);
    activeEpicExecutors.delete(epicId);
    eventHandler?.onExecutorExit?.(epicId);
  });

  try {
    await executor.start({
      taskId: epicId, // Use epicId as taskId for the executor
      workingDirectory: directoryPath,
      prompt,
    });

    activeEpicExecutors.set(epicId, executor);

    // Log system message for start
    const startLog = {
      id: crypto.randomUUID(),
      epicId,
      content: "Epic execution started",
      logType: "system",
      createdAt: new Date().toISOString(),
    };
    await db.insert(epicLogs).values(startLog);
    eventHandler?.onLog?.(startLog);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to start executor: ${message}` };
  }
}

export async function stopEpicExecution(epicId: string): Promise<void> {
  const executor = activeEpicExecutors.get(epicId);
  if (executor) {
    await executor.stop();
    activeEpicExecutors.delete(epicId);
  }
}
