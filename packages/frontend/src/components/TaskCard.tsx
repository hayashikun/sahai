import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GitBranch } from "lucide-react";
import { Link } from "react-router-dom";
import type { Task } from "shared/schemas";
import { cn } from "../lib/utils";
import { Card, CardContent } from "./ui/card";

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
  return (
    <Card
      className={cn("transition-shadow", isDragging && "opacity-80 shadow-lg")}
    >
      <CardContent className="p-3">
        <Link
          to={`/tasks/${task.id}`}
          className="font-medium text-sm hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {task.title}
        </Link>
        {task.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
            {task.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          <span className="bg-gray-100 px-1.5 py-0.5 rounded">
            {task.executor}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {task.branchName}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface DraggableTaskCardProps {
  task: Task;
}

export function DraggableTaskCard({ task }: DraggableTaskCardProps) {
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
      <TaskCard task={task} />
    </div>
  );
}
