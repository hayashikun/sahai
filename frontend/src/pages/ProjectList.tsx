import { useState } from "react";
import { Link } from "react-router-dom";
import { createProject } from "../api";
import { useProjects } from "../hooks";

export function ProjectList() {
  const { projects, mutate } = useProjects();
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      await createProject(
        newProjectName.trim(),
        newProjectDescription.trim() || undefined,
      );
      setNewProjectName("");
      setNewProjectDescription("");
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h2>Projects</h2>

      <section>
        <h3>Create New Project</h3>
        {error && <p style={{ color: "red" }}>{error}</p>}
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
