import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Project, ProjectArray, RepositoryArray } from "shared";

const originalFetch = globalThis.fetch;

describe("useProjects hooks", () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Project schema parsing", () => {
    test("parses single project correctly", () => {
      const mockProject = {
        id: "proj-1",
        name: "Test Project",
        description: "A test project",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      const project = Project.parse(mockProject);

      expect(project.id).toBe("proj-1");
      expect(project.name).toBe("Test Project");
      expect(project.description).toBe("A test project");
      expect(project.createdAt).toBeInstanceOf(Date);
    });

    test("parses project with null description (transforms to undefined)", () => {
      const mockProject = {
        id: "proj-2",
        name: "Another Project",
        description: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      const project = Project.parse(mockProject);

      // null is transformed to undefined by the schema
      expect(project.description).toBeUndefined();
    });
  });

  describe("ProjectArray schema parsing", () => {
    test("parses array of projects correctly", () => {
      const mockProjects = [
        {
          id: "proj-1",
          name: "Project 1",
          description: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "proj-2",
          name: "Project 2",
          description: "Description",
          createdAt: "2024-01-02T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        },
      ];

      const projects = ProjectArray.parse(mockProjects);

      expect(projects).toHaveLength(2);
      expect(projects[0].id).toBe("proj-1");
      expect(projects[1].id).toBe("proj-2");
    });

    test("parses empty array", () => {
      const projects = ProjectArray.parse([]);
      expect(projects).toHaveLength(0);
    });
  });

  describe("RepositoryArray schema parsing for project repositories", () => {
    test("parses array of repositories correctly", () => {
      // Repository schema doesn't include projectId - that's in ProjectRepository
      const mockRepositories = [
        {
          id: "repo-1",
          name: "frontend",
          path: "/path/to/frontend",
          defaultBranch: "main",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "repo-2",
          name: "backend",
          path: "/path/to/backend",
          defaultBranch: "master",
          createdAt: "2024-01-02T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        },
      ];

      const repositories = RepositoryArray.parse(mockRepositories);

      expect(repositories).toHaveLength(2);
      expect(repositories[0].name).toBe("frontend");
      expect(repositories[1].name).toBe("backend");
    });
  });

  describe("fetcher integration", () => {
    test("fetcher returns data for useProjects", async () => {
      const mockProjects = [
        {
          id: "proj-1",
          name: "Project 1",
          description: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProjects),
        } as Response),
      );

      const { fetcher } = await import("../../api/client");
      const data = await fetcher("/projects");
      const projects = ProjectArray.parse(data);

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("Project 1");
    });

    test("fetcher returns data for useProject", async () => {
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
      );

      const { fetcher } = await import("../../api/client");
      const data = await fetcher("/projects/proj-1");
      const project = Project.parse(data);

      expect(project.id).toBe("proj-1");
    });

    test("fetcher returns data for useProjectRepositories", async () => {
      // Repository schema doesn't include projectId - that's in ProjectRepository
      const mockRepositories = [
        {
          id: "repo-1",
          name: "frontend",
          path: "/path/to/frontend",
          defaultBranch: "main",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];

      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRepositories),
        } as Response),
      );

      const { fetcher } = await import("../../api/client");
      const data = await fetcher("/projects/proj-1/repositories");
      const repositories = RepositoryArray.parse(data);

      expect(repositories).toHaveLength(1);
      expect(repositories[0].id).toBe("repo-1");
    });
  });
});
