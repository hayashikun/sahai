import {
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createTask,
  deleteRepository,
  getRepositoryBranches,
  getRepositoryGitHubUrl,
  openRepositoryInFinder,
  openRepositoryInTerminal,
  startTask,
  updateRepository,
} from "../api";
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
import { Card, CardContent } from "../components/ui/card";
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
  useRepository,
  useRepositoryTasks,
  useRepositoryTasksStream,
} from "../hooks";

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
  const START_IMMEDIATELY_STORAGE_KEY = "sahai:create-task-start-immediately";
  const { repository, mutate: mutateRepository } = useRepository(repositoryId);
  const { tasks, mutate: mutateTasks } = useRepositoryTasks(repositoryId);
  const navigate = useNavigate();

  // Subscribe to real-time task events via SSE
  const handleTaskEvent = useCallback(() => {
    mutateTasks();
  }, [mutateTasks]);

  useRepositoryTasksStream(repositoryId, handleTaskEvent);

  // Task creation state
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [executor, setExecutor] = useState<string>("Gemini");
  const [branchName, setBranchName] = useState("");
  const [branchNameEdited, setBranchNameEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [startImmediately, setStartImmediately] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedPreference = localStorage.getItem(START_IMMEDIATELY_STORAGE_KEY);
    if (savedPreference) {
      setStartImmediately(savedPreference === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      START_IMMEDIATELY_STORAGE_KEY,
      startImmediately ? "true" : "false",
    );
  }, [startImmediately]);

  const base62Encode = (num: number): string => {
    const chars =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    while (num > 0) {
      result = chars[num % 62] + result;
      num = Math.floor(num / 62);
    }
    return result || "0";
  };

  const titleToBranchName = (title: string): string => {
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) {
      return "";
    }
    const timestamp = base62Encode(Math.floor(Date.now() / 1000));
    return `sahai/${timestamp}-${slug}`;
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!branchNameEdited) {
      setBranchName(titleToBranchName(newTitle));
    }
  };

  const handleBranchNameChange = (newBranchName: string) => {
    setBranchName(newBranchName);
    setBranchNameEdited(true);
  };

  // Edit repository state
  const [editOpen, setEditOpen] = useState(false);
  const [editDescription, setEditDescription] = useState(
    repository.description || "",
  );
  const [editDefaultBranch, setEditDefaultBranch] = useState(
    repository.defaultBranch,
  );
  const [editSetupScript, setEditSetupScript] = useState(
    repository.setupScript || "",
  );
  const [editStartScript, setEditStartScript] = useState(
    repository.startScript || "",
  );
  const [editStopScript, setEditStopScript] = useState(
    repository.stopScript || "",
  );
  const [editCleanupScript, setEditCleanupScript] = useState(
    repository.cleanupScript || "",
  );
  const [editCopyFiles, setEditCopyFiles] = useState(
    repository.copyFiles || "",
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Delete repository state
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Quick actions state
  const [githubUrl, setGithubUrl] = useState<string | null>(null);

  useEffect(() => {
    getRepositoryGitHubUrl(repositoryId)
      .then(setGithubUrl)
      .catch(console.error);
  }, [repositoryId]);

  const handleOpenFinder = async () => {
    try {
      await openRepositoryInFinder(repositoryId);
    } catch (e) {
      console.error("Failed to open Finder:", e);
    }
  };

  const handleOpenTerminal = async () => {
    try {
      await openRepositoryInTerminal(repositoryId);
    } catch (e) {
      console.error("Failed to open Terminal:", e);
    }
  };

  const resetTaskForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setExecutor("ClaudeCode");
    setBranchName("");
    setBranchNameEdited(false);
    setError(null);
  }, []);

  const handleCreateTask = useCallback(async () => {
    if (creating) {
      return;
    }
    if (!(title.trim() && branchName.trim())) {
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const newTask = await createTask(repositoryId, {
        title: title.trim(),
        description: description.trim() || undefined,
        executor,
        branchName: branchName.trim(),
      });
      if (startImmediately) {
        try {
          await startTask(newTask.id);
        } catch (e) {
          setError(
            e instanceof Error
              ? `Task created but failed to start: ${e.message}`
              : "Task created but failed to start",
          );
          mutateTasks();
          return;
        }
      }
      resetTaskForm();
      setCreateTaskOpen(false);
      mutateTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }, [
    branchName,
    creating,
    description,
    executor,
    mutateTasks,
    repositoryId,
    startImmediately,
    title,
    resetTaskForm,
  ]);

  useEffect(() => {
    if (!createTaskOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleCreateTask();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createTaskOpen, handleCreateTask]);

  const handleEditRepository = async () => {
    if (!editDefaultBranch.trim()) {
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);
      await updateRepository(repositoryId, {
        description: editDescription.trim() || undefined,
        defaultBranch: editDefaultBranch.trim(),
        // Lifecycle scripts - send null if empty to clear
        setupScript: editSetupScript.trim() || null,
        startScript: editStartScript.trim() || null,
        stopScript: editStopScript.trim() || null,
        cleanupScript: editCleanupScript.trim() || null,
        copyFiles: editCopyFiles.trim() || null,
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
      navigate("/repositories");
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Failed to delete repository",
      );
      setDeleteLoading(false);
    }
  };

  const loadBranches = async () => {
    setBranchesLoading(true);
    try {
      const branchList = await getRepositoryBranches(repositoryId);
      setBranches(branchList);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to load branches");
    } finally {
      setBranchesLoading(false);
    }
  };

  const resetEditForm = () => {
    setEditDescription(repository.description || "");
    setEditDefaultBranch(repository.defaultBranch);
    setEditSetupScript(repository.setupScript || "");
    setEditStartScript(repository.startScript || "");
    setEditStopScript(repository.stopScript || "");
    setEditCleanupScript(repository.cleanupScript || "");
    setEditCopyFiles(repository.copyFiles || "");
    setEditError(null);
    setBranches([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/repositories">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Repositories
          </Link>
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {repository.name}
            </h1>
            {repository.description && (
              <p className="mt-1 text-gray-600">{repository.description}</p>
            )}
            <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
              <GitBranch className="h-4 w-4" />
              {repository.defaultBranch}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500">
              <span className="font-mono break-all">{repository.path}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenFinder}
                  title="Open in Finder"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenTerminal}
                  title="Open in Terminal"
                >
                  <Terminal className="h-4 w-4" />
                </Button>
              </div>
              {githubUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    GitHub
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Dialog
              open={editOpen}
              onOpenChange={(open) => {
                setEditOpen(open);
                if (open) {
                  resetEditForm();
                  loadBranches();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Repository</DialogTitle>
                  <DialogDescription>
                    Update the repository details and lifecycle configuration.
                  </DialogDescription>
                </DialogHeader>
                {editError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                    {editError}
                  </div>
                )}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-repo-description">Description</Label>
                    <Textarea
                      id="edit-repo-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Describe the role of this repository"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-repo-branch">Default Branch</Label>
                    {branchesLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading branches...
                      </div>
                    ) : (
                      <Select
                        value={editDefaultBranch}
                        onValueChange={setEditDefaultBranch}
                      >
                        <SelectTrigger id="edit-repo-branch">
                          <SelectValue placeholder="Select a branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Setup & Cleanup Configuration */}
                  <details className="group">
                    <summary className="cursor-pointer font-medium text-sm text-gray-700 hover:text-gray-900 py-2 border-t pt-4 list-none flex items-center gap-2">
                      <span className="text-xs transition-transform group-open:rotate-90">
                        ▶
                      </span>
                      Setup & Cleanup Configuration
                    </summary>
                    <div className="space-y-4 mt-4 pl-4 border-l-2 border-gray-100">
                      <div className="space-y-2">
                        <Label htmlFor="edit-repo-setup-script">
                          Setup Script
                        </Label>
                        <p className="text-xs text-gray-500">
                          Runs only on the first task start (initial setup)
                        </p>
                        <Textarea
                          id="edit-repo-setup-script"
                          value={editSetupScript}
                          onChange={(e) => setEditSetupScript(e.target.value)}
                          placeholder="#!/bin/bash&#10;# Initial setup commands..."
                          rows={3}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-repo-start-script">
                          Start Script
                        </Label>
                        <p className="text-xs text-gray-500">
                          Runs on every task start and resume
                        </p>
                        <Textarea
                          id="edit-repo-start-script"
                          value={editStartScript}
                          onChange={(e) => setEditStartScript(e.target.value)}
                          placeholder="#!/bin/bash&#10;# Commands to run on start/resume..."
                          rows={3}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-repo-stop-script">
                          Stop Script
                        </Label>
                        <p className="text-xs text-gray-500">
                          Runs when task completes and moves to "In Review"
                        </p>
                        <Textarea
                          id="edit-repo-stop-script"
                          value={editStopScript}
                          onChange={(e) => setEditStopScript(e.target.value)}
                          placeholder="#!/bin/bash&#10;# Commands to run on completion..."
                          rows={3}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-repo-cleanup-script">
                          Cleanup Script
                        </Label>
                        <p className="text-xs text-gray-500">
                          Runs when task is finished (deleted)
                        </p>
                        <Textarea
                          id="edit-repo-cleanup-script"
                          value={editCleanupScript}
                          onChange={(e) => setEditCleanupScript(e.target.value)}
                          placeholder="#!/bin/bash&#10;# Cleanup commands..."
                          rows={3}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-repo-copy-files">Copy Files</Label>
                        <p className="text-xs text-gray-500">
                          Files to copy from the original repository to the
                          worktree (one path per line, supports glob patterns)
                        </p>
                        <Textarea
                          id="edit-repo-copy-files"
                          value={editCopyFiles}
                          onChange={(e) => setEditCopyFiles(e.target.value)}
                          placeholder=".env&#10;config/local.json&#10;secrets/*.key"
                          rows={3}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </details>
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
        <Dialog
          open={createTaskOpen}
          onOpenChange={(open) => {
            setCreateTaskOpen(open);
            if (open) {
              resetTaskForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Create a new task for this repository.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter task title"
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
                      <SelectItem value="Copilot">
                        GitHub Copilot CLI
                      </SelectItem>
                      <SelectItem value="Gemini">Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-branch">Branch Name</Label>
                  <Input
                    id="task-branch"
                    type="text"
                    value={branchName}
                    onChange={(e) => handleBranchNameChange(e.target.value)}
                    placeholder="sahai/2b9MEx-add-some-feature"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={startImmediately}
                  onChange={(e) => setStartImmediately(e.target.checked)}
                />
                <span>Start immediately</span>
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateTaskOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateTask} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <ClipboardList className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No tasks yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Click "New Task" to create one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <KanbanBoard tasks={tasks} onTaskUpdate={mutateTasks} />
      )}
    </div>
  );
}
