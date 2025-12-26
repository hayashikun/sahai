import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle,
  GitBranch,
  GitFork,
  Layers,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Task, TaskWithRepository } from "shared";
import { deleteTask, finishTask, pauseTask, startTask } from "../api";
import { usePendingMessageCount } from "../hooks";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface TaskCardProps {
  task: Task | TaskWithRepository;
  isDragging?: boolean;
  onTaskUpdate?: () => void;
  showRepository?: boolean;
}

export function TaskCard({
  task,
  isDragging,
  onTaskUpdate,
  showRepository,
}: TaskCardProps) {
  const [loading, setLoading] = useState(false);
  const repositoryName =
    "repositoryName" in task ? task.repositoryName : undefined;
  const showRepositoryInfo = Boolean(showRepository && repositoryName);

  const handleAction = async (
    action: () => Promise<unknown>,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setLoading(true);
      await action();
      onTaskUpdate?.();
    } catch (error) {
      console.error("Action failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${task.title}"?`)) {
      return;
    }
    try {
      setLoading(true);
      await deleteTask(task.id);
      onTaskUpdate?.();
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className={cn("transition-shadow", isDragging && "opacity-80 shadow-lg")}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/tasks/${task.id}`}
            className="font-medium text-sm hover:underline flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            {task.title}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => e.stopPropagation()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {task.status === "TODO" && (
                <DropdownMenuItem
                  onClick={(e) => handleAction(() => startTask(task.id), e)}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start
                </DropdownMenuItem>
              )}
              {task.status === "InProgress" && (
                <DropdownMenuItem
                  onClick={(e) => handleAction(() => pauseTask(task.id), e)}
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </DropdownMenuItem>
              )}
              {task.status === "InReview" && (
                <DropdownMenuItem
                  onClick={(e) => handleAction(() => finishTask(task.id), e)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Finish
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {task.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {task.description}
          </p>
        )}
        <div className="mt-2 text-xs text-gray-500 space-y-1">
          {/* Row 1: Repository (optional) + Branch */}
          <div
            className={cn(
              "flex items-center min-w-0",
              showRepositoryInfo ? "gap-2 flex-wrap" : "gap-1",
            )}
          >
            {showRepositoryInfo ? (
              <Link
                to={`/repositories/${task.repositoryId}`}
                className="flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-200"
                onClick={(e) => e.stopPropagation()}
                title="Repository"
              >
                <GitFork className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[120px]">{repositoryName}</span>
              </Link>
            ) : null}
            <span
              className={cn(
                "flex items-center gap-1 min-w-0",
                showRepositoryInfo && "flex-1",
              )}
            >
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate" title={task.branchName}>
                {task.branchName}
              </span>
            </span>
          </div>
          {/* Row 2: Executor, QueueCount */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-gray-100 px-1.5 py-0.5 rounded">
              {task.executor}
            </span>
            {(task.status === "InProgress" || task.status === "InReview") && (
              <MessageQueueIndicator taskId={task.id} />
            )}
          </div>
          {/* Row 3: Epic name */}
          {task.epicId && task.epicTitle && (
            <div>
              <Link
                to={`/epics/${task.epicId}`}
                className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded hover:bg-purple-200 max-w-full"
                onClick={(e) => e.stopPropagation()}
                title={task.epicTitle}
              >
                <Layers className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.epicTitle}</span>
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MessageQueueIndicator({ taskId }: { taskId: string }) {
  const { count } = usePendingMessageCount(taskId);

  if (count === 0) {
    return null;
  }

  return (
    <span
      className="flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
      title={`${count} queued message${count === 1 ? "" : "s"}`}
    >
      <MessageSquare className="h-3 w-3" />
      {count}
    </span>
  );
}

interface DraggableTaskCardProps {
  task: Task | TaskWithRepository;
  onTaskUpdate?: () => void;
  showRepository?: boolean;
}

export function DraggableTaskCard({
  task,
  onTaskUpdate,
  showRepository,
}: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        cursor: "grab",
      }}
      {...listeners}
      {...attributes}
    >
      <TaskCard
        task={task}
        onTaskUpdate={onTaskUpdate}
        showRepository={showRepository}
      />
    </div>
  );
}
