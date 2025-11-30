import type { Subprocess } from "bun";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  OutputCallback,
} from "./interface";

export class CodexExecutor implements Executor {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private outputCallback: OutputCallback | null = null;
  private isRunning = false;

  async start(config: ExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    this.isRunning = true;

    this.process = Bun.spawn({
      cmd: ["codex", "exec", "--json", "--full-auto", "-"],
      cwd: config.workingDirectory,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this.emitOutput({
      content: `[system] Started Codex executor for task ${config.taskId}`,
      logType: "system",
    });

    this.readOutputStream(this.process.stdout, "stdout");
    this.readOutputStream(this.process.stderr, "stderr");

    this.process.exited.then((exitCode) => {
      this.emitOutput({
        content: `[system] Codex process exited with code ${exitCode}`,
        logType: "system",
      });
      this.isRunning = false;
      this.process = null;
    });

    await this.sendMessage(config.prompt);
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

  async sendMessage(message: string): Promise<void> {
    if (!this.process || !this.isRunning) {
      throw new Error("Process is not running");
    }

    const stdin = this.process.stdin;
    stdin.write(`${message}\n`);
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
      return {
        content: JSON.stringify(msg),
        logType: "stdout",
      };
    } catch {
      return { content: line, logType: "stdout" };
    }
  }
}
