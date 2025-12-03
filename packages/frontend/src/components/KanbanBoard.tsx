import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import type { Status, Task } from "shared/schemas";
import { updateTaskStatus } from "../api";
import { DroppableColumn } from "./DroppableColumn";
import { DraggableTaskCard, TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  tasks: Task[];
  onTaskUpdate?: () => void;
}

const COLUMNS: { status: Status; label: string }[] = [
  { status: "TODO", label: "TODO" },
  { status: "InProgress", label: "In Progress" },
  { status: "InReview", label: "In Review" },
  { status: "Done", label: "Done" },
];

const VALID_TRANSITIONS: Record<Status, Status[]> = {
  TODO: ["InProgress"],
  InProgress: ["TODO", "InReview"],
  InReview: ["InProgress", "Done"],
  Done: ["InReview"],
};

export function canTransition(from: Status, to: Status): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS[from].includes(to);
}

export function KanbanBoard({ tasks, onTaskUpdate }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
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

    if (!over || updating) return;

    const taskId = active.id as string;
    const newStatus = over.id as Status;
    const task = tasks.find((t) => t.id === taskId);

    if (!task || task.status === newStatus) return;
    if (!canTransition(task.status, newStatus)) return;

    try {
      setUpdating(true);
      await updateTaskStatus(taskId, newStatus);
      onTaskUpdate?.();
    } catch (error) {
      console.error("Failed to update task status:", error);
    } finally {
      setUpdating(false);
    }
  };

  return (
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
              <DraggableTaskCard
                key={task.id}
                task={task}
                onTaskUpdate={onTaskUpdate}
              />
            ))}
          </DroppableColumn>
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
