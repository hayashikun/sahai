import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { db, runMigrations } from "../../db/client";
import { repositories, tasks } from "../../db/schema";
import mcp from "../mcp";

const TEST_DB_PATH = resolve(import.meta.dirname, "../../../data/mcp-test.db");

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  runMigrations();
});

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(repositories);
});

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    // ignore if file doesn't exist
  }
});

async function createRepository(id: string, name: string) {
  const now = new Date().toISOString();
  await db.insert(repositories).values({
    id,
    name,
    path: `/path/to/${name}`,
    defaultBranch: "main",
    createdAt: now,
    updatedAt: now,
  });
}

async function createTask(
  id: string,
  repositoryId: string,
  title: string,
  status: "TODO" | "InProgress" | "InReview" | "Done" = "TODO",
  worktreePath: string | null = null,
) {
  const now = new Date().toISOString();
  await db.insert(tasks).values({
    id,
    repositoryId,
    title,
    description: "Test description",
    status,
    executor: "ClaudeCode",
    branchName: `feature/${id}`,
    baseBranch: "main",
    worktreePath,
    createdAt: now,
    updatedAt: now,
    startedAt: status !== "TODO" ? now : null,
    completedAt: status === "Done" ? now : null,
  });
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

async function initializeSession(): Promise<string> {
  const res = await mcp.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }),
  });
  const sessionId = res.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("Failed to get session ID");
  }
  return sessionId;
}

describe("MCP POST / (JSON-RPC)", () => {
  describe("Session Management", () => {
    test("creates a new session on initialize request", async () => {
      const res = await mcp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        }),
      });

      expect(res.status).toBe(200);
      const sessionId = res.headers.get("mcp-session-id");
      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBeNull();

      const data = (await res.json()) as JsonRpcResponse;
      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(1);
      expect(data.result).toBeDefined();
      const result = data.result as {
        protocolVersion: string;
        capabilities: { tools: object };
        serverInfo: { name: string; version: string };
      };
      expect(result.protocolVersion).toBe("2024-11-05");
      expect(result.capabilities.tools).toBeDefined();
      expect(result.serverInfo.name).toBe("sahai");
    });

    test("returns error for missing session ID on non-initialize request", async () => {
      const res = await mcp.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as JsonRpcResponse;
      expect(data.error?.message).toBe("Missing session ID");
    });

    test("returns error for invalid session ID", async () => {
      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": "invalid-session-id",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as JsonRpcResponse;
      expect(data.error?.message).toBe("Invalid session ID");
    });

    test("accepts valid session ID", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe("notifications/initialized", () => {
    test("returns no response for initialized notification", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });

      expect(res.status).toBe(200);
      // Notifications return undefined/null response, resulting in empty body
      const text = await res.text();
      expect(text === "" || text === "null" || text === "undefined").toBe(true);
    });
  });

  describe("tools/list", () => {
    test("returns list of available tools", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      expect(data.result).toBeDefined();
      const result = data.result as {
        tools: Array<{ name: string; description: string }>;
      };
      expect(result.tools).toBeArray();
      expect(result.tools).toHaveLength(4);

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain("create_task");
      expect(toolNames).toContain("start_task");
      expect(toolNames).toContain("resume_task");
      expect(toolNames).toContain("get_task");
    });
  });

  describe("tools/call - create_task", () => {
    test("creates a task successfully", async () => {
      await createRepository("repo-1", "Test Repository");
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_task",
            arguments: {
              repositoryId: "repo-1",
              title: "New MCP Task",
              description: "Task created via MCP",
              executor: "ClaudeCode",
              branchName: "feature/mcp-task",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      expect(data.error).toBeUndefined();
      expect(data.result).toBeDefined();
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const taskData = JSON.parse(result.content[0].text);
      expect(taskData.title).toBe("New MCP Task");
      expect(taskData.description).toBe("Task created via MCP");
      expect(taskData.status).toBe("TODO");
      expect(taskData.executor).toBe("ClaudeCode");
      expect(taskData.branchName).toBe("feature/mcp-task");
      expect(taskData.baseBranch).toBe("main");
    });

    test("returns error for invalid executor", async () => {
      await createRepository("repo-1", "Test Repository");
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_task",
            arguments: {
              repositoryId: "repo-1",
              title: "New Task",
              executor: "InvalidExecutor",
              branchName: "feature/test",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData.error).toBe("BAD_REQUEST");
      expect(errorData.message).toContain("Invalid executor");
    });

    test("returns error for non-existent repository", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_task",
            arguments: {
              repositoryId: "non-existent",
              title: "New Task",
              executor: "ClaudeCode",
              branchName: "feature/test",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData.error).toBe("NOT_FOUND");
      expect(errorData.message).toBe("Repository not found");
    });

    test("uses custom base branch when provided", async () => {
      await createRepository("repo-1", "Test Repository");
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "create_task",
            arguments: {
              repositoryId: "repo-1",
              title: "New Task",
              executor: "Gemini",
              branchName: "feature/test",
              baseBranch: "develop",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
      };
      const taskData = JSON.parse(result.content[0].text);
      expect(taskData.baseBranch).toBe("develop");
    });
  });

  describe("tools/call - get_task", () => {
    test("returns task details", async () => {
      await createRepository("repo-1", "Test Repository");
      await createTask("task-1", "repo-1", "Test Task");
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_task",
            arguments: {
              taskId: "task-1",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBeUndefined();
      const taskData = JSON.parse(result.content[0].text);
      expect(taskData.id).toBe("task-1");
      expect(taskData.title).toBe("Test Task");
      expect(taskData.status).toBe("TODO");
    });

    test("returns error for non-existent task", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_task",
            arguments: {
              taskId: "non-existent",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData.error).toBe("NOT_FOUND");
      expect(errorData.message).toBe("Task not found");
    });
  });

  describe("tools/call - start_task", () => {
    test("returns error for non-existent task", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "start_task",
            arguments: {
              taskId: "non-existent",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
    });

    test("returns error for task not in TODO status", async () => {
      await createRepository("repo-1", "Test Repository");
      await createTask("task-1", "repo-1", "Test Task", "InProgress");
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "start_task",
            arguments: {
              taskId: "task-1",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
    });
  });

  describe("tools/call - resume_task", () => {
    test("returns error for non-existent task", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "resume_task",
            arguments: {
              taskId: "non-existent",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
    });

    test("returns error for task in TODO status", async () => {
      await createRepository("repo-1", "Test Repository");
      await createTask("task-1", "repo-1", "Test Task", "TODO");
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "resume_task",
            arguments: {
              taskId: "task-1",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
    });

    test("returns error for task without worktree", async () => {
      await createRepository("repo-1", "Test Repository");
      await createTask("task-1", "repo-1", "Test Task", "InProgress", null);
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "resume_task",
            arguments: {
              taskId: "task-1",
              message: "Please continue",
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
    });
  });

  describe("tools/call - unknown tool", () => {
    test("returns error for unknown tool", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "unknown_tool",
            arguments: {},
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      const result = data.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData.error).toBe("NOT_FOUND");
      expect(errorData.message).toBe("Unknown tool: unknown_tool");
    });
  });

  describe("Unknown method", () => {
    test("returns method not found error", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "unknown/method",
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse;
      expect(data.error).toBeDefined();
      expect(data.error?.code).toBe(-32601);
      expect(data.error?.message).toBe("Method not found: unknown/method");
    });
  });

  describe("Batch requests", () => {
    test("handles batch requests", async () => {
      const sessionId = await initializeSession();

      const res = await mcp.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": sessionId,
        },
        body: JSON.stringify([
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { jsonrpc: "2.0", id: 2, method: "tools/list" },
        ]),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as JsonRpcResponse[];
      expect(data).toBeArray();
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe(1);
      expect(data[1].id).toBe(2);
    });
  });
});

describe("MCP GET / (SSE)", () => {
  test("returns error for missing session ID", async () => {
    const res = await mcp.request("/", {
      method: "GET",
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe("Missing session ID");
  });

  test("returns error for invalid session ID", async () => {
    const res = await mcp.request("/", {
      method: "GET",
      headers: {
        "mcp-session-id": "invalid-session-id",
      },
    });

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Invalid session ID");
  });
});

describe("MCP DELETE / (Session termination)", () => {
  test("returns error for missing session ID", async () => {
    const res = await mcp.request("/", {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe("Missing session ID");
  });

  test("returns error for invalid session ID", async () => {
    const res = await mcp.request("/", {
      method: "DELETE",
      headers: {
        "mcp-session-id": "invalid-session-id",
      },
    });

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe("Invalid session ID");
  });

  test("terminates a valid session", async () => {
    const sessionId = await initializeSession();

    const res = await mcp.request("/", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId,
      },
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Session terminated");

    // Verify session is no longer valid
    const checkRes = await mcp.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    expect(checkRes.status).toBe(404);
  });
});
