import type { Task } from "shared/types";
import { Status } from "shared/types";
import { TaskCard } from "./TaskCard";

interface KanbanBoardProps {
  tasks: Task[];
}

const COLUMNS: { status: Task["status"]; label: string }[] = [
  { status: Status.TODO, label: "TODO" },
  { status: Status.InProgress, label: "In Progress" },
  { status: Status.InReview, label: "In Review" },
  { status: Status.Done, label: "Done" },
];

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  const tasksByStatus = (status: Task["status"]) =>
    tasks.filter((task) => task.status === status);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
      }}
    >
      {COLUMNS.map((column) => (
        <div
          key={column.status}
          style={{
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
            padding: "8px",
            minHeight: "200px",
          }}
        >
          <h4 style={{ margin: "0 0 12px 0", textAlign: "center" }}>
            {column.label}
          </h4>
          {tasksByStatus(column.status).map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
}
