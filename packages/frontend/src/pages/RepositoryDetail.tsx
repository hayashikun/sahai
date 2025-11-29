import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createTask } from "../api";
import { KanbanBoard } from "../components";
import { useRepository, useRepositoryTasks } from "../hooks";

export function RepositoryDetail() {
  const { repositoryId } = useParams<{ repositoryId: string }>();

  if (!repositoryId) {
    return <div>Repository ID is required</div>;
  }

  return <RepositoryDetailContent repositoryId={repositoryId} />;
}

function RepositoryDetailContent({ repositoryId }: { repositoryId: string }) {
  const repository = useRepository(repositoryId);
  const { tasks, mutate } = useRepositoryTasks(repositoryId);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [executor, setExecutor] = useState<string>("ClaudeCode");
  const [branchName, setBranchName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!repository) {
    return <div>Repository not found</div>;
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !branchName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      await createTask(repositoryId, {
        title: title.trim(),
        description: description.trim() || undefined,
        executor,
        branchName: branchName.trim(),
      });
      setTitle("");
      setDescription("");
      setBranchName("");
      setShowForm(false);
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <Link to="/projects">&larr; Back to Projects</Link>

      <h2>{repository.name}</h2>
      <p>
        <small>
          Path: {repository.path} | Default Branch: {repository.defaultBranch}
        </small>
      </p>

      <section style={{ marginBottom: "24px" }}>
        {!showForm ? (
          <button type="button" onClick={() => setShowForm(true)}>
            + New Task
          </button>
        ) : (
          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "16px",
              maxWidth: "400px",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0" }}>Create New Task</h3>
            {error && <p style={{ color: "red" }}>{error}</p>}
            <form onSubmit={handleCreateTask}>
              <div style={{ marginBottom: "8px" }}>
                <label htmlFor="task-title">Title:</label>
                <br />
                <input
                  id="task-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label htmlFor="task-description">Description:</label>
                <br />
                <textarea
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ width: "100%" }}
                  rows={3}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label htmlFor="task-executor">Executor:</label>
                <br />
                <select
                  id="task-executor"
                  value={executor}
                  onChange={(e) => setExecutor(e.target.value)}
                >
                  <option value="ClaudeCode">Claude Code</option>
                  <option value="Codex">Codex</option>
                </select>
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label htmlFor="task-branch">Branch Name:</label>
                <br />
                <input
                  id="task-branch"
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      <KanbanBoard tasks={tasks} onTaskUpdate={mutate} />
    </div>
  );
}
