import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { projects } from "../db/schema";

const app = new Hono();

// GET /v1/projects - List all projects
app.get("/", async (c) => {
  const result = await db.select().from(projects);
  return c.json(result);
});

// POST /v1/projects - Create a new project
app.post("/", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const newProject = {
    id,
    name: body.name,
    description: body.description ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(projects).values(newProject);
  return c.json(newProject, 201);
});

// GET /v1/projects/:id - Get a project by ID
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await db.select().from(projects).where(eq(projects.id, id));

  if (result.length === 0) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json(result[0]);
});

// PUT /v1/projects/:id - Update a project
app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const existing = await db.select().from(projects).where(eq(projects.id, id));

  if (existing.length === 0) {
    return c.json({ error: "Project not found" }, 404);
  }

  const updated = {
    name: body.name ?? existing[0].name,
    description: body.description ?? existing[0].description,
    updatedAt: now,
  };

  await db.update(projects).set(updated).where(eq(projects.id, id));

  return c.json({ ...existing[0], ...updated });
});

// DELETE /v1/projects/:id - Delete a project
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await db.select().from(projects).where(eq(projects.id, id));

  if (existing.length === 0) {
    return c.json({ error: "Project not found" }, 404);
  }

  await db.delete(projects).where(eq(projects.id, id));

  return c.json({ message: "Project deleted" });
});

export default app;
