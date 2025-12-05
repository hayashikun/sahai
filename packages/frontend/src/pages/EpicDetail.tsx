import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Pencil,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Status as StatusType } from "shared";
import { deleteEpic, startEpic, updateEpic } from "../api";
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
import { Textarea } from "../components/ui/textarea";
import { useEpic, useEpicTasks } from "../hooks";

export function EpicDetail() {
  const { epicId } = useParams<{ epicId: string }>();

  if (!epicId) {
    return (
      <div className="text-center py-10 text-gray-500">Epic ID is required</div>
    );
  }

  return <EpicDetailContent epicId={epicId} />;
}

function getStatusIcon(status: StatusType) {
  switch (status) {
    case "TODO":
      return <Circle className="h-4 w-4 text-gray-400" />;
    case "InProgress":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "InReview":
      return <Search className="h-4 w-4 text-yellow-500" />;
    case "Done":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
}

function getStatusBadge(status: StatusType) {
  const variants: Record<StatusType, string> = {
    TODO: "bg-gray-100 text-gray-800",
    InProgress: "bg-blue-100 text-blue-800",
    InReview: "bg-yellow-100 text-yellow-800",
    Done: "bg-green-100 text-green-800",
  };
  return variants[status];
}

function EpicDetailContent({ epicId }: { epicId: string }) {
  const { epic, mutate } = useEpic(epicId);
  const { tasks, mutate: mutateTasks } = useEpicTasks(epicId);
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(epic.title);
  const [editDescription, setEditDescription] = useState(
    epic.description ?? "",
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Calculate task statistics
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "Done").length;
    const inProgress = tasks.filter((t) => t.status === "InProgress").length;
    const inReview = tasks.filter((t) => t.status === "InReview").length;
    const todo = tasks.filter((t) => t.status === "TODO").length;
    return { total, completed, inProgress, inReview, todo };
  }, [tasks]);

  // Group tasks by repository
  const tasksByRepository = useMemo(() => {
    const grouped: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (!grouped[task.repositoryId]) {
        grouped[task.repositoryId] = [];
      }
      grouped[task.repositoryId].push(task);
    }
    return grouped;
  }, [tasks]);

  const handleEdit = async () => {
    if (!editTitle.trim()) return;

    try {
      setEditLoading(true);
      setEditError(null);
      await updateEpic(epicId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      mutate();
      setEditOpen(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update epic");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await deleteEpic(epicId);
      navigate(`/projects/${epic.projectId}`);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete epic");
      setDeleteLoading(false);
    }
  };

  const handleStart = async () => {
    try {
      setStartLoading(true);
      setStartError(null);
      await startEpic(epicId);
      mutateTasks();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Failed to start epic");
    } finally {
      setStartLoading(false);
    }
  };

  const resetEditForm = () => {
    setEditTitle(epic.title);
    setEditDescription(epic.description ?? "");
    setEditError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to={`/projects/${epic.projectId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Project
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {epic.title}
              </h1>
              <Badge variant="outline">{epic.executor}</Badge>
            </div>
            {epic.description && (
              <p className="text-gray-500 mt-1 whitespace-pre-wrap">
                {epic.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleStart}
              disabled={startLoading}
            >
              {startLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Execution
            </Button>

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
                  <DialogTitle>Edit Epic</DialogTitle>
                  <DialogDescription>
                    Update the epic title and description.
                  </DialogDescription>
                </DialogHeader>
                {editError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                    {editError}
                  </div>
                )}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input
                      id="edit-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Epic title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Optional description"
                      rows={5}
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
                  <AlertDialogTitle>Delete Epic</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{epic.title}"? This action
                    cannot be undone. Tasks created by this epic will remain but
                    will no longer be associated with it.
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

      {startError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {startError}
        </div>
      )}

      {/* Task Statistics */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tasks</CardDescription>
            <CardTitle className="text-2xl">{taskStats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>TODO</CardDescription>
            <CardTitle className="text-2xl text-gray-600">
              {taskStats.todo}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Progress</CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              {taskStats.inProgress}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Review</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">
              {taskStats.inReview}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {taskStats.completed}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Related Tasks */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Related Tasks</h2>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Circle className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">No tasks created yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Start the epic execution to create tasks automatically.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(tasksByRepository).map(([repoId, repoTasks]) => (
              <div key={repoId}>
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  Repository: {repoId.slice(0, 8)}...
                </h3>
                <div className="space-y-2">
                  {repoTasks.map((task) => (
                    <Link key={task.id} to={`/tasks/${task.id}`}>
                      <Card className="hover:bg-gray-50 transition-colors">
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(task.status)}
                              <CardTitle className="text-base">
                                {task.title}
                              </CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {task.executor}
                              </Badge>
                              <Badge className={getStatusBadge(task.status)}>
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
