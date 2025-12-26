import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ExecutorConfig, ExecutorOutput } from "../interface";

// Mock config/agent to avoid database dependency
mock.module("../../config/agent", () => ({
  getAgentPath: async () => "codex",
  getAgentConfig: async () => ({ enabled: true, path: "codex" }),
  isAgentEnabled: async () => true,
  getExecutorPath: async () => "codex",
  isExecutorEnabled: async () => true,
  executorToAgentKey: {
    ClaudeCode: "claudeCode",
    Codex: "codex",
    Copilot: "copilot",
    Gemini: "gemini",
  },
}));

// Import after mocking
const { CodexExecutor } = await import("../codex");

describe("CodexExecutor", () => {
  let executor: InstanceType<typeof CodexExecutor>;

  afterEach(() => {
    if (executor) {
      executor.stop();
    }
  });

  describe("onOutput", () => {
    test("registers output callback", () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      const callback = (output: ExecutorOutput) => outputs.push(output);

      executor.onOutput(callback);
    });
  });

  describe("onExit", () => {
    test("registers exit callback", () => {
      executor = new CodexExecutor();
      const callback = mock(() => {});

      executor.onExit(callback);
    });
  });

  describe("onSessionId", () => {
    test("registers sessionId callback", () => {
      executor = new CodexExecutor();
      const callback = mock(() => {});

      executor.onSessionId(callback);
    });
  });

  describe("stop", () => {
    test("does nothing when process is not running", async () => {
      executor = new CodexExecutor();

      // Should not throw
      await executor.stop();
    });
  });

  describe("start", () => {
    test("throws error when already running", async () => {
      executor = new CodexExecutor();
      const config: ExecutorConfig = {
        taskId: "codex-task",
        workingDirectory: "/tmp",
        prompt: "hello",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      // Create a mock stdout that responds to requests
      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {}),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => {
        // Send responses after a delay to simulate the app-server
        const encoder = new TextEncoder();
        setTimeout(() => {
          // Initialize response
          stdoutController.enqueue(encoder.encode('{"id":1,"result":{}}\n'));
        }, 5);
        setTimeout(() => {
          // newConversation response
          stdoutController.enqueue(
            encoder.encode(
              '{"id":2,"result":{"conversationId":"test-conv-123"}}\n',
            ),
          );
        }, 10);
        setTimeout(() => {
          // addConversationListener response
          stdoutController.enqueue(encoder.encode('{"id":3,"result":{}}\n'));
        }, 15);
        setTimeout(() => {
          // sendUserMessage response
          stdoutController.enqueue(encoder.encode('{"id":4,"result":{}}\n'));
        }, 20);
        return mockProcess;
      });

      try {
        await executor.start(config);

        await expect(executor.start(config)).rejects.toThrow(
          "Executor is already running",
        );
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("spawns codex exec with correct arguments", async () => {
      executor = new CodexExecutor();
      const config: ExecutorConfig = {
        taskId: "codex-spawn-args",
        workingDirectory: "/work/tree",
        prompt: "prompt",
      };

      const originalSpawn = Bun.spawn;
      let spawnArgs: unknown;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {}),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock((args: unknown) => {
        spawnArgs = args;
        const encoder = new TextEncoder();
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":1,"result":{}}\n'));
        }, 5);
        setTimeout(() => {
          stdoutController.enqueue(
            encoder.encode(
              '{"id":2,"result":{"conversationId":"test-conv-123"}}\n',
            ),
          );
        }, 10);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":3,"result":{}}\n'));
        }, 15);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":4,"result":{}}\n'));
        }, 20);
        return mockProcess;
      });

      try {
        await executor.start(config);

        const args = spawnArgs as { cmd: string[]; cwd: string };
        expect(args.cmd).toEqual([
          "codex",
          "exec",
          "--json",
          "--sandbox",
          "danger-full-access",
          "prompt",
        ]);
        expect(args.cwd).toBe("/work/tree");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("emits system log on start", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output: ExecutorOutput) => outputs.push(output));

      const config: ExecutorConfig = {
        taskId: "codex-system-log",
        workingDirectory: "/tmp",
        prompt: "hello",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {}),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => {
        const encoder = new TextEncoder();
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":1,"result":{}}\n'));
        }, 5);
        setTimeout(() => {
          stdoutController.enqueue(
            encoder.encode(
              '{"id":2,"result":{"conversationId":"test-conv-123"}}\n',
            ),
          );
        }, 10);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":3,"result":{}}\n'));
        }, 15);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":4,"result":{}}\n'));
        }, 20);
        return mockProcess;
      });

      try {
        await executor.start(config);
        await new Promise((resolve) => setTimeout(resolve, 20));

        const systemLog = outputs.find((o) => o.logType === "system");
        expect(systemLog).toBeDefined();
        expect(systemLog?.content).toContain("Started Codex executor");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("stop", () => {
    test("kills the process and emits system log", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output: ExecutorOutput) => outputs.push(output));

      const config: ExecutorConfig = {
        taskId: "codex-stop",
        workingDirectory: "/tmp",
        prompt: "prompt",
      };

      const originalSpawn = Bun.spawn;
      let killed = false;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {
          killed = true;
        }),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => {
        const encoder = new TextEncoder();
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":1,"result":{}}\n'));
        }, 5);
        setTimeout(() => {
          stdoutController.enqueue(
            encoder.encode(
              '{"id":2,"result":{"conversationId":"test-conv-123"}}\n',
            ),
          );
        }, 10);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":3,"result":{}}\n'));
        }, 15);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":4,"result":{}}\n'));
        }, 20);
        return mockProcess;
      });

      try {
        await executor.start(config);
        outputs.length = 0;

        await executor.stop();

        expect(killed).toBe(true);
        const stopLog = outputs.find(
          (o) => o.logType === "system" && o.content.includes("stopped"),
        );
        expect(stopLog).toBeDefined();
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("output parsing", () => {
    test("parses codex event notifications", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output: ExecutorOutput) => outputs.push(output));

      const config: ExecutorConfig = {
        taskId: "codex-parse",
        workingDirectory: "/tmp",
        prompt: "prompt",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {}),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => {
        const encoder = new TextEncoder();
        // Send thread.started event
        setTimeout(() => {
          const threadStarted = {
            type: "thread.started",
            // biome-ignore lint/style/useNamingConvention: Codex API uses snake_case
            thread_id: "test-thread-123",
          };
          stdoutController.enqueue(
            encoder.encode(`${JSON.stringify(threadStarted)}\n`),
          );
        }, 5);
        // Send an agent_message item.completed event (actual Codex format)
        setTimeout(() => {
          const event = {
            type: "item.completed",
            item: {
              id: "item_1",
              type: "agent_message",
              text: "Hello from Codex!",
            },
          };
          stdoutController.enqueue(
            encoder.encode(`${JSON.stringify(event)}\n`),
          );
        }, 20);
        return mockProcess;
      });

      try {
        await executor.start(config);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Find the parsed agent_message output
        const agentMessageLog = outputs.find(
          (o) => o.logType === "stdout" && o.content === "Hello from Codex!",
        );

        expect(agentMessageLog).toBeDefined();
        expect(agentMessageLog?.content).toBe("Hello from Codex!");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("handles stderr output", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output: ExecutorOutput) => outputs.push(output));

      const config: ExecutorConfig = {
        taskId: "codex-stderr",
        workingDirectory: "/tmp",
        prompt: "prompt",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      let stderrController: ReadableStreamDefaultController<Uint8Array>;
      const mockStderr = new ReadableStream<Uint8Array>({
        start(controller) {
          stderrController = controller;
        },
      });

      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {}),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => {
        const encoder = new TextEncoder();
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":1,"result":{}}\n'));
        }, 5);
        setTimeout(() => {
          stdoutController.enqueue(
            encoder.encode(
              '{"id":2,"result":{"conversationId":"test-conv-123"}}\n',
            ),
          );
        }, 10);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":3,"result":{}}\n'));
        }, 15);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":4,"result":{}}\n'));
        }, 20);
        // Send stderr output
        setTimeout(() => {
          stderrController.enqueue(encoder.encode("error message\n"));
        }, 25);
        return mockProcess;
      });

      try {
        await executor.start(config);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const stderrLog = outputs.find((o) => o.logType === "stderr");
        expect(stderrLog).toBeDefined();
        expect(stderrLog?.content).toContain("error");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("handles non-JSON stdout output", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output: ExecutorOutput) => outputs.push(output));

      const config: ExecutorConfig = {
        taskId: "codex-non-json",
        workingDirectory: "/tmp",
        prompt: "prompt",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      let stdoutController: ReadableStreamDefaultController<Uint8Array>;
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          stdoutController = controller;
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockProcess = {
        stdin: mockStdin,
        stdout: mockStdout,
        stderr: mockStderr,
        kill: mock(() => {}),
        exited: new Promise(() => {}),
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => {
        const encoder = new TextEncoder();
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":1,"result":{}}\n'));
        }, 5);
        setTimeout(() => {
          stdoutController.enqueue(
            encoder.encode(
              '{"id":2,"result":{"conversationId":"test-conv-123"}}\n',
            ),
          );
        }, 10);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":3,"result":{}}\n'));
        }, 15);
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode('{"id":4,"result":{}}\n'));
        }, 20);
        // Send non-JSON output
        setTimeout(() => {
          stdoutController.enqueue(encoder.encode("plain output\n"));
        }, 25);
        return mockProcess;
      });

      try {
        await executor.start(config);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const stdoutLog = outputs.find(
          (o) => o.logType === "stdout" && o.content.includes("plain output"),
        );
        expect(stdoutLog).toBeDefined();
        expect(stdoutLog?.content).toBe("plain output");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });
});
