import {
  ArrowLeft,
  GitBranch,
  GitFork,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Executor } from "shared";
import {
  associateRepositoryWithProject,
  createEpic,
  deleteProject,
  disassociateRepositoryFromProject,
  updateProject,
} from "../api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  useProject,
  useProjectEpics,
  useProjectRepositories,
  useRepositories,
} from "../hooks";

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
  const { project, mutate } = useProject(projectId);
  const { repositories: projectRepositories, mutate: mutateRepositories } =
    useProjectRepositories(projectId);
  const { repositories: allRepositories } = useRepositories();
  const { epics, mutate: mutateEpics } = useProjectEpics(projectId);
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDescription, setEditDescription] = useState(
    project.description ?? "",
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add repository state
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [addRepoLoading, setAddRepoLoading] = useState(false);
  const [addRepoError, setAddRepoError] = useState<string | null>(null);

  // Remove repository state
  const [removingRepoId, setRemovingRepoId] = useState<string | null>(null);

  // Create epic state
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const [epicTitle, setEpicTitle] = useState("");
  const [epicDescription, setEpicDescription] = useState("");
  const [epicExecutor, setEpicExecutor] = useState<Executor>("ClaudeCode");
  const [createEpicLoading, setCreateEpicLoading] = useState(false);
  const [createEpicError, setCreateEpicError] = useState<string | null>(null);

  // Filter out repositories that are already associated with this project
  const projectRepoIds = new Set(projectRepositories.map((r) => r.id));
  const availableRepositories = allRepositories.filter(
    (r) => !projectRepoIds.has(r.id),
  );

  const handleEdit = async () => {
    if (!editName.trim()) {
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);
      await updateProject(projectId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      mutate();
      setEditOpen(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update project");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await deleteProject(projectId);
      navigate("/projects");
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to delete project",
      );
      setDeleteLoading(false);
    }
  };

  const handleAddRepository = async () => {
    if (!selectedRepoId) {
      return;
    }

    try {
      setAddRepoLoading(true);
      setAddRepoError(null);
      await associateRepositoryWithProject(projectId, selectedRepoId);
      mutateRepositories();
      setAddRepoOpen(false);
      setSelectedRepoId("");
    } catch (e) {
      setAddRepoError(
        e instanceof Error ? e.message : "Failed to add repository",
      );
    } finally {
      setAddRepoLoading(false);
    }
  };

  const handleRemoveRepository = async (repoId: string) => {
    try {
      setRemovingRepoId(repoId);
      await disassociateRepositoryFromProject(projectId, repoId);
      mutateRepositories();
    } catch (e) {
      // Show error in console for now
      console.error("Failed to remove repository:", e);
    } finally {
      setRemovingRepoId(null);
    }
  };

  const resetEditForm = () => {
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setEditError(null);
  };

  const resetAddRepoForm = () => {
    setSelectedRepoId("");
    setAddRepoError(null);
  };

  const handleCreateEpic = async () => {
    if (!epicTitle.trim()) {
      return;
    }

    try {
      setCreateEpicLoading(true);
      setCreateEpicError(null);
      await createEpic(projectId, {
        title: epicTitle.trim(),
        description: epicDescription.trim() || undefined,
        executor: epicExecutor,
      });
      mutateEpics();
      setCreateEpicOpen(false);
      setEpicTitle("");
      setEpicDescription("");
      setEpicExecutor("ClaudeCode");
    } catch (e) {
      setCreateEpicError(
        e instanceof Error ? e.message : "Failed to create epic",
      );
    } finally {
      setCreateEpicLoading(false);
    }
  };

  const resetCreateEpicForm = () => {
    setEpicTitle("");
    setEpicDescription("");
    setEpicExecutor("ClaudeCode");
    setCreateEpicError(null);
  };

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
          <div className="flex gap-2">
            <Dialog
              open={editOpen}
              onOpenChange={(open) => {
                setEditOpen(open);
                if (open) {
                  resetEditForm();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Project</DialogTitle>
                  <DialogDescription>
                    Update the project name and description.
                  </DialogDescription>
                </DialogHeader>
                {editError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                    {editError}
                  </div>
                )}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Project name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Optional description"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={editLoading}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleEdit} disabled={editLoading}>
                    {editLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Project</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{project.name}"? This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                    {deleteError}
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteLoading}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {deleteLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <GitFork className="h-5 w-5" />
            Repositories
          </h2>
          <Dialog
            open={addRepoOpen}
            onOpenChange={(open) => {
              setAddRepoOpen(open);
              if (open) {
                resetAddRepoForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Repository
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Repository</DialogTitle>
                <DialogDescription>
                  Select a repository to add to this project.
                </DialogDescription>
              </DialogHeader>
              {addRepoError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {addRepoError}
                </div>
              )}
              {availableRepositories.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  <p>No available repositories.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Create a repository first from the Repositories page.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="select-repo">Repository</Label>
                  <Select
                    value={selectedRepoId}
                    onValueChange={setSelectedRepoId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRepositories.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddRepoOpen(false)}
                  disabled={addRepoLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddRepository}
                  disabled={addRepoLoading || !selectedRepoId}
                >
                  {addRepoLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Repository
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projectRepositories.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <GitFork className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">
                No repositories associated with this project.
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Click "Add Repository" to add one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projectRepositories.map((repo) => (
              <Card
                key={repo.id}
                className="hover:bg-gray-50 transition-colors h-full relative group"
              >
                <Link to={`/repositories/${repo.id}`}>
                  <CardHeader className="pr-12">
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
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemoveRepository(repo.id);
                  }}
                  disabled={removingRepoId === repo.id}
                >
                  {removingRepoId === repo.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Epics Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Epics
          </h2>
          <Dialog
            open={createEpicOpen}
            onOpenChange={(open) => {
              setCreateEpicOpen(open);
              if (open) {
                resetCreateEpicForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create Epic
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Epic</DialogTitle>
                <DialogDescription>
                  Create a new epic to orchestrate tasks across repositories.
                </DialogDescription>
              </DialogHeader>
              {createEpicError && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                  {createEpicError}
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="epic-title">Title</Label>
                  <Input
                    id="epic-title"
                    value={epicTitle}
                    onChange={(e) => setEpicTitle(e.target.value)}
                    placeholder="Epic title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="epic-description">Description</Label>
                  <Textarea
                    id="epic-description"
                    value={epicDescription}
                    onChange={(e) => setEpicDescription(e.target.value)}
                    placeholder="Describe the epic goal and requirements..."
                    rows={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="epic-executor">Executor</Label>
                  <Select
                    value={epicExecutor}
                    onValueChange={(v) => setEpicExecutor(v as Executor)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ClaudeCode">Claude Code</SelectItem>
                      <SelectItem value="Codex">Codex</SelectItem>
                      <SelectItem value="Copilot">Copilot</SelectItem>
                      <SelectItem value="Gemini">Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateEpicOpen(false)}
                  disabled={createEpicLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateEpic}
                  disabled={createEpicLoading || !epicTitle.trim()}
                >
                  {createEpicLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Epic
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {epics.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Layers className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">No epics created yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Create an epic to orchestrate tasks across repositories.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {epics.map((epic) => (
              <Card
                key={epic.id}
                className="hover:bg-gray-50 transition-colors h-full"
              >
                <Link to={`/epics/${epic.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        {epic.title}
                      </CardTitle>
                      <Badge variant="outline">{epic.executor}</Badge>
                    </div>
                    {epic.description && (
                      <CardDescription className="line-clamp-2">
                        {epic.description}
                      </CardDescription>
                    )}
                    <CardDescription className="text-xs">
                      Created {epic.createdAt.toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
