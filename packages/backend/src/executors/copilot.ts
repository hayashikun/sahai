import { mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const UUID_PATTERN = /^(?:session-)?([0-9a-fA-F-]{36})\.log$/;

export class CopilotExecutor implements Executor {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private outputCallback: OutputCallback | null = null;
  private exitCallback: ExitCallback | null = null;
  private sessionIdCallback: SessionIdCallback | null = null;
  private isRunning = false;
  private sessionIdExtracted = false;
  private watcherAbortController: AbortController | null = null;

  async start(config: ExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    this.isRunning = true;
    this.sessionIdExtracted = false;

    // Create log directory
    const logDir = join(tmpdir(), "sahai", `copilot-${config.taskId}`);
    await mkdir(logDir, { recursive: true });

    // Get command path from settings
    const commandPath = await getAgentPath("copilot");

    // Build command
    const cmd = [
      commandPath,
      "--no-color",
      "--log-level",
      "debug",
      "--log-dir",
      logDir,
      "--allow-all-tools",
    ];

    // Add resume flags if sessionId is provided
    if (config.sessionId) {
      cmd.push("--resume", config.sessionId);
    }

    this.process = Bun.spawn({
      cmd,
      cwd: config.workingDirectory,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
      },
    });

    const resumeInfo = config.sessionId
      ? ` (resuming session ${config.sessionId})`
      : "";
    this.emitOutput({
      content: `[system] Started Copilot executor for task ${config.taskId}${resumeInfo}`,
      logType: "system",
    });
    this.emitOutput({
      content: `[system] Log directory: ${logDir}`,
      logType: "system",
    });

    // Start reading stdout and stderr (intentionally not awaited)
    this.readOutputStream(this.process.stdout, "stdout").catch(() => {
      // Error handling is done inside readOutputStream
    });
    this.readOutputStream(this.process.stderr, "stderr").catch(() => {
      // Error handling is done inside readOutputStream
    });

    // Start watching for session ID in log directory
    this.watchForSessionId(logDir);

    // Handle process exit
    this.process.exited.then((exitCode) => {
      this.emitOutput({
        content: `[system] Copilot process exited with code ${exitCode}`,
        logType: "system",
      });
      this.isRunning = false;
      this.process = null;
      this.watcherAbortController?.abort();
      this.exitCallback?.(exitCode);
    });

    // Send prompt to stdin
    this.process.stdin.write(config.prompt);
    this.process.stdin.end();
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.emitOutput({
        content: "[system] Copilot executor stopped",
        logType: "system",
      });
      this.process = null;
      this.isRunning = false;
    }
    this.watcherAbortController?.abort();
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

  /**
   * Watch the log directory for session ID.
   * Copilot writes logs to files named like: <UUID>.log or session-<UUID>.log
   */
  private watchForSessionId(logDir: string): void {
    this.watcherAbortController = new AbortController();
    const { signal } = this.watcherAbortController;

    const checkForSessionId = async (): Promise<string | null> => {
      try {
        const files = await readdir(logDir);
        for (const file of files) {
          const match = file.match(UUID_PATTERN);
          if (match) {
            return match[1];
          }
        }
      } catch {
        // Directory might not exist yet or other error
      }
      return null;
    };

    const poll = async () => {
      const timeout = 10 * 60 * 1000; // 10 minutes timeout
      const interval = 200; // 200ms polling interval
      const startTime = Date.now();

      while (!signal.aborted && Date.now() - startTime < timeout) {
        if (this.sessionIdExtracted) {
          return;
        }

        const sessionId = await checkForSessionId();
        if (sessionId) {
          this.sessionIdExtracted = true;
          console.log("[CopilotExecutor] Detected session_id:", sessionId);
          this.sessionIdCallback?.(sessionId);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      if (!(this.sessionIdExtracted || signal.aborted)) {
        console.log(
          "[CopilotExecutor] Timeout waiting for session ID in log directory",
        );
      }
    };

    poll().catch(() => {
      // Errors are handled inside poll
    });
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
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            this.processLine(line, logType);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        this.processLine(buffer, logType);
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

  private processLine(line: string, logType: "stdout" | "stderr"): void {
    // Strip ANSI escape codes for cleaner output
    const cleanLine = line.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes contain control characters
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      "",
    );

    this.emitOutput({
      content: cleanLine,
      logType,
    });
  }
}
