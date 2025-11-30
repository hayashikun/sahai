import type { Subprocess } from "bun";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  OutputCallback,
} from "./interface";

export class ClaudeCodeExecutor implements Executor {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private outputCallback: OutputCallback | null = null;
  private isRunning = false;

  async start(config: ExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    this.isRunning = true;

    this.process = Bun.spawn({
      cmd: [
        "claude",
        "-p",
        "--output-format",
        "stream-json",
        "--input-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ],
      cwd: config.workingDirectory,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this.emitOutput({
      content: `[system] Started Claude Code executor for task ${config.taskId}`,
      logType: "system",
    });

    // Start reading stdout and stderr
    this.readOutputStream(this.process.stdout, "stdout");
    this.readOutputStream(this.process.stderr, "stderr");

    // Handle process exit
    this.process.exited.then((exitCode) => {
      this.emitOutput({
        content: `[system] Claude Code process exited with code ${exitCode}`,
        logType: "system",
      });
      this.isRunning = false;
      this.process = null;
    });

    // Send initial prompt
    await this.sendMessage(config.prompt);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.emitOutput({
        content: "[system] Claude Code executor stopped",
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

    // Try to parse as JSON for stdout
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      return {
        content: JSON.stringify(msg),
        logType: "stdout",
      };
    } catch {
      // Non-JSON output
      return { content: line, logType: "stdout" };
    }
  }
}
