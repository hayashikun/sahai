import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  defaultBranch: text("default_branch").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectRepositories = sqliteTable(
  "project_repositories",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.repositoryId] }),
    index("idx_project_repositories_project_id").on(table.projectId),
    index("idx_project_repositories_repository_id").on(table.repositoryId),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["TODO", "InProgress", "InReview", "Done"],
    }).notNull(),
    executor: text("executor", {
      enum: ["ClaudeCode", "Codex", "Gemini"],
    }).notNull(),
    branchName: text("branch_name").notNull(),
    baseBranch: text("base_branch").notNull(),
    worktreePath: text("worktree_path"),
    sessionId: text("session_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_tasks_repository_id").on(table.repositoryId),
    index("idx_tasks_status").on(table.status),
  ],
);

export const executionLogs = sqliteTable(
  "execution_logs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    logType: text("log_type", {
      enum: ["stdout", "stderr", "system"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_execution_logs_task_id").on(table.taskId)],
);
