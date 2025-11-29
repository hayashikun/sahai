import { ArrowLeft, Calendar, GitBranch, GitFork } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { useProject, useProjectRepositories } from "../hooks";

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return (
      <div className="text-center py-10 text-gray-500">
        Project ID is required
      </div>
    );
  }

  return <ProjectDetailContent projectId={projectId} />;
}

function ProjectDetailContent({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const repositories = useProjectRepositories(projectId);

  if (!project) {
    return (
      <div className="text-center py-10 text-gray-500">Project not found</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
        </div>

        <div className="flex gap-4 mt-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Created: {project.createdAt.toLocaleDateString()}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Updated: {project.updatedAt.toLocaleDateString()}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <GitFork className="h-5 w-5" />
          Repositories
        </h2>
        {repositories.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <GitFork className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">
                No repositories associated with this project.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {repositories.map((repo) => (
              <Link key={repo.id} to={`/repositories/${repo.id}`}>
                <Card className="hover:bg-gray-50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitFork className="h-4 w-4" />
                      {repo.name}
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="font-mono text-xs">{repo.path}</div>
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {repo.defaultBranch}
                      </div>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
