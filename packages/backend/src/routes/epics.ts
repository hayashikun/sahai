import { tmpdir } from "node:os";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { epicLogs, epics, projects, tasks } from "../db/schema";
import { badRequest, internalError, notFound } from "../lib/errors";
import { createEventBus, createSimpleSSEStream } from "../lib/sse";
import {
  isEpicExecutorActive,
  startEpicExecution,
  stopEpicExecution,
  withEpicExecutingStatus,
} from "../services/epic";
import { withExecutingStatus } from "../services/task";

// Event bus for epic logs
interface EpicLogEvent {
  id: string;
  epicId: string;
  content: string;
  logType: string;
  createdAt: string;
}

const epicLogEventBus = createEventBus<EpicLogEvent>();

function broadcastEpicLog(log: EpicLogEvent): void {
  epicLogEventBus.broadcast(log.epicId, log);
}

// Routes for /v1/projects/:projectId/epics
export const projectEpics = new Hono();

// GET /v1/projects/:projectId/epics - List epics for a project
projectEpics.get("/:projectId/epics", async (c) => {
  const projectId = c.req.param("projectId");

  // Check if project exists
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project.length === 0) {
    return notFound(c, "Project");
  }

  const result = await db
    .select()
    .from(epics)
    .where(eq(epics.projectId, projectId));

  return c.json(result.map(withEpicExecutingStatus));
});

// POST /v1/projects/:projectId/epics - Create a new epic
projectEpics.post("/:projectId/epics", async (c) => {
  const projectId = c.req.param("projectId");

  // Check if project exists
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (project.length === 0) {
    return notFound(c, "Project");
  }

  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const directoryPath = `${tmpdir()}/sahai-epics/${id}`;

  const newEpic = {
    id,
    projectId,
    title: body.title,
    description: body.description ?? null,
    executor: body.executor,
    directoryPath,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(epics).values(newEpic);
  return c.json(withEpicExecutingStatus(newEpic), 201);
});

// Routes for /v1/epics/:id
export const epicById = new Hono();

// GET /v1/epics/:id - Get an epic by ID
epicById.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.select().from(epics).where(eq(epics.id, id));

  if (result.length === 0) {
    return notFound(c, "Epic");
  }

  return c.json(withEpicExecutingStatus(result[0]));
});

// PUT /v1/epics/:id - Update an epic
epicById.put("/:id", async (c) => {
  const id = c.req.param("id");

  // Check if epic is currently executing
  if (isEpicExecutorActive(id)) {
    return badRequest(c, "Cannot update epic while it is executing");
  }

  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db.select().from(epics).where(eq(epics.id, id));

  if (existing.length === 0) {
    return notFound(c, "Epic");
  }

  const updated = {
    title: body.title ?? existing[0].title,
    description: body.description ?? existing[0].description,
    updatedAt: now,
  };

  await db.update(epics).set(updated).where(eq(epics.id, id));

  return c.json(withEpicExecutingStatus({ ...existing[0], ...updated }));
});

// DELETE /v1/epics/:id - Delete an epic
epicById.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Check if epic is currently executing
  if (isEpicExecutorActive(id)) {
    return badRequest(c, "Cannot delete epic while it is executing");
  }

  const existing = await db.select().from(epics).where(eq(epics.id, id));

  if (existing.length === 0) {
    return notFound(c, "Epic");
  }

  await db.delete(epics).where(eq(epics.id, id));

  return c.json({ message: "Epic deleted" });
});

// GET /v1/epics/:id/tasks - Get tasks related to an epic
epicById.get("/:id/tasks", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  // Get all tasks with this epicId
  const result = await db.select().from(tasks).where(eq(tasks.epicId, id));

  return c.json(result.map(withExecutingStatus));
});

// GET /v1/epics/:id/logs - Get execution logs for an epic
epicById.get("/:id/logs", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  const logs = await db
    .select()
    .from(epicLogs)
    .where(eq(epicLogs.epicId, id))
    .orderBy(desc(epicLogs.createdAt));

  return c.json(logs);
});

// GET /v1/epics/:id/logs/stream - Stream execution logs via SSE
epicById.get("/:id/logs/stream", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  return createSimpleSSEStream<EpicLogEvent>(c, {
    subscriptionKey: id,
    subscribe: epicLogEventBus.subscribe,
    eventType: "log",
    connectedData: { epicId: id },
  });
});

// POST /v1/epics/:id/start - Start epic execution
epicById.post("/:id/start", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  // Check if already executing
  if (isEpicExecutorActive(id)) {
    return badRequest(c, "Epic is already executing");
  }

  const result = await startEpicExecution(id, {
    onLog: (log) => {
      broadcastEpicLog(log);
    },
    onExecutorExit: async (epicId) => {
      // Log completion
      const exitLog = {
        id: crypto.randomUUID(),
        epicId,
        content: "Epic execution completed",
        logType: "system",
        createdAt: new Date().toISOString(),
      };
      await db.insert(epicLogs).values(exitLog);
      broadcastEpicLog(exitLog);
    },
  });

  if (!result.success) {
    if (result.error?.includes("disabled")) {
      return badRequest(c, result.error);
    }
    if (result.error?.includes("already executing")) {
      return badRequest(c, result.error);
    }
    return internalError(c, result.error || "Failed to start epic execution");
  }

  return c.json({ message: "Epic execution started", isExecuting: true });
});

// POST /v1/epics/:id/stop - Stop epic execution
epicById.post("/:id/stop", async (c) => {
  const id = c.req.param("id");

  // Check if epic exists
  const epicResult = await db.select().from(epics).where(eq(epics.id, id));

  if (epicResult.length === 0) {
    return notFound(c, "Epic");
  }

  // Check if not executing
  if (!isEpicExecutorActive(id)) {
    return badRequest(c, "Epic is not currently executing");
  }

  await stopEpicExecution(id);

  // Log stop
  const stopLog = {
    id: crypto.randomUUID(),
    epicId: id,
    content: "Epic execution stopped by user",
    logType: "system",
    createdAt: new Date().toISOString(),
  };
  await db.insert(epicLogs).values(stopLog);
  broadcastEpicLog(stopLog);

  return c.json({ message: "Epic execution stopped", isExecuting: false });
});
