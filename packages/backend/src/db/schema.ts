import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const epics = sqliteTable(
  "epics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    executor: text("executor", {
      enum: ["ClaudeCode", "Codex", "Copilot", "Gemini"],
    }).notNull(),
    directoryPath: text("directory_path"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_epics_project_id").on(table.projectId)],
);

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  path: text("path").notNull(),
  defaultBranch: text("default_branch").notNull(),
  // Lifecycle scripts
  setupScript: text("setup_script"), // Runs only on first task start
  startScript: text("start_script"), // Runs on every task start/resume
  stopScript: text("stop_script"), // Runs when task moves to InReview
  cleanupScript: text("cleanup_script"), // Runs when task is finished
  copyFiles: text("copy_files"), // Newline-separated list of files to copy
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
    epicId: text("epic_id").references(() => epics.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["TODO", "InProgress", "InReview", "Done"],
    }).notNull(),
    executor: text("executor", {
      enum: ["ClaudeCode", "Codex", "Copilot", "Gemini"],
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
    index("idx_tasks_epic_id").on(table.epicId),
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

export const epicLogs = sqliteTable(
  "epic_logs",
  {
    id: text("id").primaryKey(),
    epicId: text("epic_id")
      .notNull()
      .references(() => epics.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    logType: text("log_type", {
      enum: ["stdout", "stderr", "system"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_epic_logs_epic_id").on(table.epicId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const taskMessages = sqliteTable(
  "task_messages",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: text("status", {
      enum: ["pending", "delivered", "failed"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    deliveredAt: text("delivered_at"),
  },
  (table) => [
    index("idx_task_messages_task_id").on(table.taskId),
    index("idx_task_messages_status").on(table.status),
  ],
);
