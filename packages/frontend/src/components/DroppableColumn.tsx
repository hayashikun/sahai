import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { Status } from "shared/schemas";
import { cn } from "../lib/utils";

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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg p-3 min-h-[200px] transition-colors border-2",
        !isActive && "bg-gray-100/50 border-transparent",
        isActive && !isValidDrop && "bg-gray-100/50 border-transparent",
        isActive && isValidDrop && !isOver && "bg-green-50 border-transparent",
        isActive &&
          isValidDrop &&
          isOver &&
          "bg-green-100 border-dashed border-green-500",
        isActive && !isValidDrop && isOver && "bg-red-50 border-transparent",
      )}
    >
      <h4 className="text-sm font-semibold text-center mb-3 text-gray-500">
        {label}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
