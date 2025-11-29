import { ArrowLeft, GitBranch, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createTask } from "../api";
import { KanbanBoard } from "../components";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
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
  const repository = useRepository(repositoryId);
  const { tasks, mutate } = useRepositoryTasks(repositoryId);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [executor, setExecutor] = useState<string>("ClaudeCode");
  const [branchName, setBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!repository) {
    return (
      <div className="text-center py-10 text-gray-500">
        Repository not found
      </div>
    );
  }

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
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
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

        <h1 className="text-3xl font-bold tracking-tight">{repository.name}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span className="font-mono">{repository.path}</span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" />
            {repository.defaultBranch}
          </span>
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

      <KanbanBoard tasks={tasks} onTaskUpdate={mutate} />
    </div>
  );
}
