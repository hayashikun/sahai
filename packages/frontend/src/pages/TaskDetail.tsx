import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ExecutionLog, Status, Task } from "shared/schemas";
import {
  completeTask,
  finishTask,
  getTaskDiff,
  pauseTask,
  resumeTask,
  startTask,
} from "../api";
import { DiffView } from "../components";
import { useTaskWithRealtimeLogs } from "../hooks";

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();

  if (!taskId) {
    return <div>Task ID is required</div>;
  }

  return <TaskDetailContent taskId={taskId} />;
}

type TabType = "logs" | "diff";

function TaskDetailContent({ taskId }: { taskId: string }) {
  const { task, mutateTask, logs, connected, error } =
    useTaskWithRealtimeLogs(taskId);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resumeMessage, setResumeMessage] = useState("");
  const [showResumeForm, setShowResumeForm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("logs");
  const [diff, setDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Load diff when switching to diff tab or when task status changes
  useEffect(() => {
    if (activeTab === "diff" && task.status !== "TODO") {
      setDiffLoading(true);
      setDiffError(null);
      getTaskDiff(taskId)
        .then(setDiff)
        .catch((e) => {
          setDiffError(e instanceof Error ? e.message : "Failed to load diff");
        })
        .finally(() => setDiffLoading(false));
    }
  }, [activeTab, taskId, task.status]);

  const handleAction = async (
    action: () => Promise<Task>,
    actionName: string,
  ) => {
    try {
      setLoading(true);
      setActionError(null);
      await action();
      mutateTask();
    } catch (e) {
      setActionError(
        `Failed to ${actionName}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    await handleAction(
      () => resumeTask(taskId, resumeMessage || undefined),
      "resume task",
    );
    setResumeMessage("");
    setShowResumeForm(false);
  };

  return (
    <div>
      <Link to={`/repositories/${task.repositoryId}`}>
        &larr; Back to Tasks
      </Link>

      <TaskInfo task={task} />

      {actionError && (
        <div
          style={{
            color: "red",
            padding: "8px",
            margin: "16px 0",
            border: "1px solid red",
            borderRadius: "4px",
          }}
        >
          {actionError}
        </div>
      )}

      <TaskActions
        task={task}
        loading={loading}
        showResumeForm={showResumeForm}
        resumeMessage={resumeMessage}
        onStart={() => handleAction(() => startTask(taskId), "start task")}
        onPause={() => handleAction(() => pauseTask(taskId), "pause task")}
        onComplete={() =>
          handleAction(() => completeTask(taskId), "complete task")
        }
        onResume={handleResume}
        onFinish={() => handleAction(() => finishTask(taskId), "finish task")}
        onShowResumeForm={() => setShowResumeForm(true)}
        onCancelResume={() => {
          setShowResumeForm(false);
          setResumeMessage("");
        }}
        onResumeMessageChange={setResumeMessage}
      />

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "logs" && (
        <ExecutionLogs logs={logs} connected={connected} error={error} />
      )}

      {activeTab === "diff" && (
        <DiffSection
          task={task}
          diff={diff}
          loading={diffLoading}
          error={diffError}
        />
      )}
    </div>
  );
}

function TaskInfo({ task }: { task: Task }) {
  const statusColors: Record<Status, string> = {
    TODO: "#6b7280",
    InProgress: "#3b82f6",
    InReview: "#f59e0b",
    Done: "#10b981",
  };

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <h2 style={{ margin: 0 }}>{task.title}</h2>
        <span
          style={{
            backgroundColor: statusColors[task.status],
            color: "white",
            padding: "4px 12px",
            borderRadius: "16px",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          {task.status}
        </span>
      </div>

      {task.description && (
        <p style={{ color: "#4b5563", marginTop: "8px" }}>{task.description}</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginTop: "16px",
          fontSize: "14px",
        }}
      >
        <InfoItem label="Executor" value={task.executor} />
        <InfoItem label="Branch" value={task.branchName} />
        <InfoItem label="Base Branch" value={task.baseBranch} />
        {task.worktreePath && (
          <InfoItem label="Worktree" value={task.worktreePath} />
        )}
        <InfoItem label="Created" value={formatDate(task.createdAt)} />
        {task.startedAt && (
          <InfoItem label="Started" value={formatDate(task.startedAt)} />
        )}
        {task.completedAt && (
          <InfoItem label="Completed" value={formatDate(task.completedAt)} />
        )}
      </div>
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "#6b7280" }}>{label}: </span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

interface TaskActionsProps {
  task: Task;
  loading: boolean;
  showResumeForm: boolean;
  resumeMessage: string;
  onStart: () => void;
  onPause: () => void;
  onComplete: () => void;
  onResume: () => void;
  onFinish: () => void;
  onShowResumeForm: () => void;
  onCancelResume: () => void;
  onResumeMessageChange: (message: string) => void;
}

function TaskActions({
  task,
  loading,
  showResumeForm,
  resumeMessage,
  onStart,
  onPause,
  onComplete,
  onResume,
  onFinish,
  onShowResumeForm,
  onCancelResume,
  onResumeMessageChange,
}: TaskActionsProps) {
  const buttonStyle = {
    padding: "8px 16px",
    borderRadius: "4px",
    border: "none",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 500,
    marginRight: "8px",
  };

  const primaryButton = {
    ...buttonStyle,
    backgroundColor: "#3b82f6",
    color: "white",
  };

  const secondaryButton = {
    ...buttonStyle,
    backgroundColor: "#e5e7eb",
    color: "#374151",
  };

  const successButton = {
    ...buttonStyle,
    backgroundColor: "#10b981",
    color: "white",
  };

  const dangerButton = {
    ...buttonStyle,
    backgroundColor: "#ef4444",
    color: "white",
  };

  return (
    <section style={{ marginTop: "24px" }}>
      <h3>Actions</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {task.status === "TODO" && (
          <button
            type="button"
            style={primaryButton}
            onClick={onStart}
            disabled={loading}
          >
            Start Task
          </button>
        )}

        {task.status === "InProgress" && (
          <>
            <button
              type="button"
              style={secondaryButton}
              onClick={onPause}
              disabled={loading}
            >
              Pause
            </button>
            <button
              type="button"
              style={successButton}
              onClick={onComplete}
              disabled={loading}
            >
              Mark Complete
            </button>
          </>
        )}

        {(task.status === "InProgress" || task.status === "InReview") &&
          (!showResumeForm ? (
            <button
              type="button"
              style={primaryButton}
              onClick={onShowResumeForm}
              disabled={loading}
            >
              Resume with Message
            </button>
          ) : (
            <div
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "12px",
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
              }}
            >
              <textarea
                value={resumeMessage}
                onChange={(e) => onResumeMessageChange(e.target.value)}
                placeholder="Enter additional instructions (optional)..."
                style={{
                  width: "100%",
                  minHeight: "80px",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  marginBottom: "8px",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  style={primaryButton}
                  onClick={onResume}
                  disabled={loading}
                >
                  Resume
                </button>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={onCancelResume}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}

        {task.status === "InReview" && (
          <button
            type="button"
            style={dangerButton}
            onClick={onFinish}
            disabled={loading}
          >
            Finish (Delete Branch)
          </button>
        )}
      </div>
    </section>
  );
}

interface ExecutionLogsProps {
  logs: ExecutionLog[];
  connected: boolean;
  error: string | null;
}

function ExecutionLogs({ logs, connected, error }: ExecutionLogsProps) {
  const logTypeColors: Record<string, string> = {
    stdout: "#1f2937",
    stderr: "#dc2626",
    system: "#6b7280",
  };

  const logTypeBgColors: Record<string, string> = {
    stdout: "#f9fafb",
    stderr: "#fef2f2",
    system: "#f3f4f6",
  };

  return (
    <section style={{ marginTop: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3 style={{ margin: 0 }}>Execution Logs</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: connected ? "#10b981" : "#ef4444",
            }}
          />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            {connected ? "Live" : "Disconnected"}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: "#f59e0b",
            fontSize: "12px",
            marginBottom: "8px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          maxHeight: "500px",
          overflow: "auto",
        }}
      >
        {logs.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "#6b7280",
            }}
          >
            No logs yet. Start the task to see execution logs.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid #e5e7eb",
                backgroundColor: logTypeBgColors[log.logType] ?? "#f9fafb",
                fontFamily: "monospace",
                fontSize: "13px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    color: logTypeColors[log.logType] ?? "#1f2937",
                    fontWeight: 600,
                    fontSize: "11px",
                    textTransform: "uppercase",
                  }}
                >
                  {log.logType}
                </span>
                <span style={{ color: "#9ca3af", fontSize: "11px" }}>
                  {formatTime(log.createdAt)}
                </span>
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: logTypeColors[log.logType] ?? "#1f2937",
                }}
              >
                {log.content}
              </pre>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabStyle = (isActive: boolean) => ({
    padding: "8px 16px",
    border: "none",
    borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
    backgroundColor: "transparent",
    color: isActive ? "#3b82f6" : "#6b7280",
    fontWeight: isActive ? 600 : 400,
    cursor: "pointer",
    fontSize: "14px",
  });

  return (
    <div
      style={{
        marginTop: "24px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        gap: "8px",
      }}
    >
      <button
        type="button"
        style={tabStyle(activeTab === "logs")}
        onClick={() => onTabChange("logs")}
      >
        Execution Logs
      </button>
      <button
        type="button"
        style={tabStyle(activeTab === "diff")}
        onClick={() => onTabChange("diff")}
      >
        Diff View
      </button>
    </div>
  );
}

interface DiffSectionProps {
  task: Task;
  diff: string | null;
  loading: boolean;
  error: string | null;
}

function DiffSection({ task, diff, loading, error }: DiffSectionProps) {
  if (task.status === "TODO") {
    return (
      <section style={{ marginTop: "16px" }}>
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "#6b7280",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        >
          Start the task to see the diff
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section style={{ marginTop: "16px" }}>
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          Loading diff...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ marginTop: "16px" }}>
        <div
          style={{
            padding: "16px",
            color: "#dc2626",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
          }}
        >
          Error loading diff: {error}
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: "16px" }}>
      <DiffView diff={diff ?? ""} />
    </section>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
