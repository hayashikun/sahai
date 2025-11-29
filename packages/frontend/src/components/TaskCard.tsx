import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import type { Task } from "shared/schemas";

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "8px",
        marginBottom: "8px",
        backgroundColor: "#fff",
        opacity: isDragging ? 0.8 : 1,
        boxShadow: isDragging ? "0 4px 8px rgba(0,0,0,0.2)" : "none",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
        <Link
          to={`/tasks/${task.id}`}
          style={{ color: "inherit", textDecoration: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          {task.title}
        </Link>
      </div>
      {task.description && (
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
          {task.description}
        </div>
      )}
      <div style={{ fontSize: "11px", color: "#888" }}>
        <span>{task.executor}</span>
        <span style={{ marginLeft: "8px" }}>{task.branchName}</span>
      </div>
    </div>
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

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} />
    </div>
  );
}
