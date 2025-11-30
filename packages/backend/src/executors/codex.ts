import type { Subprocess } from "bun";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  ExitCallback,
  OutputCallback,
  SessionIdCallback,
} from "./interface";

// Codex app-server protocol types (simplified JSON-RPC without "jsonrpc" field)
// See: codex-rs/app-server-protocol/src/jsonrpc_lite.rs
// "We do not do true JSON-RPC 2.0, as we neither send nor expect the jsonrpc field"
interface CodexRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface CodexNotification {
  method: string;
  params?: unknown;
}

interface CodexResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface NewConversationResponse {
  conversationId: string;
}

export class CodexExecutor implements Executor {
  private process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private outputCallback: OutputCallback | null = null;
  private exitCallback: ExitCallback | null = null;
  private sessionIdCallback: SessionIdCallback | null = null;
  private isRunning = false;
  private hasCompleted = false;
  private requestId = 1;
  private conversationId: string | null = null;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  async start(config: ExecutorConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error("Executor is already running");
    }

    this.isRunning = true;

    // Use npx to run codex app-server (same version as reference implementation)
    this.process = Bun.spawn({
      cmd: ["npx", "-y", "@openai/codex@0.60.1", "app-server"],
      cwd: config.workingDirectory,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        NO_COLOR: "1",
      },
    });

    const resumeInfo = config.sessionId
      ? ` (resuming session ${config.sessionId})`
      : "";
    this.emitOutput({
      content: `[system] Started Codex executor for task ${config.taskId}${resumeInfo}`,
      logType: "system",
    });

    // Start reading stdout and stderr
    this.readOutputStream(this.process.stdout);
    this.readStderr(this.process.stderr);

    // Handle process exit
    this.process.exited.then((exitCode) => {
      this.emitOutput({
        content: `[system] Codex process exited with code ${exitCode}`,
        logType: "system",
      });
      this.isRunning = false;
      this.process = null;
      if (!this.hasCompleted) {
        this.exitCallback?.(exitCode);
      }
    });

    try {
      // Initialize the JSON-RPC connection
      await this.initialize();

      // Start a new conversation or resume
      if (config.sessionId) {
        await this.resumeConversation(
          config.sessionId,
          config.workingDirectory,
        );
      } else {
        await this.newConversation(config.workingDirectory);
      }

      // Add conversation listener to receive events
      await this.addConversationListener();

      // Send the initial prompt
      await this.sendUserMessage(config.prompt);
    } catch (error) {
      this.emitOutput({
        content: `[system] Error initializing Codex: ${error}`,
        logType: "system",
      });
      throw error;
    }
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
    if (!this.process || !this.isRunning || !this.conversationId) {
      throw new Error("Process is not running or conversation not started");
    }
    await this.sendUserMessage(message);
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

  // Codex protocol helper methods (simplified JSON-RPC without "jsonrpc" field)
  private async sendRequest(
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    if (!this.process) throw new Error("Process not running");

    const id = this.requestId++;
    const request: CodexRequest = {
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const line = `${JSON.stringify(request)}\n`;
      this.process?.stdin.write(line);
      this.process?.stdin.flush();
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.process) return;

    const notification: CodexNotification = {
      method,
      params,
    };

    const line = `${JSON.stringify(notification)}\n`;
    this.process.stdin.write(line);
    this.process.stdin.flush();
  }

  private async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      clientInfo: {
        name: "sahai-codex-executor",
        version: "1.0.0",
      },
    });
    this.sendNotification("initialized");
  }

  private async newConversation(cwd: string): Promise<void> {
    const response = (await this.sendRequest("newConversation", {
      cwd,
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
    })) as NewConversationResponse;

    this.conversationId = response.conversationId;
    console.log(`[CodexExecutor] New conversation: ${this.conversationId}`);

    // Notify session ID
    if (this.conversationId && this.sessionIdCallback) {
      this.sessionIdCallback(this.conversationId);
    }
  }

  private async resumeConversation(
    sessionId: string,
    cwd: string,
  ): Promise<void> {
    // For Codex, we need to find the rollout file path
    // The session ID is typically the conversation ID
    const response = (await this.sendRequest("resumeConversation", {
      path: sessionId, // This should be the path to the rollout file
      overrides: {
        cwd,
      },
    })) as NewConversationResponse;

    this.conversationId = response.conversationId;
    console.log(`[CodexExecutor] Resumed conversation: ${this.conversationId}`);
  }

  private async addConversationListener(): Promise<void> {
    if (!this.conversationId) throw new Error("No conversation started");

    await this.sendRequest("addConversationListener", {
      conversationId: this.conversationId,
    });
  }

  private async sendUserMessage(message: string): Promise<void> {
    if (!this.conversationId) throw new Error("No conversation started");

    // InputItem uses serde(tag = "type", content = "data") format
    await this.sendRequest("sendUserMessage", {
      conversationId: this.conversationId,
      items: [{ type: "text", data: { text: message } }],
    });
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
            this.handleJsonRpcMessage(line);
          }
        }
      }

      if (buffer.trim()) {
        this.handleJsonRpcMessage(buffer);
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
    } catch (_error) {
      // Ignore stderr read errors
    } finally {
      reader.releaseLock();
    }
  }

  private handleJsonRpcMessage(line: string): void {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;

      // Handle response to our requests (has id but no method)
      if ("id" in msg && !("method" in msg)) {
        const response = msg as CodexResponse;
        const pending = this.pendingRequests.get(response.id as number);
        if (pending) {
          this.pendingRequests.delete(response.id as number);
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
        const method = msg.method as string;
        const requestId = msg.id;
        const params = msg.params as Record<string, unknown>;

        // Log the request
        this.emitOutput({
          content: JSON.stringify({ method, params }),
          logType: "stdout",
        });

        // Handle approval requests - auto-approve
        if (
          method === "applyPatchApproval" ||
          method === "execCommandApproval"
        ) {
          this.sendApprovalResponse(requestId, "approved_for_session");
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

      // Log other messages
      this.emitOutput({
        content: JSON.stringify(msg),
        logType: "stdout",
      });
    } catch {
      // Non-JSON output
      this.emitOutput({ content: line, logType: "stdout" });
    }
  }

  private handleServerNotification(
    method: string,
    params: Record<string, unknown>,
  ): void {
    // Log the notification
    this.emitOutput({
      content: JSON.stringify({ method, params }),
      logType: "stdout",
    });

    // Check for task completion event (codex/event/task_complete)
    if (method.startsWith("codex/event/")) {
      const eventType = method.replace("codex/event/", "");
      if (eventType === "task_complete") {
        console.log("[CodexExecutor] Detected task completion");
        this.handleCompletion();
      }
    }
  }

  private sendApprovalResponse(requestId: unknown, decision: string): void {
    if (!this.process) return;

    // Codex protocol response (no jsonrpc field)
    const response = {
      id: requestId,
      result: { decision },
    };

    const line = `${JSON.stringify(response)}\n`;
    this.process.stdin.write(line);
    this.process.stdin.flush();
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

    if (this.exitCallback) {
      console.log("[CodexExecutor] Calling exit callback");
      this.exitCallback(0);
    }

    if (this.process) {
      console.log("[CodexExecutor] Killing process");
      this.process.kill();
    }
  }
}
