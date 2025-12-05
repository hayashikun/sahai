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
import { projects } from "../../db/schema";
import app from "../projects";

const TEST_DB_PATH = resolve(import.meta.dirname, "../../../data/test.db");

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  runMigrations();
});

beforeEach(async () => {
  await db.delete(projects);
});

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {
    // ignore if file doesn't exist
  }
});

describe("GET /", () => {
  test("returns empty array when no projects exist", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns all projects", async () => {
    const now = new Date().toISOString();
    await db.insert(projects).values({
      id: "test-id-1",
      name: "Project 1",
      description: "Description 1",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(projects).values({
      id: "test-id-2",
      name: "Project 2",
      description: null,
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });
});

describe("POST /", () => {
  test("creates a new project", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Project",
        description: "A new project",
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      id: string;
      name: string;
      description: string | null;
      createdAt: string;
      updatedAt: string;
    };
    expect(data.name).toBe("New Project");
    expect(data.description).toBe("A new project");
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  test("creates a project without description", async () => {
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Description Project" }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      name: string;
      description: string | null;
    };
    expect(data.name).toBe("No Description Project");
    expect(data.description).toBeNull();
  });
});

describe("GET /:id", () => {
  test("returns a project by id", async () => {
    const now = new Date().toISOString();
    await db.insert(projects).values({
      id: "test-id",
      name: "Test Project",
      description: "Test Description",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; name: string };
    expect(data.id).toBe("test-id");
    expect(data.name).toBe("Test Project");
  });

  test("returns 404 for non-existent project", async () => {
    const res = await app.request("/non-existent-id");
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: { message: string } };
    expect(data.error.message).toBe("Project not found");
  });
});

describe("PUT /:id", () => {
  test("updates a project", async () => {
    const now = new Date().toISOString();
    await db.insert(projects).values({
      id: "test-id",
      name: "Original Name",
      description: "Original Description",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Name",
        description: "Updated Description",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string; description: string };
    expect(data.name).toBe("Updated Name");
    expect(data.description).toBe("Updated Description");
  });

  test("partially updates a project", async () => {
    const now = new Date().toISOString();
    await db.insert(projects).values({
      id: "test-id",
      name: "Original Name",
      description: "Original Description",
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { name: string; description: string };
    expect(data.name).toBe("Updated Name");
    expect(data.description).toBe("Original Description");
  });

  test("returns 404 for non-existent project", async () => {
    const res = await app.request("/non-existent-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /:id", () => {
  test("deletes a project", async () => {
    const now = new Date().toISOString();
    await db.insert(projects).values({
      id: "test-id",
      name: "To Delete",
      description: null,
      createdAt: now,
      updatedAt: now,
    });

    const res = await app.request("/test-id", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { message: string };
    expect(data.message).toBe("Project deleted");

    // Verify it's deleted
    const getRes = await app.request("/test-id");
    expect(getRes.status).toBe(404);
  });

  test("returns 404 for non-existent project", async () => {
    const res = await app.request("/non-existent-id", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
