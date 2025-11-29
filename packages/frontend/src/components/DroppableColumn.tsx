import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { Status } from "shared/schemas";

interface DroppableColumnProps {
  status: Status;
  label: string;
  children: ReactNode;
  isValidDrop: boolean;
  isActive: boolean;
}

export function DroppableColumn({
  status,
  label,
  children,
  isValidDrop,
  isActive,
}: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
  });

  const getBackgroundColor = () => {
    if (!isActive) return "#f5f5f5";
    if (isOver && isValidDrop) return "#d4edda";
    if (isOver && !isValidDrop) return "#f8d7da";
    if (isValidDrop) return "#e8f5e9";
    return "#f5f5f5";
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        backgroundColor: getBackgroundColor(),
        borderRadius: "4px",
        padding: "8px",
        minHeight: "200px",
        transition: "background-color 0.2s ease",
        border:
          isOver && isValidDrop
            ? "2px dashed #28a745"
            : "2px solid transparent",
      }}
    >
      <h4 style={{ margin: "0 0 12px 0", textAlign: "center" }}>{label}</h4>
      {children}
    </div>
  );
}
