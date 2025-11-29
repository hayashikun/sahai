import type { Task } from "shared/schemas";

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "8px",
        marginBottom: "8px",
        backgroundColor: "#fff",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
        {task.title}
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
