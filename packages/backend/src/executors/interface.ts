export type LogType = "stdout" | "stderr" | "system";

export interface ExecutorOutput {
  content: string;
  logType: LogType;
}

export type OutputCallback = (output: ExecutorOutput) => void;

export interface ExecutorConfig {
  taskId: string;
  workingDirectory: string;
  prompt: string;
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
   * Send a follow-up message to the agent
   */
  sendMessage(message: string): Promise<void>;

  /**
   * Register a callback for agent output
   */
  onOutput(callback: OutputCallback): void;
}
