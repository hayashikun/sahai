import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clipboard,
  FolderOpen,
  GitBranch,
  Loader2,
  Pause,
  Pencil,
  Play,
  Send,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ExecutionLog, Status, Task } from "shared/schemas";
import {
  completeTask,
  deleteTask,
  finishTask,
  getTaskDiff,
  openWorktreeInExplorer,
  openWorktreeInTerminal,
  pauseTask,
  resumeTask,
  startTask,
  updateTask,
} from "../api";
import { DiffView } from "../components";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { useTaskWithRealtimeLogs } from "../hooks";
import { cn } from "../lib/utils";

// Parse Claude Code stream-json output to human-readable format
function parseLogContent(content: string, logType: string): string {
  // Return as-is for stderr and system logs
  if (logType === "stderr" || logType === "system") {
    return content;
  }

  try {
    const parsed = JSON.parse(content);

    // Handle result type (final result)
    if (parsed.type === "result") {
      return parsed.result || "Task completed";
    }

    // Handle system init type
    if (parsed.type === "system" && parsed.subtype === "init") {
      return `[init] Claude Code v${parsed.claude_code_version} started (model: ${parsed.model})`;
    }

    // Handle assistant messages
    if (parsed.type === "assistant" && parsed.message?.content) {
      const contents = parsed.message.content;
      const parts: string[] = [];

      for (const item of contents) {
        if (item.type === "text") {
          parts.push(item.text);
        } else if (item.type === "tool_use") {
          parts.push(
            `[${item.name}] ${JSON.stringify(item.input).slice(0, 100)}...`,
          );
        }
      }

      return parts.join("\n") || content;
    }

    // Handle user messages (tool results)
    if (parsed.type === "user" && parsed.message?.content) {
      const contents = parsed.message.content;
      const parts: string[] = [];

      for (const item of contents) {
        if (item.type === "tool_result") {
          const resultContent =
            typeof item.content === "string"
              ? item.content.slice(0, 200)
              : JSON.stringify(item.content).slice(0, 200);
          parts.push(`[tool_result] ${resultContent}...`);
        }
      }

      return parts.join("\n") || content;
    }

    // Fallback: return stringified JSON
    return content;
  } catch {
    // Not JSON, return as-is
    return content;
  }
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();

  if (!taskId) {
    return (
      <div className="text-center py-10 text-gray-500">Task ID is required</div>
    );
  }

  return <TaskDetailContent taskId={taskId} />;
}

function TaskDetailContent({ taskId }: { taskId: string }) {
  const { task, mutateTask, logs, connected, error } =
    useTaskWithRealtimeLogs(taskId);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resumeMessage, setResumeMessage] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [worktreeActionLoading, setWorktreeActionLoading] = useState<
    "copy" | "explorer" | "terminal" | null
  >(null);

  // Edit task state
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(
    task.description ?? "",
  );
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete task state
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (task.status !== "TODO") {
      setDiffLoading(true);
      setDiffError(null);
      getTaskDiff(taskId)
        .then(setDiff)
        .catch((e) => {
          setDiffError(e instanceof Error ? e.message : "Failed to load diff");
        })
        .finally(() => setDiffLoading(false));
    }
  }, [taskId, task.status]);

  const handleAction = async (
    action: () => Promise<Task>,
    actionName: string,
  ) => {
    try {
      setLoading(true);
      setActionError(null);
      await action();
      mutateTask();
    } catch (e) {
      setActionError(
        `Failed to ${actionName}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (resumeLoading) return;
    try {
      setResumeLoading(true);
      setActionError(null);
      await resumeTask(taskId, resumeMessage || undefined);
      mutateTask();
      setResumeMessage("");
    } catch (e) {
      setActionError(
        `Failed to resume task: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setResumeLoading(false);
    }
  };

  const handleCopyWorktreePath = async () => {
    if (!task.worktreePath) return;
    if (worktreeActionLoading) return;
    try {
      setWorktreeActionLoading("copy");
      await navigator.clipboard.writeText(task.worktreePath);
      setActionError(null);
    } catch (e) {
      setActionError(
        `Failed to copy worktree path: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setWorktreeActionLoading(null);
    }
  };

  const handleWorktreeAction = async (
    action: "explorer" | "terminal",
  ): Promise<void> => {
    if (!task.worktreePath || worktreeActionLoading) return;
    try {
      setWorktreeActionLoading(action);
      setActionError(null);
      if (action === "explorer") {
        await openWorktreeInExplorer(taskId);
      } else {
        await openWorktreeInTerminal(taskId);
      }
    } catch (e) {
      setActionError(
        `Failed to open worktree: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setWorktreeActionLoading(null);
    }
  };

  const handleEditTask = async () => {
    if (!editTitle.trim()) return;

    try {
      setEditLoading(true);
      setEditError(null);
      await updateTask(taskId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      mutateTask();
      setEditOpen(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteTask = async () => {
    try {
      setDeleteLoading(true);
      setDeleteError(null);
      await deleteTask(taskId);
      navigate(`/repositories/${task.repositoryId}`);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete task");
      setDeleteLoading(false);
    }
  };

  const resetEditForm = () => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to={`/repositories/${task.repositoryId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tasks
          </Link>
        </Button>

        <TaskInfo
          task={task}
          editOpen={editOpen}
          setEditOpen={setEditOpen}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editDescription={editDescription}
          setEditDescription={setEditDescription}
          editLoading={editLoading}
          editError={editError}
          onEdit={handleEditTask}
          resetEditForm={resetEditForm}
          onCopyWorktree={handleCopyWorktreePath}
          onOpenWorktreeExplorer={() => handleWorktreeAction("explorer")}
          onOpenWorktreeTerminal={() => handleWorktreeAction("terminal")}
          worktreeActionLoading={worktreeActionLoading}
        />
      </div>

      {actionError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      <TaskActions
        task={task}
        loading={loading}
        deleteLoading={deleteLoading}
        deleteError={deleteError}
        onStart={() => handleAction(() => startTask(taskId), "start task")}
        onPause={() => handleAction(() => pauseTask(taskId), "pause task")}
        onComplete={() =>
          handleAction(() => completeTask(taskId), "complete task")
        }
        onFinish={() => handleAction(() => finishTask(taskId), "finish task")}
        onDelete={handleDeleteTask}
      />

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
          <TabsTrigger value="diff">Diff View</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <ExecutionLogs logs={logs} connected={connected} error={error} />
        </TabsContent>
        <TabsContent value="diff">
          <DiffSection
            task={task}
            diff={diff}
            loading={diffLoading}
            error={diffError}
          />
        </TabsContent>
      </Tabs>

      <ChatInput
        task={task}
        message={resumeMessage}
        loading={resumeLoading}
        onMessageChange={setResumeMessage}
        onSend={handleResume}
      />
    </div>
  );
}

interface TaskInfoProps {
  task: Task;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editTitle: string;
  setEditTitle: (title: string) => void;
  editDescription: string;
  setEditDescription: (description: string) => void;
  editLoading: boolean;
  editError: string | null;
  onEdit: () => void;
  resetEditForm: () => void;
  onCopyWorktree: () => void;
  onOpenWorktreeExplorer: () => void;
  onOpenWorktreeTerminal: () => void;
  worktreeActionLoading: "copy" | "explorer" | "terminal" | null;
}

function TaskInfo({
  task,
  editOpen,
  setEditOpen,
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
  editLoading,
  editError,
  onEdit,
  resetEditForm,
  onCopyWorktree,
  onOpenWorktreeExplorer,
  onOpenWorktreeTerminal,
  worktreeActionLoading,
}: TaskInfoProps) {
  const statusVariant: Record<
    Status,
    "default" | "secondary" | "warning" | "success"
  > = {
    TODO: "secondary",
    InProgress: "default",
    InReview: "warning",
    Done: "success",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">{task.title}</CardTitle>
              <Dialog
                open={editOpen}
                onOpenChange={(open) => {
                  setEditOpen(open);
                  if (open) resetEditForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Task</DialogTitle>
                    <DialogDescription>
                      Update the task title and description.
                    </DialogDescription>
                  </DialogHeader>
                  {editError && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                      {editError}
                    </div>
                  )}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-task-title">Title</Label>
                      <Input
                        id="edit-task-title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Task title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-task-description">Description</Label>
                      <Textarea
                        id="edit-task-description"
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
                    <Button onClick={onEdit} disabled={editLoading}>
                      {editLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {task.description && (
              <p className="text-gray-500 mt-1">{task.description}</p>
            )}
          </div>
          <Badge variant={statusVariant[task.status]}>{task.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <InfoItem label="Executor" value={task.executor} />
          <InfoItem
            label="Branch"
            value={task.branchName}
            icon={<GitBranch className="h-4 w-4" />}
          />
          <InfoItem label="Base Branch" value={task.baseBranch} />
          {task.worktreePath && (
            <div className="space-y-1">
              <p className="text-gray-500 text-xs">Worktree</p>
              <div className="flex items-center gap-2">
                <p className="font-medium flex items-center gap-1 truncate">
                  <span className="truncate font-mono">
                    {task.worktreePath}
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCopyWorktree}
                    title="Copy worktree path"
                    disabled={worktreeActionLoading === "copy"}
                  >
                    {worktreeActionLoading === "copy" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenWorktreeExplorer}
                    title="Open in file explorer"
                    disabled={worktreeActionLoading === "explorer"}
                  >
                    {worktreeActionLoading === "explorer" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenWorktreeTerminal}
                    title="Open in terminal"
                    disabled={worktreeActionLoading === "terminal"}
                  >
                    {worktreeActionLoading === "terminal" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Terminal className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <InfoItem
            label="Created"
            value={formatDate(task.createdAt)}
            icon={<Calendar className="h-4 w-4" />}
          />
          {task.startedAt && (
            <InfoItem label="Started" value={formatDate(task.startedAt)} />
          )}
          {task.completedAt && (
            <InfoItem label="Completed" value={formatDate(task.completedAt)} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="font-medium flex items-center gap-1">
        {icon}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

interface TaskActionsProps {
  task: Task;
  loading: boolean;
  deleteLoading: boolean;
  deleteError: string | null;
  onStart: () => void;
  onPause: () => void;
  onComplete: () => void;
  onFinish: () => void;
  onDelete: () => void;
}

function TaskActions({
  task,
  loading,
  deleteLoading,
  deleteError,
  onStart,
  onPause,
  onComplete,
  onFinish,
  onDelete,
}: TaskActionsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {task.status === "TODO" && (
            <Button onClick={onStart} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Task
            </Button>
          )}

          {task.status === "InProgress" && (
            <>
              <Button variant="secondary" onClick={onPause} disabled={loading}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={onComplete}
                disabled={loading}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark Complete
              </Button>
            </>
          )}

          {task.status === "InReview" && (
            <Button variant="destructive" onClick={onFinish} disabled={loading}>
              <Trash2 className="mr-2 h-4 w-4" />
              Finish (Delete Branch)
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={loading || deleteLoading}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Task
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Task</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{task.title}"? This action
                  cannot be undone.
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
                  onClick={onDelete}
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
      </CardContent>
    </Card>
  );
}

interface ExecutionLogsProps {
  logs: ExecutionLog[];
  connected: boolean;
  error: string | null;
}

function ExecutionLogs({ logs, connected, error }: ExecutionLogsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Execution Logs</CardTitle>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-green-500" : "bg-red-500",
              )}
            />
            <span className="text-xs text-gray-500">
              {connected ? "Live" : "Disconnected"}
            </span>
          </div>
        </div>
        {error && <p className="text-xs text-yellow-600">{error}</p>}
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-gray-200 max-h-[500px] overflow-auto">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No logs yet. Start the task to see execution logs.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "px-3 py-2 border-b border-gray-100 last:border-b-0 font-mono text-xs",
                  log.logType === "stdout" && "bg-white",
                  log.logType === "stderr" && "bg-red-50",
                  log.logType === "system" && "bg-gray-50",
                )}
              >
                <div className="flex justify-end mb-1">
                  <span className="text-gray-400 text-[10px]">
                    {formatTime(log.createdAt)}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-words">
                  {parseLogContent(log.content, log.logType)}
                </pre>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface DiffSectionProps {
  task: Task;
  diff: string | null;
  loading: boolean;
  error: string | null;
}

function DiffSection({ task, diff, loading, error }: DiffSectionProps) {
  if (task.status === "TODO") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-gray-500">
          Start the task to see the diff
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading diff...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
            Error loading diff: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return <DiffView diff={diff ?? ""} />;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

interface ChatInputProps {
  task: Task;
  message: string;
  loading: boolean;
  onMessageChange: (message: string) => void;
  onSend: () => void;
}

function ChatInput({
  task,
  message,
  loading,
  onMessageChange,
  onSend,
}: ChatInputProps) {
  // Can only send messages when:
  // - Status is InReview (executor not running, waiting for input)
  // - Status is InProgress but executor is NOT running (paused state)
  const canSendMessage =
    task.status === "InReview" ||
    (task.status === "InProgress" && !task.isExecuting);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && canSendMessage && !loading) {
      e.preventDefault();
      onSend();
    }
  };

  const getPlaceholder = () => {
    if (task.status === "TODO") {
      return "Start the task to send messages";
    }
    if (task.status === "Done") {
      return "Task is completed";
    }
    if (task.isExecuting) {
      return "Waiting for agent to complete...";
    }
    return "Send additional instructions to the agent...";
  };

  const getHintText = () => {
    if (task.status === "TODO") {
      return "Start the task to send additional instructions to the agent.";
    }
    if (task.status === "Done") {
      return "This task is completed. No further instructions can be sent.";
    }
    if (task.isExecuting) {
      return "The agent is currently running. Wait for it to complete before sending new instructions.";
    }
    return null;
  };

  const hintText = getHintText();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            disabled={!canSendMessage || loading}
            className="flex-1"
          />
          <Button onClick={onSend} disabled={!canSendMessage || loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {hintText && <p className="text-xs text-gray-500 mt-2">{hintText}</p>}
      </CardContent>
    </Card>
  );
}
