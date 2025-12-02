export const Status = {
  TODO: "TODO",
  InProgress: "InProgress",
  InReview: "InReview",
  Done: "Done",
} as const;

export type Status = (typeof Status)[keyof typeof Status];

export const Executor = {
  ClaudeCode: "ClaudeCode",
  Codex: "Codex",
  Gemini: "Gemini",
} as const;

export type Executor = (typeof Executor)[keyof typeof Executor];

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Repository {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRepository {
  projectId: string;
  repositoryId: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  repositoryId: string;
  title: string;
  description?: string;
  status: Status;
  executor: Executor;
  branchName: string;
  baseBranch: string;
  worktreePath?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export const LogType = {
  STDOUT: "stdout",
  STDERR: "stderr",
  SYSTEM: "system",
} as const;

export type LogType = (typeof LogType)[keyof typeof LogType];

export interface ExecutionLog {
  id: string;
  taskId: string;
  content: string;
  logType: LogType;
  createdAt: Date;
}
