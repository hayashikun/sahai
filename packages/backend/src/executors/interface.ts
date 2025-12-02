export type LogType = "stdout" | "stderr" | "system";

export interface ExecutorOutput {
  content: string;
  logType: LogType;
}

export type OutputCallback = (output: ExecutorOutput) => void;
export type ExitCallback = (exitCode: number | null) => void;
export type SessionIdCallback = (sessionId: string) => void;

export interface ExecutorConfig {
  taskId: string;
  workingDirectory: string;
  prompt: string;
  /** Session ID for resuming a previous session */
  sessionId?: string;
}

export interface Executor {
  /**
   * Start the agent with the given configuration
   */
  start(config: ExecutorConfig): Promise<void>;

  /**
   * Stop the agent
   */
  stop(): Promise<void>;

  /**
   * Register a callback for agent output
   */
  onOutput(callback: OutputCallback): void;

  /**
   * Register a callback for when the agent process exits
   */
  onExit(callback: ExitCallback): void;

  /**
   * Register a callback for when a session ID is detected
   */
  onSessionId(callback: SessionIdCallback): void;
}
