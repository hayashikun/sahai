import {
  ArrowLeft,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createTask, deleteRepository, updateRepository } from "../api";
import { KanbanBoard } from "../components";
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
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
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
import { useRepository, useRepositoryTasks } from "../hooks";

export function RepositoryDetail() {
  const { repositoryId } = useParams<{ repositoryId: string }>();

  if (!repositoryId) {
    return (
      <div className="text-center py-10 text-gray-500">
        Repository ID is required
      </div>
    );
  }

  return <RepositoryDetailContent repositoryId={repositoryId} />;
}

function RepositoryDetailContent({ repositoryId }: { repositoryId: string }) {
  const { repository, mutate: mutateRepository } = useRepository(repositoryId);
  const { tasks, mutate: mutateTasks } = useRepositoryTasks(repositoryId);
  const navigate = useNavigate();

  // Task creation state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [executor, setExecutor] = useState<string>("ClaudeCode");
  const [branchName, setBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit repository state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(repository.name);
  const [editPath, setEditPath] = useState(repository.path);
  const [editDefaultBranch, setEditDefaultBranch] = useState(
    repository.defaultBranch,
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete repository state
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !branchName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      await createTask(repositoryId, {
        title: title.trim(),
        description: description.trim() || undefined,
        executor,
        branchName: branchName.trim(),
      });
      setTitle("");
      setDescription("");
      setBranchName("");
      setShowForm(false);
      mutateTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  const handleEditRepository = async () => {
    if (!editName.trim() || !editPath.trim()) return;

    try {
      setEditLoading(true);
      setEditError(null);
      await updateRepository(repositoryId, {
        name: editName.trim(),
        path: editPath.trim(),
        defaultBranch: editDefaultBranch.trim() || undefined,
      });
      mutateRepository();
      setEditOpen(false);
    } catch (e) {
      setEditError(
        e instanceof Error ? e.message : "Failed to update repository",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteRepository = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await deleteRepository(repositoryId);
      navigate("/projects");
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to delete repository",
      );
      setDeleteLoading(false);
    }
  };

  const resetEditForm = () => {
    setEditName(repository.name);
    setEditPath(repository.path);
    setEditDefaultBranch(repository.defaultBranch);
    setEditError(null);
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
              {repository.name}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="font-mono">{repository.path}</span>
              <span className="flex items-center gap-1">
                <GitBranch className="h-4 w-4" />
                {repository.defaultBranch}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog
              open={editOpen}
              onOpenChange={(open) => {
                setEditOpen(open);
                if (open) resetEditForm();
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
                  <DialogTitle>Edit Repository</DialogTitle>
                  <DialogDescription>
                    Update the repository details.
                  </DialogDescription>
                </DialogHeader>
                {editError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                    {editError}
                  </div>
                )}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-repo-name">Name</Label>
                    <Input
                      id="edit-repo-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Repository name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-repo-path">Path</Label>
                    <Input
                      id="edit-repo-path"
                      value={editPath}
                      onChange={(e) => setEditPath(e.target.value)}
                      placeholder="/path/to/repository"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-repo-branch">Default Branch</Label>
                    <Input
                      id="edit-repo-branch"
                      value={editDefaultBranch}
                      onChange={(e) => setEditDefaultBranch(e.target.value)}
                      placeholder="main"
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
                  <Button onClick={handleEditRepository} disabled={editLoading}>
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
                  <AlertDialogTitle>Delete Repository</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{repository.name}"?
                    {tasks.length > 0 && (
                      <span className="block mt-2 text-yellow-600">
                        Warning: This repository has {tasks.length} task(s)
                        associated with it.
                      </span>
                    )}
                    This action cannot be undone.
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
                    onClick={handleDeleteRepository}
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

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tasks</h2>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Create New Task</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowForm(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter task title"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="task-executor">Executor</Label>
                  <Select value={executor} onValueChange={setExecutor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select executor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ClaudeCode">Claude Code</SelectItem>
                      <SelectItem value="Codex">Codex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-branch">Branch Name</Label>
                  <Input
                    id="task-branch"
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="feature/my-branch"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {creating ? "Creating..." : "Create Task"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <KanbanBoard tasks={tasks} onTaskUpdate={mutateTasks} />
    </div>
  );
}
