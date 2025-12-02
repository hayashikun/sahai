import type { Subprocess } from "bun";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  ExitCallback,
  OutputCallback,
  SessionIdCallback,
} from "./interface";

export class GeminiExecutor implements Executor {
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

    const cmd = ["gemini", "--experimental-acp"];

    if (config.sessionId) {
      cmd.push("--resume", config.sessionId);
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
      content: `[system] Started Gemini executor for task ${config.taskId}${resumeInfo}`,
      logType: "system",
    });

    // Start reading stdout and stderr
    this.readOutputStream(this.process.stdout, "stdout");
    this.readOutputStream(this.process.stderr, "stderr");

    // Handle process exit
    this.process.exited.then((exitCode) => {
      this.emitOutput({
        content: `[system] Gemini process exited with code ${exitCode}`,
        logType: "system",
      });
      this.isRunning = false;
      this.process = null;
      if (!this.hasCompleted) {
        this.exitCallback?.(exitCode);
      }
    });

    // Send initial prompt
    await this.sendMessage(config.prompt);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.emitOutput({
        content: "[system] Gemini executor stopped",
        logType: "system",
      });
      this.process = null;
      this.isRunning = false;
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.process || !this.isRunning) {
      throw new Error("Process is not running");
    }

    const stdin = this.process.stdin;

    const jsonMessage = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: message }],
      },
    });

    stdin.write(`${jsonMessage}\n`);
    stdin.flush();
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

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            const output = this.parseOutput(line, logType);
            this.emitOutput(output);
          }
        }
      }

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

    try {
      const msg = JSON.parse(line) as Record<string, unknown>;

      if (
        !this.sessionIdExtracted &&
        typeof msg.session_id === "string" &&
        msg.session_id
      ) {
        this.sessionIdExtracted = true;
        console.log("[GeminiExecutor] Detected session_id:", msg.session_id);
        this.sessionIdCallback?.(msg.session_id);
      }

      if (msg.type === "result") {
        console.log("[GeminiExecutor] Detected result message:", msg);
        this.handleCompletion();
      }

      return {
        content: JSON.stringify(msg),
        logType: "stdout",
      };
    } catch {
      return { content: line, logType: "stdout" };
    }
  }

  private handleCompletion(): void {
    if (this.hasCompleted) {
      console.log(
        "[GeminiExecutor] handleCompletion called but already completed",
      );
      return;
    }
    this.hasCompleted = true;

    console.log(
      "[GeminiExecutor] Handling completion, triggering exit callback",
    );

    this.emitOutput({
      content: "[system] Gemini task completed",
      logType: "system",
    });

    if (this.exitCallback) {
      console.log("[GeminiExecutor] Calling exit callback");
      this.exitCallback(0);
    } else {
      console.log("[GeminiExecutor] No exit callback registered!");
    }

    if (this.process) {
      console.log("[GeminiExecutor] Killing process");
      this.process.kill();
    }
  }
}
