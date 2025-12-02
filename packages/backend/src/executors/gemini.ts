import type { Subprocess } from "bun";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  ExitCallback,
  OutputCallback,
  SessionIdCallback,
} from "./interface";

// ACP Protocol types (Agent Client Protocol) - JSON-RPC 2.0
interface AcpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface AcpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface AcpNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// ACP Protocol constants
const ACP_PROTOCOL_VERSION = 1;

export class GeminiExecutor implements Executor {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private outputCallback: OutputCallback | null = null;
  private exitCallback: ExitCallback | null = null;
  private sessionIdCallback: SessionIdCallback | null = null;
  private isRunning = false;
  private hasCompleted = false;
  private requestId = 1;
  private sessionId: string | null = null;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  async start(config: ExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    this.isRunning = true;

    const cmd = [
      "npx",
      "-y",
      "@google/gemini-cli@0.16.0",
      "--experimental-acp",
      "--yolo",
      "--allowed-tools",
      "run_shell_command",
    ];

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
      content: `[system] Started Gemini executor for task ${config.taskId}${resumeInfo}`,
      logType: "system",
    });

    // Start reading stdout and stderr
    this.readOutputStream(this.process.stdout);
    this.readStderr(this.process.stderr);

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

    // Run ACP initialization in background (don't block start())
    this.initializeAndRun(config.workingDirectory, config.prompt);
  }

  private async initializeAndRun(cwd: string, prompt: string): Promise<void> {
    try {
      // Initialize ACP connection
      await this.initialize();

      // Create new session
      await this.newSession(cwd);

      // Send the initial prompt (completes when task is done)
      await this.sendPrompt(prompt);
    } catch (error) {
      this.emitOutput({
        content: `[system] Error in Gemini executor: ${error}`,
        logType: "system",
      });
      this.handleCompletion();
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      // Send cancel notification if session exists
      if (this.sessionId) {
        this.sendNotification("session/cancel", { sessionId: this.sessionId });
      }
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
    if (!this.process || !this.isRunning || !this.sessionId) {
      throw new Error("Process is not running or session not started");
    }
    await this.sendPrompt(message);
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

  // ACP Protocol methods
  private async sendRequest(
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    if (!this.process) throw new Error("Process not running");

    const id = this.requestId++;
    const request: AcpRequest = { jsonrpc: "2.0", id, method };
    if (params !== undefined) {
      request.params = params;
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const line = `${JSON.stringify(request)}\n`;
      this.process?.stdin.write(line);
      this.process?.stdin.flush();
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.process) return;

    const notification: AcpNotification = { jsonrpc: "2.0", method };
    if (params !== undefined) {
      notification.params = params;
    }

    const line = `${JSON.stringify(notification)}\n`;
    this.process.stdin.write(line);
    this.process.stdin.flush();
  }

  private async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
    });
  }

  private async newSession(cwd: string): Promise<void> {
    const response = (await this.sendRequest("session/new", {
      mcpServers: [],
      cwd,
    })) as { sessionId: string };

    this.sessionId = response.sessionId;

    // Notify session ID
    if (this.sessionId && this.sessionIdCallback) {
      this.sessionIdCallback(this.sessionId);
    }
  }

  private async sendPrompt(prompt: string): Promise<void> {
    if (!this.sessionId) throw new Error("No session started");

    // Send prompt and wait for completion
    try {
      await this.sendRequest("session/prompt", {
        sessionId: this.sessionId,
        prompt: [
          {
            type: "text",
            text: prompt,
          },
        ],
      });

      this.handleCompletion();
    } catch {
      // Error is handled, but we still complete
      this.handleCompletion();
    }
  }

  private async readOutputStream(
    stream: ReadableStream<Uint8Array>,
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
            this.handleAcpMessage(line);
          }
        }
      }

      if (buffer.trim()) {
        this.handleAcpMessage(buffer);
      }
    } catch (error) {
      this.emitOutput({
        content: `[system] Error reading stdout: ${error}`,
        logType: "system",
      });
    } finally {
      reader.releaseLock();
    }
  }

  private async readStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
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
            this.emitOutput({ content: line, logType: "stderr" });
          }
        }
      }

      if (buffer.trim()) {
        this.emitOutput({ content: buffer, logType: "stderr" });
      }
    } catch {
      // Ignore stderr read errors
    } finally {
      reader.releaseLock();
    }
  }

  private handleAcpMessage(line: string): void {
    console.log("[GeminiExecutor] Received:", line.substring(0, 500));
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;

      // Handle response to our requests (has id but no method)
      if ("id" in msg && !("method" in msg)) {
        const response = msg as AcpResponse;
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
        return;
      }

      // Handle server requests (has id and method) - need to send response
      if ("id" in msg && "method" in msg && typeof msg.method === "string") {
        const method = msg.method;
        const requestId = msg.id;

        // Handle permission requests - auto-approve
        if (method === "session/request_permission") {
          this.handlePermissionRequest(
            requestId as number,
            msg.params as Record<string, unknown>,
          );
        }
        return;
      }

      // Handle server notifications (has method but no id)
      if ("method" in msg && typeof msg.method === "string" && !("id" in msg)) {
        this.handleServerNotification(
          msg.method,
          (msg.params as Record<string, unknown>) ?? {},
        );
        return;
      }
    } catch {
      // Non-JSON output - log as-is
      if (line.trim()) {
        this.emitOutput({ content: line, logType: "stdout" });
      }
    }
  }

  private handlePermissionRequest(
    requestId: number,
    params: Record<string, unknown>,
  ): void {
    // Auto-approve with the best available option
    const options = params.options as Array<{
      optionId: string;
      kind: string;
      name: string;
    }>;

    let selectedOptionId: string | null = null;

    // Prefer allow_always > allow_once > first non-reject option
    const allowAlways = options?.find((o) => o.kind === "allow_always");
    const allowOnce = options?.find((o) => o.kind === "allow_once");
    const nonReject = options?.find((o) => !o.kind.startsWith("reject"));

    if (allowAlways) {
      selectedOptionId = allowAlways.optionId;
    } else if (allowOnce) {
      selectedOptionId = allowOnce.optionId;
    } else if (nonReject) {
      selectedOptionId = nonReject.optionId;
    } else if (options && options.length > 0) {
      selectedOptionId = options[0].optionId;
    }

    const outcome = selectedOptionId
      ? { outcome: "selected", optionId: selectedOptionId }
      : { outcome: "cancelled" };

    this.sendResponse(requestId, { outcome });

    // Log the permission request
    const toolCall = params.toolCall as Record<string, unknown> | undefined;
    if (toolCall) {
      const toolTitle = toolCall.title || "unknown";
      this.emitOutput({
        content: `[permission] Auto-approved: ${toolTitle}`,
        logType: "stdout",
      });
    }
  }

  private sendResponse(requestId: number, result: unknown): void {
    if (!this.process) return;

    const response = { jsonrpc: "2.0" as const, id: requestId, result };
    const line = `${JSON.stringify(response)}\n`;
    this.process.stdin.write(line);
    this.process.stdin.flush();
  }

  private handleServerNotification(
    method: string,
    params: Record<string, unknown>,
  ): void {
    console.log(
      "[GeminiExecutor] Notification:",
      method,
      JSON.stringify(params).substring(0, 300),
    );
    // Handle session update notifications
    if (method === "session/update") {
      this.handleSessionUpdate(params);
      return;
    }
  }

  private handleSessionUpdate(params: Record<string, unknown>): void {
    // params has sessionId and update fields
    const update = params.update as Record<string, unknown> | undefined;
    if (!update) return;

    const sessionUpdate = update.sessionUpdate as string | undefined;
    if (!sessionUpdate) return;

    // Format and emit the notification
    const output = this.formatSessionUpdate(sessionUpdate, update);
    if (output) {
      this.emitOutput({ content: output, logType: "stdout" });
    }
  }

  private formatSessionUpdate(
    type: string,
    update: Record<string, unknown>,
  ): string | null {
    switch (type) {
      case "agent_message_chunk": {
        const content = update.content as Record<string, unknown>;
        if (content?.type === "text") {
          return (content.text as string) || null;
        }
        return null;
      }
      case "agent_thought_chunk": {
        const content = update.content as Record<string, unknown>;
        if (content?.type === "text") {
          return `[thinking] ${content.text as string}`;
        }
        return null;
      }
      case "user_message_chunk": {
        // Echo of user message, skip
        return null;
      }
      case "tool_call": {
        const title = update.title as string;
        const kind = update.kind as string;
        return `[tool:${kind}] ${title}`;
      }
      case "tool_call_update": {
        const status = update.status as string;
        const title = update.title as string;
        const content = update.content as Array<Record<string, unknown>>;
        if (status === "completed" && content && content.length > 0) {
          // Extract text from content
          const texts = content
            .filter((c) => c.type === "content")
            .map((c) => {
              const inner = c.content as Record<string, unknown>;
              return inner?.type === "text" ? (inner.text as string) : null;
            })
            .filter(Boolean);
          if (texts.length > 0) {
            return `[tool result] ${texts.join("\n")}`;
          }
        }
        if (title) {
          return `[tool:${status}] ${title}`;
        }
        return null;
      }
      case "plan": {
        const entries = update.entries as Array<{
          content: string;
          status: string;
        }>;
        if (entries && entries.length > 0) {
          return `[plan] ${entries.map((e) => `${e.status}: ${e.content}`).join(", ")}`;
        }
        return null;
      }
      default:
        // Log unknown update types for debugging
        return `[${type}] ${JSON.stringify(update)}`;
    }
  }

  private handleCompletion(): void {
    if (this.hasCompleted) {
      return;
    }
    this.hasCompleted = true;

    this.emitOutput({
      content: "[system] Gemini task completed",
      logType: "system",
    });

    this.exitCallback?.(0);

    // Send cancel notification and kill process
    if (this.process && this.sessionId) {
      this.sendNotification("session/cancel", { sessionId: this.sessionId });
      this.process.kill();
    }
  }
}
