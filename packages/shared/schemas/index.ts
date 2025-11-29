import { z } from "zod";

// Helper for nullable to optional transformation
const nullToUndefined = <T>(val: T | null): T | undefined =>
  val === null ? undefined : val;

// Status enum
export const Status = z.enum(["TODO", "InProgress", "InReview", "Done"]);
export type Status = z.infer<typeof Status>;

// Executor enum
export const Executor = z.enum(["ClaudeCode", "Codex"]);
export type Executor = z.infer<typeof Executor>;

// LogType enum
export const LogType = z.enum(["stdout", "stderr", "system"]);
export type LogType = z.infer<typeof LogType>;

// Project schema - parses API response and transforms dates
export const Project = z.object({
  id: z.string(),
  name: z.string(),
  description: z
    .string()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.string().optional()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Project = z.infer<typeof Project>;

// Repository schema
export const Repository = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  defaultBranch: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Repository = z.infer<typeof Repository>;

// ProjectRepository schema
export const ProjectRepository = z.object({
  projectId: z.string(),
  repositoryId: z.string(),
  createdAt: z.coerce.date(),
});
export type ProjectRepository = z.infer<typeof ProjectRepository>;

// Task schema
export const Task = z.object({
  id: z.string(),
  repositoryId: z.string(),
  title: z.string(),
  description: z
    .string()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.string().optional()),
  status: Status,
  executor: Executor,
  branchName: z.string(),
  baseBranch: z.string(),
  worktreePath: z
    .string()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.string().optional()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  startedAt: z.coerce
    .date()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.date().optional()),
  completedAt: z.coerce
    .date()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.date().optional()),
});
export type Task = z.infer<typeof Task>;

// ExecutionLog schema
export const ExecutionLog = z.object({
  id: z.string(),
  taskId: z.string(),
  content: z.string(),
  logType: LogType,
  createdAt: z.coerce.date(),
});
export type ExecutionLog = z.infer<typeof ExecutionLog>;

// Array schemas for parsing lists
export const ProjectArray = z.array(Project);
export const RepositoryArray = z.array(Repository);
export const TaskArray = z.array(Task);
export const ExecutionLogArray = z.array(ExecutionLog);
