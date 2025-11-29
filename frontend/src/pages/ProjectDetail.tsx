import { Link, useParams } from "react-router-dom";
import { useProject, useProjectRepositories } from "../hooks";

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <div>Project ID is required</div>;
  }

  return <ProjectDetailContent projectId={projectId} />;
}

function ProjectDetailContent({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const repositories = useProjectRepositories(projectId);

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
                <Link to={`/repositories/${repo.id}`}>
                  <strong>{repo.name}</strong>
                </Link>
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
