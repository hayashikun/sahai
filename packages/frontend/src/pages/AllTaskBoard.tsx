import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
import type { Status, TaskWithRepository } from "shared";
import {
  deleteTask,
  finishTask,
  pauseTask,
  startTask,
  updateTaskStatus,
} from "../api";
import { DroppableColumn } from "../components/DroppableColumn";
import { canTransition } from "../components/KanbanBoard";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { useAllTasks, usePendingMessageCount } from "../hooks";
import { cn } from "../lib/utils";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "TODO", label: "TODO" },
  { status: "InProgress", label: "In Progress" },
  { status: "InReview", label: "In Review" },
  { status: "Done", label: "Done" },
];

interface TaskCardWithRepoProps {
  task: TaskWithRepository;
  isDragging?: boolean;
  onTaskUpdate?: () => void;
}

function TaskCardWithRepo({
  task,
  isDragging,
  onTaskUpdate,
}: TaskCardWithRepoProps) {
  const [loading, setLoading] = useState(false);

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
          {/* Row 1: Repository, Branch */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/repositories/${task.repositoryId}`}
              className="flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-200"
              onClick={(e) => e.stopPropagation()}
              title="Repository"
            >
              <GitFork className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[80px]">
                {task.repositoryName}
              </span>
            </Link>
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{task.branchName}</span>
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

interface DraggableTaskCardWithRepoProps {
  task: TaskWithRepository;
  onTaskUpdate?: () => void;
}

function DraggableTaskCardWithRepo({
  task,
  onTaskUpdate,
}: DraggableTaskCardWithRepoProps) {
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
      <TaskCardWithRepo task={task} onTaskUpdate={onTaskUpdate} />
    </div>
  );
}

export function AllTaskBoard() {
  const { tasks, mutate: mutateTasks } = useAllTasks();
  const [activeTask, setActiveTask] = useState<TaskWithRepository | null>(null);
  const [updating, setUpdating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const tasksByStatus = (status: Status) =>
    tasks.filter((task) => task.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || updating) {
      return;
    }

    const taskId = active.id as string;
    const newStatus = over.id as Status;
    const task = tasks.find((t) => t.id === taskId);

    if (!task || task.status === newStatus) {
      return;
    }
    if (!canTransition(task.status, newStatus)) {
      return;
    }

    try {
      setUpdating(true);
      await updateTaskStatus(taskId, newStatus);
      mutateTasks();
    } catch (error) {
      console.error("Failed to update task status:", error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Tasks</h1>
        <p className="text-gray-500 mt-1">
          View and manage tasks across all repositories
        </p>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((column) => (
            <DroppableColumn
              key={column.status}
              status={column.status}
              label={column.label}
              isValidDrop={
                activeTask
                  ? canTransition(activeTask.status, column.status)
                  : false
              }
              isActive={!!activeTask}
            >
              {tasksByStatus(column.status).map((task) => (
                <DraggableTaskCardWithRepo
                  key={task.id}
                  task={task}
                  onTaskUpdate={mutateTasks}
                />
              ))}
            </DroppableColumn>
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCardWithRepo task={activeTask} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
