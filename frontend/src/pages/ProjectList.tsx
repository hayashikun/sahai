import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Project } from "shared/types";
import { createProject, getProjects } from "../api";

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProjects();
      setProjects(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      setCreating(true);
      await createProject(
        newProjectName.trim(),
        newProjectDescription.trim() || undefined,
      );
      setNewProjectName("");
      setNewProjectDescription("");
      await fetchProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h2>Projects</h2>

      <section>
        <h3>Create New Project</h3>
        <form onSubmit={handleCreateProject}>
          <div>
            <label htmlFor="project-name">Name:</label>
            <input
              id="project-name"
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="project-description">Description:</label>
            <input
              id="project-description"
              type="text"
              value={newProjectDescription}
              onChange={(e) => setNewProjectDescription(e.target.value)}
            />
          </div>
          <button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Project"}
          </button>
        </form>
      </section>

      <section>
        <h3>Project List</h3>
        {projects.length === 0 ? (
          <p>No projects found.</p>
        ) : (
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <Link to={`/projects/${project.id}`}>{project.name}</Link>
                {project.description && <span> - {project.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
