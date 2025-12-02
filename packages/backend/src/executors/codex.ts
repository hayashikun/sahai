import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Subprocess } from "bun";
import type {
  Executor,
  ExecutorConfig,
  ExecutorOutput,
  ExitCallback,
  OutputCallback,
  SessionIdCallback,
} from "./interface";

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
      cmd: ["codex", "app-server"],
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
    const rolloutPath = await this.forkRolloutFile(sessionId);

    // For Codex, we need to find the rollout file path
    // The session ID is typically the conversation ID
    const response = (await this.sendRequest("resumeConversation", {
      path: rolloutPath,
      overrides: {
        cwd,
      },
    })) as NewConversationResponse;

    this.conversationId = response.conversationId;
    console.log(`[CodexExecutor] Resumed conversation: ${this.conversationId}`);
  }

  private async forkRolloutFile(sessionId: string): Promise<string> {
    const original = await this.findRolloutFilePath(sessionId);
    const content = await readFile(original, "utf8");
    const [firstLine, ...rest] = content.split(/\r?\n/);
    if (!firstLine?.trim()) {
      throw new Error(`Rollout file ${original} missing header line`);
    }

    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(firstLine.trim());
    } catch (err) {
      throw new Error(
        `Failed to parse rollout header JSON in ${original}: ${String(err)}`,
      );
    }

    const payload = (meta as { payload?: Record<string, unknown> }).payload;
    if (!payload || typeof payload !== "object") {
      throw new Error(
        `Rollout meta payload missing or not an object in ${original}`,
      );
    }

    const newSessionId = randomUUID();
    payload.id = newSessionId;
    if (!("source" in payload)) {
      payload.source = {};
    }

    const newMetaLine = JSON.stringify({ ...meta, payload });
    const restLines = rest.join("\n");

    const destination = await this.createNewRolloutPath(newSessionId);
    await writeFile(
      destination,
      restLines.length > 0
        ? `${newMetaLine}\n${restLines}\n`
        : `${newMetaLine}\n`,
      "utf8",
    );

    return destination;
  }

  private async createNewRolloutPath(sessionId: string): Promise<string> {
    const now = new Date();
    const sessionsRoot = path.join(homedir(), ".codex", "sessions");
    const year = now.getFullYear().toString();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    const dir = path.join(sessionsRoot, year, month, day);
    await mkdir(dir, { recursive: true });

    const ts = `${year}-${month}-${day}T${`${now.getHours()}`.padStart(2, "0")}-${`${now.getMinutes()}`.padStart(2, "0")}-${`${now.getSeconds()}`.padStart(2, "0")}`;
    const filename = `rollout-${ts}-${sessionId}.jsonl`;
    return path.join(dir, filename);
  }

  private async findRolloutFilePath(sessionId: string): Promise<string> {
    // If caller provided a direct path, use it when it exists
    const directPath = path.resolve(sessionId);
    if (await this.pathExists(directPath)) {
      return directPath;
    }

    const sessionsRoot = path.join(homedir(), ".codex", "sessions");
    const dirsToSearch = [sessionsRoot];

    while (dirsToSearch.length > 0) {
      const current = dirsToSearch.pop();
      if (!current || !(await this.pathExists(current))) continue;

      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          dirsToSearch.push(fullPath);
          continue;
        }

        if (
          entry.isFile() &&
          entry.name.startsWith("rollout-") &&
          entry.name.endsWith(".jsonl") &&
          entry.name.includes(sessionId)
        ) {
          return fullPath;
        }
      }
    }

    throw new Error(
      `Could not find rollout file for session ${sessionId} under ${sessionsRoot}`,
    );
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await stat(targetPath);
      return true;
    } catch {
      return false;
    }
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
      // Don't log responses - just resolve pending requests
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
      // Don't log approval requests - just handle them silently
      if ("id" in msg && "method" in msg && typeof msg.method === "string") {
        const method = msg.method as string;
        const requestId = msg.id;

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

      // Skip other messages (don't log raw JSON)
    } catch {
      // Non-JSON output - log as-is
      if (line.trim()) {
        this.emitOutput({ content: line, logType: "stdout" });
      }
    }
  }

  private handleServerNotification(
    method: string,
    params: Record<string, unknown>,
  ): void {
    // Only process codex/event notifications - skip others silently
    if (!method.startsWith("codex/event")) {
      // Handle sessionConfigured silently (extract model info if needed)
      if (method === "sessionConfigured") {
        const model = params?.model as string;
        if (model) {
          this.emitOutput({
            content: `[system] Model: ${model}`,
            logType: "system",
          });
        }
      }
      return;
    }

    // Check for task completion event
    const eventType = method.replace("codex/event/", "");
    if (eventType === "task_complete") {
      console.log("[CodexExecutor] Detected task completion");
      this.handleCompletion();
      return;
    }

    // Parse and display Codex events in a human-readable format
    const msg = params?.msg as Record<string, unknown> | undefined;
    if (!msg) {
      return; // Skip if no msg field
    }

    const msgType = msg.type as string;
    const output = this.formatCodexEvent(msgType, msg);
    if (output) {
      this.emitOutput({ content: output, logType: "stdout" });
    }
  }

  private formatCodexEvent(
    type: string,
    msg: Record<string, unknown>,
  ): string | null {
    switch (type) {
      // Assistant messages
      case "agentMessage":
        return msg.message as string;
      case "agentMessageDelta":
        return msg.delta as string;

      // Thinking/Reasoning
      case "agentReasoning":
        return `[thinking] ${msg.text as string}`;
      case "agentReasoningDelta":
        return `[thinking] ${msg.delta as string}`;

      // Commands
      case "execCommandBegin": {
        const command = (msg.command as string[])?.join(" ") || "";
        return `[command] $ ${command}`;
      }
      case "execCommandEnd": {
        const exitCode = msg.exitCode as number;
        const output = msg.formattedOutput as string;
        if (output) {
          return `[command output] (exit: ${exitCode})\n${output}`;
        }
        return `[command] exit code: ${exitCode}`;
      }
      case "execCommandOutputDelta": {
        const chunk = msg.chunk as number[];
        if (chunk) {
          const text = String.fromCharCode(...chunk);
          return text;
        }
        return null;
      }
      case "execApprovalRequest": {
        const command = (msg.command as string[])?.join(" ") || "";
        const reason = msg.reason as string;
        return `[approval] Command: ${command || reason || "command execution"}`;
      }

      // File edits
      case "patchApplyBegin": {
        const changes = msg.changes as Record<string, unknown>;
        const paths = Object.keys(changes || {});
        return `[edit] Applying changes to: ${paths.join(", ")}`;
      }
      case "patchApplyEnd": {
        const success = msg.success as boolean;
        return success
          ? "[edit] Changes applied successfully"
          : "[edit] Failed to apply changes";
      }
      case "applyPatchApprovalRequest": {
        const changes = msg.changes as Record<string, unknown>;
        const paths = Object.keys(changes || {});
        return `[approval] Edit files: ${paths.join(", ")}`;
      }

      // MCP tool calls
      case "mcpToolCallBegin": {
        const invocation = msg.invocation as Record<string, unknown>;
        const server = invocation?.server as string;
        const tool = invocation?.tool as string;
        return `[mcp] Calling ${server}:${tool}`;
      }
      case "mcpToolCallEnd": {
        const invocation = msg.invocation as Record<string, unknown>;
        const tool = invocation?.tool as string;
        const result = msg.result as Record<string, unknown>;
        if (result?.Err) {
          return `[mcp] ${tool} failed: ${result.Err as string}`;
        }
        return `[mcp] ${tool} completed`;
      }

      // Web search
      case "webSearchBegin":
        return "[web] Starting web search...";
      case "webSearchEnd": {
        const query = msg.query as string;
        return `[web] Searched: ${query}`;
      }

      // Image viewing
      case "viewImageToolCall": {
        const path = msg.path as string;
        return `[image] Viewing: ${path}`;
      }

      // Plan/Todo updates
      case "planUpdate": {
        const plan = msg.plan as Array<{ step: string; status: string }>;
        const explanation = msg.explanation as string;
        if (explanation) {
          return `[plan] ${explanation}`;
        }
        if (plan && plan.length > 0) {
          return `[plan] Updated (${plan.length} steps)`;
        }
        return "[plan] Updated";
      }

      // Errors
      case "error":
        return `[error] ${msg.message as string}`;
      case "streamError":
        return `[error] Stream error: ${msg.message as string}`;

      // Background events
      case "backgroundEvent":
        return `[background] ${msg.message as string}`;

      // Session events
      case "sessionConfigured": {
        const model = msg.model as string;
        const sessionId = msg.sessionId as string;
        return `[system] Session configured (model: ${model}, session: ${sessionId?.slice(0, 8)}...)`;
      }
      case "taskStarted":
        return "[system] Task started";
      case "taskComplete":
        return "[system] Task complete";

      // Token usage (display summary)
      case "tokenCount": {
        const info = msg.info as Record<string, unknown>;
        if (info) {
          const input = info.input_tokens as number;
          const output = info.output_tokens as number;
          if (input || output) {
            return `[tokens] Input: ${input || 0}, Output: ${output || 0}`;
          }
        }
        return null;
      }

      // Internal events - skip silently (based on reference implementation)
      case "turnDiff":
      case "agentReasoningSectionBreak":
      case "agentReasoningRawContent":
      case "agentReasoningRawContentDelta":
      case "userMessage":
      case "getHistoryEntryResponse":
      case "mcpListToolsResponse":
      case "listCustomPromptsResponse":
      case "turnAborted":
      case "shutdownComplete":
      case "conversationPath":
      case "enteredReviewMode":
      case "exitedReviewMode":
        return null;

      default:
        // Log unknown events for debugging
        return `[${type}] ${JSON.stringify(msg)}`;
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
