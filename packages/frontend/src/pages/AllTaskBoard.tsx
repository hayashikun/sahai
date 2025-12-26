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
import type { Status, TaskWithRepository } from "shared";
import { updateTaskStatus } from "../api";
import { DroppableColumn } from "../components/DroppableColumn";
import { canTransition } from "../components/KanbanBoard";
import { DraggableTaskCard, TaskCard } from "../components/TaskCard";
import { useAllTasks } from "../hooks";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "TODO", label: "TODO" },
  { status: "InProgress", label: "In Progress" },
  { status: "InReview", label: "In Review" },
  { status: "Done", label: "Done" },
];

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
                <DraggableTaskCard
                  key={task.id}
                  task={task}
                  onTaskUpdate={mutateTasks}
                  showRepository
                />
              ))}
            </DroppableColumn>
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} isDragging showRepository />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
