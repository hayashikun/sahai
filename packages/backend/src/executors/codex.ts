import type { Subprocess } from "bun";
import { getAgentPath } from "../config/agent";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  ExitCallback,
  OutputCallback,
  SessionIdCallback,
} from "./interface";

export class CodexExecutor implements Executor {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private outputCallback: OutputCallback | null = null;
  private exitCallback: ExitCallback | null = null;
  private sessionIdCallback: SessionIdCallback | null = null;
  private isRunning = false;
  private hasCompleted = false;
  private sessionIdExtracted = false;

  async start(config: ExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    this.isRunning = true;

    // Get command path from settings
    const commandPath = await getAgentPath("codex");

    // Build codex exec command with optional resume
    const cmd = [
      commandPath,
      "exec",
      "--json",
      "--sandbox",
      "danger-full-access",
      config.prompt,
    ];

    if (config.sessionId) {
      cmd.push("resume", config.sessionId);
    }

    this.process = Bun.spawn({
      cmd,
      cwd: config.workingDirectory,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const resumeInfo = config.sessionId
      ? ` (resuming session ${config.sessionId})`
      : "";
    this.emitOutput({
      content: `[system] Started Codex executor for task ${config.taskId}${resumeInfo}`,
      logType: "system",
    });

    // Start reading stdout and stderr
    this.readOutputStream(this.process.stdout, "stdout");
    this.readOutputStream(this.process.stderr, "stderr");

    // Handle process exit
    this.process.exited.then((exitCode) => {
      this.emitOutput({
        content: `[system] Codex process exited with code ${exitCode}`,
        logType: "system",
      });
      this.isRunning = false;
      this.process = null;
      // Only call exitCallback if not already completed via result message
      if (!this.hasCompleted) {
        this.exitCallback?.(exitCode);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.emitOutput({
        content: "[system] Codex executor stopped",
        logType: "system",
      });
      this.process = null;
      this.isRunning = false;
    }
  }

  onOutput(callback: OutputCallback): void {
    this.outputCallback = callback;
  }

  onExit(callback: ExitCallback): void {
    this.exitCallback = callback;
  }

  onSessionId(callback: SessionIdCallback): void {
    this.sessionIdCallback = callback;
  }

  private emitOutput(output: ExecutorOutput): void {
    this.outputCallback?.(output);
  }

  private async readOutputStream(
    stream: ReadableStream<Uint8Array>,
    logType: "stdout" | "stderr",
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            const output = this.parseOutput(line, logType);
            this.emitOutput(output);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const output = this.parseOutput(buffer, logType);
        this.emitOutput(output);
      }
    } catch (error) {
      this.emitOutput({
        content: `[system] Error reading ${logType}: ${error}`,
        logType: "system",
      });
    } finally {
      reader.releaseLock();
    }
  }

  private parseOutput(
    line: string,
    logType: "stdout" | "stderr",
  ): ExecutorOutput {
    if (logType === "stderr") {
      return { content: line, logType: "stderr" };
    }

    // Try to parse Codex JSONL output for stdout
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;

      // Detect session id from thread.started
      if (
        !this.sessionIdExtracted &&
        msg.type === "thread.started" &&
        typeof msg.thread_id === "string" &&
        msg.thread_id
      ) {
        this.sessionIdExtracted = true;
        console.log(
          "[CodexExecutor] Detected session thread_id:",
          msg.thread_id,
        );
        this.sessionIdCallback?.(msg.thread_id as string);
      }

      // Detect completion on turn.completed
      if (msg.type === "turn.completed") {
        console.log("[CodexExecutor] Detected turn.completed message:", msg);
        this.handleCompletion();
      }

      return {
        content: JSON.stringify(msg),
        logType: "stdout",
      };
    } catch {
      // Non-JSON output
      return { content: line, logType: "stdout" };
    }
  }

  private handleCompletion(): void {
    if (this.hasCompleted) {
      console.log(
        "[CodexExecutor] handleCompletion called but already completed",
      );
      return;
    }
    this.hasCompleted = true;

    console.log(
      "[CodexExecutor] Handling completion, triggering exit callback",
    );

    this.emitOutput({
      content: "[system] Codex task completed",
      logType: "system",
    });

    // Trigger exit callback with success code
    if (this.exitCallback) {
      console.log("[CodexExecutor] Calling exit callback");
      this.exitCallback(0);
    } else {
      console.log("[CodexExecutor] No exit callback registered!");
    }

    if (this.process) {
      console.log("[CodexExecutor] Killing process");
      this.process.kill();
    }
  }
}
