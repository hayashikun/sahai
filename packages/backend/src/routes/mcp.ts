import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Task } from "shared";
import { db } from "../db/client";
import { executionLogs, repositories, tasks } from "../db/schema";
import { resumeTask, startTask, withExecutingStatus } from "../services/task";

// Session storage for MCP
interface McpSession {
  id: string;
}

const sessions = new Map<string, McpSession>();

// Type for task with optional isExecuting field
type TaskWithExecuting = Task & { isExecuting?: boolean };

function formatTask(task: TaskWithExecuting): string {
  return JSON.stringify(
    {
      id: task.id,
      repositoryId: task.repositoryId,
      epicId: task.epicId,
      title: task.title,
      description: task.description,
      status: task.status,
      executor: task.executor,
      branchName: task.branchName,
      baseBranch: task.baseBranch,
      worktreePath: task.worktreePath,
      isExecuting: task.isExecuting,
      createdAt:
        task.createdAt instanceof Date
          ? task.createdAt.toISOString()
          : task.createdAt,
      updatedAt:
        task.updatedAt instanceof Date
          ? task.updatedAt.toISOString()
          : task.updatedAt,
      startedAt: task.startedAt
        ? task.startedAt instanceof Date
          ? task.startedAt.toISOString()
          : task.startedAt
        : undefined,
      completedAt: task.completedAt
        ? task.completedAt instanceof Date
          ? task.completedAt.toISOString()
          : task.completedAt
        : undefined,
    },
    null,
    2,
  );
}

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const mcp = new Hono();

// Handle MCP POST requests (JSON-RPC)
mcp.post("/", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  const body = await c.req.json<JsonRpcRequest | JsonRpcRequest[]>();

  // Handle single request or batch
  const requests = Array.isArray(body) ? body : [body];
  const responses: JsonRpcResponse[] = [];

  // Check for initialization request
  const isInitRequest = requests.some((req) => req.method === "initialize");

  let session: McpSession | undefined;

  if (isInitRequest && !sessionId) {
    // Create new session
    const newSessionId = randomUUID();
    session = { id: newSessionId };
    sessions.set(newSessionId, session);

    // Set session ID header
    c.header("mcp-session-id", newSessionId);
  } else if (sessionId) {
    session = sessions.get(sessionId);
    if (!session) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid session ID" },
          id: null,
        },
        404,
      );
    }
  } else {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing session ID" },
        id: null,
      },
      400,
    );
  }

  // Process each request
  for (const request of requests) {
    try {
      const response = await handleJsonRpcRequest(request);
      if (response) {
        responses.push(response);
      }
    } catch (error) {
      responses.push({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      });
    }
  }

  // Return responses
  if (Array.isArray(body)) {
    return c.json(responses);
  }
  return c.json(responses[0]);
});

// Handle MCP GET requests (SSE stream for server-to-client notifications)
mcp.get("/", (c) => {
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId) {
    return c.text("Missing session ID", 400);
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return c.text("Invalid session ID", 404);
  }

  return streamSSE(c, async (stream) => {
    // Send initial connected event
    await stream.writeSSE({ event: "connected", data: "connected" });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {
        clearInterval(heartbeat);
      });
    }, 30000);

    // Clean up on close
    stream.onAbort(() => {
      clearInterval(heartbeat);
    });
  });
});

// Handle MCP DELETE requests (session termination)
mcp.delete("/", (c) => {
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId) {
    return c.text("Missing session ID", 400);
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return c.text("Invalid session ID", 404);
  }

  sessions.delete(sessionId);
  return c.text("Session terminated", 200);
});

async function handleJsonRpcRequest(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const { method, params, id } = request;

  // Handle MCP protocol methods
  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "sahai",
            version: "0.1.0",
          },
        },
      };

    case "notifications/initialized":
      // No response for notifications
      return null;

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          tools: [
            {
              name: "create_task",
              description:
                "Create a new task in a repository. The task will be created in TODO status.",
              inputSchema: {
                type: "object",
                properties: {
                  repositoryId: {
                    type: "string",
                    description: "UUID of the target repository",
                  },
                  title: { type: "string", description: "Task title" },
                  description: {
                    type: "string",
                    description: "Task description",
                  },
                  executor: {
                    type: "string",
                    enum: ["ClaudeCode", "Codex", "Copilot", "Gemini"],
                    description: "AI agent to execute the task",
                  },
                  branchName: {
                    type: "string",
                    description: "Git branch name for the task",
                  },
                  baseBranch: {
                    type: "string",
                    description:
                      "Base branch (defaults to repository's default branch)",
                  },
                  epicId: {
                    type: "string",
                    description:
                      "UUID of the parent epic (if created from an epic)",
                  },
                },
                required: ["repositoryId", "title", "executor", "branchName"],
              },
            },
            {
              name: "start_task",
              description:
                "Start a task that is in TODO status. Creates git worktree and spawns the executor.",
              inputSchema: {
                type: "object",
                properties: {
                  taskId: {
                    type: "string",
                    description: "UUID of the task to start",
                  },
                },
                required: ["taskId"],
              },
            },
            {
              name: "resume_task",
              description:
                "Resume a paused task (InProgress or InReview status) with an optional message.",
              inputSchema: {
                type: "object",
                properties: {
                  taskId: {
                    type: "string",
                    description: "UUID of the task to resume",
                  },
                  message: {
                    type: "string",
                    description:
                      "Additional instructions/context for the executor",
                  },
                },
                required: ["taskId"],
              },
            },
            {
              name: "get_task",
              description: "Get details of a specific task.",
              inputSchema: {
                type: "object",
                properties: {
                  taskId: {
                    type: "string",
                    description: "UUID of the task to retrieve",
                  },
                },
                required: ["taskId"],
              },
            },
            {
              name: "get_task_logs",
              description:
                "Get execution logs for a specific task. Returns logs in descending order (newest first).",
              inputSchema: {
                type: "object",
                properties: {
                  taskId: {
                    type: "string",
                    description: "UUID of the task to retrieve logs for",
                  },
                  limit: {
                    type: "number",
                    description:
                      "Maximum number of logs to return (default: 100)",
                  },
                  offset: {
                    type: "number",
                    description: "Number of logs to skip (default: 0)",
                  },
                },
                required: ["taskId"],
              },
            },
            {
              name: "list_repositories",
              description: "List all registered repositories.",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
          ],
        },
      };

    case "tools/call": {
      const toolParams = params as {
        name: string;
        arguments?: Record<string, unknown>;
      };
      const toolName = toolParams.name;
      const toolArgs = toolParams.arguments || {};

      try {
        const result = await executeToolCall(toolName, toolArgs);
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result,
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: -32603,
            message:
              error instanceof Error ? error.message : "Tool execution failed",
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  switch (name) {
    case "create_task": {
      const repositoryId = args.repositoryId as string;
      const title = args.title as string;
      const description = args.description as string | undefined;
      const executor = args.executor as string;
      const branchName = args.branchName as string;
      const baseBranch = args.baseBranch as string | undefined;
      const epicId = args.epicId as string | undefined;

      // Validate executor
      const validExecutors = ["ClaudeCode", "Codex", "Copilot", "Gemini"];
      if (!validExecutors.includes(executor)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "BAD_REQUEST",
                message: `Invalid executor: ${executor}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Get repository
      const repo = await db
        .select()
        .from(repositories)
        .where(eq(repositories.id, repositoryId));
      if (repo.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "NOT_FOUND",
                message: "Repository not found",
              }),
            },
          ],
          isError: true,
        };
      }

      const now = new Date().toISOString();
      const resolvedBaseBranch = baseBranch || repo[0].defaultBranch;

      const newTask = {
        id: randomUUID(),
        repositoryId,
        epicId: epicId || null,
        title,
        description: description || null,
        status: "TODO" as const,
        executor: executor as "ClaudeCode" | "Codex" | "Copilot" | "Gemini",
        branchName,
        baseBranch: resolvedBaseBranch,
        worktreePath: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
      };

      await db.insert(tasks).values(newTask);
      const task = Task.parse(newTask);

      return {
        content: [{ type: "text", text: formatTask(task) }],
      };
    }

    case "start_task": {
      const taskId = args.taskId as string;
      const result = await startTask(taskId);
      if (result.error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: result.error.type,
                message: result.error.message,
              }),
            },
          ],
          isError: true,
        };
      }
      const task = Task.parse(result.data);
      return {
        content: [{ type: "text", text: formatTask(task) }],
      };
    }

    case "resume_task": {
      const taskId = args.taskId as string;
      const message = args.message as string | undefined;
      const result = await resumeTask(taskId, message);
      if (result.error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: result.error.type,
                message: result.error.message,
              }),
            },
          ],
          isError: true,
        };
      }
      const task = Task.parse(result.data);
      return {
        content: [{ type: "text", text: formatTask(task) }],
      };
    }

    case "get_task": {
      const taskId = args.taskId as string;
      const result = await db.select().from(tasks).where(eq(tasks.id, taskId));
      if (result.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "NOT_FOUND",
                message: "Task not found",
              }),
            },
          ],
          isError: true,
        };
      }

      const task = Task.parse(withExecutingStatus(result[0]));
      return {
        content: [{ type: "text", text: formatTask(task) }],
      };
    }

    case "get_task_logs": {
      const taskId = args.taskId as string;
      const limit = (args.limit as number | undefined) ?? 100;
      const offset = (args.offset as number | undefined) ?? 0;

      // Check if task exists
      const taskResult = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId));
      if (taskResult.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "NOT_FOUND",
                message: "Task not found",
              }),
            },
          ],
          isError: true,
        };
      }

      // Get logs ordered by createdAt descending (newest first)
      const logs = await db
        .select()
        .from(executionLogs)
        .where(eq(executionLogs.taskId, taskId))
        .orderBy(desc(executionLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                taskId,
                logs: logs.map((log) => ({
                  id: log.id,
                  content: log.content,
                  logType: log.logType,
                  createdAt: log.createdAt,
                })),
                pagination: {
                  limit,
                  offset,
                  count: logs.length,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "list_repositories": {
      const allRepositories = await db.select().from(repositories);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                repositories: allRepositories.map((repo) => ({
                  id: repo.id,
                  name: repo.name,
                  description: repo.description,
                  path: repo.path,
                  defaultBranch: repo.defaultBranch,
                  createdAt: repo.createdAt,
                  updatedAt: repo.updatedAt,
                })),
                count: allRepositories.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "NOT_FOUND",
              message: `Unknown tool: ${name}`,
            }),
          },
        ],
        isError: true,
      };
  }
}

export default mcp;
