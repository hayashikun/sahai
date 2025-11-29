import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project, Repository } from "shared/types";
import { getProject, getProjectRepositories } from "../api";

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectData, reposData] = await Promise.all([
          getProject(projectId),
          getProjectRepositories(projectId),
        ]);
        setProject(projectData);
        setRepositories(reposData);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch project");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div>
      <Link to="/projects">&larr; Back to Projects</Link>

      <h2>{project.name}</h2>
      {project.description && <p>{project.description}</p>}

      <dl>
        <dt>Created</dt>
        <dd>{project.createdAt.toLocaleString()}</dd>
        <dt>Updated</dt>
        <dd>{project.updatedAt.toLocaleString()}</dd>
      </dl>

      <section>
        <h3>Repositories</h3>
        {repositories.length === 0 ? (
          <p>No repositories associated with this project.</p>
        ) : (
          <ul>
            {repositories.map((repo) => (
              <li key={repo.id}>
                <strong>{repo.name}</strong>
                <br />
                <small>
                  Path: {repo.path} | Branch: {repo.defaultBranch}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
