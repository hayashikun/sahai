import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createProject } from "../projects";

const originalFetch = globalThis.fetch;

describe("projects API", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createProject", () => {
    test("creates project with name only", async () => {
      const mockProject = {
        id: "proj-1",
        name: "Test Project",
        description: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProject),
        } as Response),
      ) as unknown as typeof fetch;

      const project = await createProject("Test Project");

      expect(project.id).toBe("proj-1");
      expect(project.name).toBe("Test Project");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Project",
            description: undefined,
          }),
        },
      );
    });

    test("creates project with name and description", async () => {
      const mockProject = {
        id: "proj-2",
        name: "My Project",
        description: "A test project",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProject),
        } as Response),
      ) as unknown as typeof fetch;

      const project = await createProject("My Project", "A test project");

      expect(project.id).toBe("proj-2");
      expect(project.name).toBe("My Project");
      expect(project.description).toBe("A test project");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:49382/v1/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "My Project",
            description: "A test project",
          }),
        },
      );
    });

    test("throws error on failed request", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: () =>
            Promise.resolve({
              error: { code: "BAD_REQUEST", message: "Name is required" },
            }),
        } as Response),
      ) as unknown as typeof fetch;

      await expect(createProject("")).rejects.toThrow("Name is required");
    });
  });
});
