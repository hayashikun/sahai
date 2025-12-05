import { z } from "zod";

// Helper for nullable to optional transformation
const nullToUndefined = <T>(val: T | null): T | undefined =>
  val === null ? undefined : val;

// Status enum
export const Status = z.enum(["TODO", "InProgress", "InReview", "Done"]);
export type Status = z.infer<typeof Status>;

// Executor enum
export const Executor = z.enum(["ClaudeCode", "Codex", "Copilot", "Gemini"]);
export type Executor = z.infer<typeof Executor>;

// LogType enum
export const LogType = z.enum(["stdout", "stderr", "system"]);
export type LogType = z.infer<typeof LogType>;

// MessageStatus enum
export const MessageStatus = z.enum(["pending", "delivered", "failed"]);
export type MessageStatus = z.infer<typeof MessageStatus>;

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

// Epic schema
export const Epic = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z
    .string()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.string().optional()),
  executor: Executor,
  directoryPath: z
    .string()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.string().optional()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Epic = z.infer<typeof Epic>;

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
  epicId: z
    .string()
    .nullable()
    .optional()
    .transform(nullToUndefined)
    .pipe(z.string().optional()),
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
  isExecuting: z.boolean().optional(),
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

// TaskMessage schema (for message queue)
export const TaskMessage = z.object({
  id: z.string(),
  taskId: z.string(),
  content: z.string(),
  status: MessageStatus,
  createdAt: z.coerce.date(),
  deliveredAt: z.coerce
    .date()
    .nullable()
    .transform(nullToUndefined)
    .pipe(z.date().optional()),
});
export type TaskMessage = z.infer<typeof TaskMessage>;

// Array schemas for parsing lists
export const ProjectArray = z.array(Project);
export const EpicArray = z.array(Epic);
export const RepositoryArray = z.array(Repository);
export const TaskArray = z.array(Task);
export const ExecutionLogArray = z.array(ExecutionLog);
export const TaskMessageArray = z.array(TaskMessage);

// Error codes
export const ErrorCode = z.enum([
  "NOT_FOUND",
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INTERNAL_ERROR",
  "INVALID_STATE_TRANSITION",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// API Error response schema
export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

// Notification trigger enum
export const NotificationTrigger = z.enum(["completed", "failed", "all"]);
export type NotificationTrigger = z.infer<typeof NotificationTrigger>;

// Settings schema
export const SettingsSchema = z.object({
  // General > Terminal
  "terminal.macosApp": z.string(),
  "terminal.linuxCommand": z.string().nullable(),
  // General > Notification
  "notification.enabled": z.boolean(),
  "notification.trigger": NotificationTrigger,
  "notification.sound": z.string().nullable(),
  // Agent
  "agent.claudeCode.enabled": z.boolean(),
  "agent.claudeCode.path": z.string().nullable(),
  "agent.codex.enabled": z.boolean(),
  "agent.codex.path": z.string().nullable(),
  "agent.copilot.enabled": z.boolean(),
  "agent.copilot.path": z.string().nullable(),
  "agent.gemini.enabled": z.boolean(),
  "agent.gemini.path": z.string().nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsResponseSchema = z.object({
  settings: SettingsSchema,
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

// Partial update schema
export const SettingsUpdateSchema = SettingsSchema.partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

// Path validation schemas
export const ValidatePathRequestSchema = z.object({
  path: z.string(),
});
export type ValidatePathRequest = z.infer<typeof ValidatePathRequestSchema>;

export const ValidatePathResponseSchema = z.object({
  valid: z.boolean(),
  exists: z.boolean(),
  executable: z.boolean(),
  error: z.string().optional(),
});
export type ValidatePathResponse = z.infer<typeof ValidatePathResponseSchema>;

// Sound schemas
export const SoundSchema = z.object({
  name: z.string(),
  path: z.string(),
});
export type Sound = z.infer<typeof SoundSchema>;

export const SoundsResponseSchema = z.object({
  sounds: z.array(SoundSchema),
  platform: z.string(),
});
export type SoundsResponse = z.infer<typeof SoundsResponseSchema>;

export const PlaySoundRequestSchema = z.object({
  sound: z.string(),
});
export type PlaySoundRequest = z.infer<typeof PlaySoundRequestSchema>;

export const PlaySoundResponseSchema = z.object({
  success: z.boolean(),
});
export type PlaySoundResponse = z.infer<typeof PlaySoundResponseSchema>;

// API Request/Input schemas

// Repository creation input
export const CreateRepositoryInputSchema = z.object({
  name: z.string(),
  path: z.string(),
  defaultBranch: z.string().optional(),
});
export type CreateRepositoryInput = z.infer<typeof CreateRepositoryInputSchema>;

// Task creation input
export const CreateTaskInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  executor: Executor,
  branchName: z.string(),
  baseBranch: z.string().optional(),
  epicId: z.string().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

// Epic creation input
export const CreateEpicInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  executor: Executor,
});
export type CreateEpicInput = z.infer<typeof CreateEpicInputSchema>;

// Message creation input
export const CreateMessageInputSchema = z.object({
  content: z.string().min(1),
});
export type CreateMessageInput = z.infer<typeof CreateMessageInputSchema>;

// Agent configuration types
export const AgentType = z.enum(["claudeCode", "codex", "copilot", "gemini"]);
export type AgentType = z.infer<typeof AgentType>;

// Map executor names to agent keys
export const executorToAgentKey: Record<string, AgentType> = {
  ClaudeCode: "claudeCode",
  Codex: "codex",
  Copilot: "copilot",
  Gemini: "gemini",
};

export const AgentConfigSchema = z.object({
  enabled: z.boolean(),
  path: z.string(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Task event types for SSE streaming
export const TaskEventType = z.enum([
  "task-status-changed",
  "task-created",
  "task-deleted",
]);
export type TaskEventType = z.infer<typeof TaskEventType>;

// Task event schemas
export const TaskStatusChangedEventSchema = z.object({
  type: z.literal("task-status-changed"),
  taskId: z.string(),
  oldStatus: Status,
  newStatus: Status,
  isExecuting: z.boolean(),
  updatedAt: z.string(),
});
export type TaskStatusChangedEvent = z.infer<
  typeof TaskStatusChangedEventSchema
>;

export const TaskCreatedEventSchema = z.object({
  type: z.literal("task-created"),
  task: Task.extend({ isExecuting: z.boolean() }),
  createdAt: z.string(),
});
export type TaskCreatedEvent = z.infer<typeof TaskCreatedEventSchema>;

export const TaskDeletedEventSchema = z.object({
  type: z.literal("task-deleted"),
  taskId: z.string(),
  deletedAt: z.string(),
});
export type TaskDeletedEvent = z.infer<typeof TaskDeletedEventSchema>;

export const TaskEventSchema = z.discriminatedUnion("type", [
  TaskStatusChangedEventSchema,
  TaskCreatedEventSchema,
  TaskDeletedEventSchema,
]);
export type TaskEvent = z.infer<typeof TaskEventSchema>;

// Message event schemas for SSE streaming
export const MessageQueuedEventSchema = z.object({
  type: z.literal("message-queued"),
  taskId: z.string(),
  message: TaskMessage,
});
export type MessageQueuedEvent = z.infer<typeof MessageQueuedEventSchema>;

export const MessageDeliveredEventSchema = z.object({
  type: z.literal("message-delivered"),
  taskId: z.string(),
  messageId: z.string(),
  deliveredAt: z.string(),
});
export type MessageDeliveredEvent = z.infer<typeof MessageDeliveredEventSchema>;

export const MessageEventSchema = z.discriminatedUnion("type", [
  MessageQueuedEventSchema,
  MessageDeliveredEventSchema,
]);
export type MessageEvent = z.infer<typeof MessageEventSchema>;
