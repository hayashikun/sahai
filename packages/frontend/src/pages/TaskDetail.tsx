import {
  ArrowLeft,
  Calendar,
  Clipboard,
  FolderOpen,
  GitBranch,
  Loader2,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Send,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  ExecutionLog,
  LoadingAnimationType,
  Status,
  Task,
  TaskMessage,
} from "shared";
import {
  deleteQueuedMessage,
  deleteTask,
  finishTask,
  getTaskDiff,
  openWorktreeInExplorer,
  openWorktreeInTerminal,
  pauseTask,
  queueMessage,
  resumeTask,
  startTask,
  updateTask,
} from "../api";
import { getSettings } from "../api/settings";
import { DiffView } from "../components";
import { LoadingAnimation } from "../components/loading-animations";
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
import { useTaskMessagesStream, useTaskWithRealtimeLogs } from "../hooks";
import { cn } from "../lib/utils";

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
    if (resumeLoading) {
      return;
    }
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
    if (!task.worktreePath) {
      return;
    }
    if (worktreeActionLoading) {
      return;
    }
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
    if (!task.worktreePath || worktreeActionLoading) {
      return;
    }
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
    if (!editTitle.trim()) {
      return;
    }

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
        onFinish={() => handleAction(() => finishTask(taskId), "finish task")}
        onDelete={handleDeleteTask}
      />

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
          <TabsTrigger value="diff">Diff View</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <ExecutionLogs
            logs={logs}
            connected={connected}
            error={error}
            isExecuting={task.isExecuting}
          />
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
        taskId={taskId}
        message={resumeMessage}
        loading={resumeLoading}
        onMessageChange={setResumeMessage}
        onSend={handleResume}
        onQueueMessage={async (content) => {
          await queueMessage(taskId, content);
        }}
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
                  if (open) {
                    resetEditForm();
                  }
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
            <Button variant="secondary" onClick={onPause} disabled={loading}>
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
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
  isExecuting?: boolean;
}

function ExecutionLogs({
  logs,
  connected,
  error,
  isExecuting,
}: ExecutionLogsProps) {
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const prevLogsLengthRef = useRef(0);
  const userScrolledUpRef = useRef(false);
  const hasInitialScrolledRef = useRef(false);
  const [animationType, setAnimationType] =
    useState<LoadingAnimationType>("dots");

  // Load animation setting
  useEffect(() => {
    getSettings()
      .then((settings) => {
        setAnimationType(settings["ui.loadingAnimation"] ?? "dots");
      })
      .catch(() => {
        // Use default if failed
      });
  }, []);

  // Handle scroll events to detect if user scrolled up
  const handleScroll = useCallback(() => {
    const container = logsContainerRef.current;
    if (!container) {
      return;
    }

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      50;

    userScrolledUpRef.current = !isAtBottom;
  }, []);

  // Initial scroll to bottom on mount
  useEffect(() => {
    if (hasInitialScrolledRef.current) {
      return;
    }
    const container = logsContainerRef.current;
    if (!container || logs.length === 0) {
      return;
    }

    hasInitialScrolledRef.current = true;
    container.scrollTop = container.scrollHeight;
    prevLogsLengthRef.current = logs.length;
  }, [logs.length]);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (!hasInitialScrolledRef.current) {
      return;
    }
    const container = logsContainerRef.current;
    if (!container) {
      return;
    }

    // If new logs arrived and user hasn't scrolled up, scroll to bottom
    if (logs.length > prevLogsLengthRef.current && !userScrolledUpRef.current) {
      container.scrollTop = container.scrollHeight;
    }

    prevLogsLengthRef.current = logs.length;
  }, [logs.length]);

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
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="rounded-lg border border-gray-200 max-h-[500px] overflow-auto"
        >
          {logs.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              {isExecuting && animationType !== "none" ? (
                <div className="flex flex-col items-center gap-2">
                  <LoadingAnimation type={animationType} />
                  <span className="text-xs">Waiting for logs...</span>
                </div>
              ) : (
                "No logs yet. Start the task to see execution logs."
              )}
            </div>
          ) : (
            <>
              {logs.map((log) => (
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
                    {log.content}
                  </pre>
                </div>
              ))}
              {isExecuting && animationType !== "none" && (
                <div className="px-3 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2">
                  <LoadingAnimation type={animationType} />
                </div>
              )}
            </>
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
  taskId: string;
  message: string;
  loading: boolean;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  onQueueMessage: (content: string) => Promise<void>;
}

type KeyEventLike = Pick<
  React.KeyboardEvent<HTMLTextAreaElement>,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export function shouldSubmitChatMessage(
  event: KeyEventLike,
  canSendMessage: boolean,
  loading: boolean,
): boolean {
  if (event.key !== "Enter" || loading) {
    return false;
  }

  const hasSubmitModifier = event.metaKey || event.ctrlKey;

  return canSendMessage && hasSubmitModifier;
}

export function ChatInput({
  task,
  taskId,
  message,
  loading,
  onMessageChange,
  onSend,
  onQueueMessage,
}: ChatInputProps) {
  const [queueLoading, setQueueLoading] = useState(false);
  const [initialMessages, setInitialMessages] = useState<TaskMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const apiBaseUrl =
    import.meta.env.VITE_API_URL || "http://localhost:49382/v1";

  // Whether to enable message fetching and streaming
  const shouldFetchMessages = task.status !== "TODO" && task.status !== "Done";

  // Use SSE hook for real-time message updates
  const { messages: streamMessages } = useTaskMessagesStream(taskId);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/tasks/${taskId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setInitialMessages(data);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (shouldFetchMessages) {
      fetchMessages();
    } else {
      setMessagesLoading(false);
      setInitialMessages([]);
    }
  }, [shouldFetchMessages, fetchMessages]);

  // Merge initial messages with stream messages
  const messages = [...initialMessages];
  for (const msg of streamMessages) {
    const existingIndex = messages.findIndex((m) => m.id === msg.id);
    if (existingIndex === -1) {
      messages.push(msg);
    } else {
      // Update existing message with stream data
      messages[existingIndex] = msg;
    }
  }
  messages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Can send messages directly when:
  // - Status is InReview (executor not running, waiting for input)
  // - Status is InProgress but executor is NOT running (paused state)
  const canSendDirectly =
    task.status === "InReview" ||
    (task.status === "InProgress" && !task.isExecuting);

  // Can queue messages when:
  // - Status is InProgress and executor IS running
  const canQueueMessage = task.status === "InProgress" && task.isExecuting;

  // Can interact with chat at all
  const canInteract =
    task.status !== "TODO" &&
    task.status !== "Done" &&
    !loading &&
    !queueLoading;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || loading || queueLoading) {
      return;
    }

    const hasSubmitModifier = e.metaKey || e.ctrlKey;
    if (!hasSubmitModifier) {
      return;
    }

    e.preventDefault();

    if (canSendDirectly) {
      onSend();
    } else if (canQueueMessage && message.trim()) {
      handleQueueMessage();
    }
  };

  const handleQueueMessage = async () => {
    if (!message.trim() || queueLoading) {
      return;
    }
    try {
      setQueueLoading(true);
      await onQueueMessage(message.trim());
      onMessageChange("");
      // Refresh messages after queueing
      await fetchMessages();
    } finally {
      setQueueLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    await deleteQueuedMessage(taskId, messageId);
    // Refresh messages after deletion
    await fetchMessages();
  };

  const handleSendOrQueue = () => {
    if (canSendDirectly) {
      onSend();
    } else if (canQueueMessage && message.trim()) {
      handleQueueMessage();
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
      return "Type a message to queue for the agent...";
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
      return "The agent is currently running. Messages will be queued and delivered when the agent completes.";
    }
    return null;
  };

  const hintText = getHintText();
  const buttonDisabled = !(canInteract && (canSendDirectly || canQueueMessage));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Message Queue Display - above input field */}
        {!messagesLoading && (
          <MessageQueueDisplay
            taskId={taskId}
            task={task}
            messages={messages}
            onDelete={handleDeleteMessage}
          />
        )}

        {/* Input area */}
        <div className="flex gap-2 items-end">
          <Textarea
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            disabled={!canInteract}
            className="flex-1 min-h-[80px] resize-y"
            rows={3}
          />
          <Button
            onClick={handleSendOrQueue}
            disabled={buttonDisabled || !message.trim()}
            className="h-10"
          >
            {loading || queueLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : canQueueMessage ? (
              <MessageSquare className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {hintText && <p className="text-xs text-gray-500">{hintText}</p>}
      </CardContent>
    </Card>
  );
}

interface MessageQueueDisplayProps {
  taskId: string;
  task: Task;
  messages: TaskMessage[];
  onDelete: (messageId: string) => Promise<void>;
}

function MessageQueueDisplay({
  task,
  messages,
  onDelete,
}: MessageQueueDisplayProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Only show if there are pending messages and task is in progress
  const pendingMessages = messages.filter((m) => m.status === "pending");

  if (
    pendingMessages.length === 0 ||
    task.status === "TODO" ||
    task.status === "Done"
  ) {
    return null;
  }

  const handleDelete = async (messageId: string) => {
    try {
      setDeletingId(messageId);
      await onDelete(messageId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <MessageSquare className="h-4 w-4" />
        <span>Queued Messages ({pendingMessages.length})</span>
      </div>
      <div className="space-y-2">
        {pendingMessages.map((msg, index) => (
          <QueuedMessageItem
            key={msg.id}
            message={msg}
            index={index}
            deleting={deletingId === msg.id}
            onDelete={() => handleDelete(msg.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface QueuedMessageItemProps {
  message: TaskMessage;
  index: number;
  deleting: boolean;
  onDelete: () => void;
}

function QueuedMessageItem({
  message,
  index,
  deleting,
  onDelete,
}: QueuedMessageItemProps) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-blue-50 border border-blue-200">
      <span className="text-xs text-blue-600 font-medium mt-0.5">
        #{index + 1}
      </span>
      <p className="flex-1 text-sm text-blue-800 break-words">
        {message.content.length > 200
          ? `${message.content.substring(0, 200)}...`
          : message.content}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={deleting}
        className="h-6 w-6 p-0 text-blue-600 hover:text-red-600 hover:bg-red-50"
      >
        {deleting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}
