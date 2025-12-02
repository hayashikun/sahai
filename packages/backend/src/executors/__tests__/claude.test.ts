import { afterEach, describe, expect, mock, test } from "bun:test";
import { ClaudeCodeExecutor } from "../claude";
import type { ExecutorConfig, ExecutorOutput } from "../interface";

describe("ClaudeCodeExecutor", () => {
  let executor: ClaudeCodeExecutor;

  afterEach(async () => {
    // Ensure executor is stopped after each test
    if (executor) {
      await executor.stop().catch(() => {});
    }
  });

  describe("onOutput", () => {
    test("registers output callback", () => {
      executor = new ClaudeCodeExecutor();
      const outputs: ExecutorOutput[] = [];
      const callback = (output: ExecutorOutput) => {
        outputs.push(output);
      };

      // Should not throw
      executor.onOutput(callback);
    });
  });

  describe("stop", () => {
    test("does nothing when process is not running", async () => {
      executor = new ClaudeCodeExecutor();

      // Should not throw
      await executor.stop();
    });
  });

  describe("start", () => {
    test("throws error when already running", async () => {
      executor = new ClaudeCodeExecutor();

      const config: ExecutorConfig = {
        taskId: "test-task-id",
        workingDirectory: "/tmp",
        prompt: "test prompt",
      };

      // Mock the spawn to not actually run claude
      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
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
        exited: new Promise(() => {}), // Never resolves
      };

      // @ts-expect-error - mocking Bun.spawn
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        // Try to start again while running
        try {
          await executor.start(config);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe("Executor is already running");
        }
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("emits system log on start", async () => {
      executor = new ClaudeCodeExecutor();
      const outputs: ExecutorOutput[] = [];

      executor.onOutput((output) => {
        outputs.push(output);
      });

      const config: ExecutorConfig = {
        taskId: "test-task-123",
        workingDirectory: "/tmp",
        prompt: "test prompt",
      };

      // Mock the spawn
      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        // Wait a bit for async operations
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Should have emitted a system log
        expect(outputs.length).toBeGreaterThanOrEqual(1);
        const systemLog = outputs.find((o) => o.logType === "system");
        expect(systemLog).toBeDefined();
        expect(systemLog?.content).toContain("Started Claude Code executor");
        expect(systemLog?.content).toContain("test-task-123");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("sends initial prompt message", async () => {
      executor = new ClaudeCodeExecutor();

      const config: ExecutorConfig = {
        taskId: "test-task-456",
        workingDirectory: "/tmp",
        prompt: "Hello, please help me",
      };

      // Mock the spawn
      const originalSpawn = Bun.spawn;
      const writtenMessages: string[] = [];
      const mockStdin = {
        write: mock((data: string) => {
          writtenMessages.push(data);
        }),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        // Verify the initial prompt was sent
        expect(writtenMessages.length).toBe(1);
        const sentMessage = JSON.parse(writtenMessages[0].trim());
        expect(sentMessage.type).toBe("user");
        expect(sentMessage.message.role).toBe("user");
        expect(sentMessage.message.content).toEqual([
          { type: "text", text: "Hello, please help me" },
        ]);
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("spawns claude with correct arguments", async () => {
      executor = new ClaudeCodeExecutor();

      const config: ExecutorConfig = {
        taskId: "test-task-789",
        workingDirectory: "/test/working/dir",
        prompt: "test",
      };

      const originalSpawn = Bun.spawn;
      let spawnArgs: unknown;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
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
        return mockProcess;
      });

      try {
        await executor.start(config);

        expect(spawnArgs).toBeDefined();
        const args = spawnArgs as { cmd: string[]; cwd: string };
        expect(args.cmd).toContain("claude");
        expect(args.cmd).toContain("-p");
        expect(args.cmd).toContain("--output-format");
        expect(args.cmd).toContain("stream-json");
        expect(args.cmd).toContain("--input-format");
        expect(args.cmd).toContain("--verbose");
        expect(args.cmd).toContain("--dangerously-skip-permissions");
        expect(args.cwd).toBe("/test/working/dir");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("stop", () => {
    test("kills the process and emits system log", async () => {
      executor = new ClaudeCodeExecutor();
      const outputs: ExecutorOutput[] = [];

      executor.onOutput((output) => {
        outputs.push(output);
      });

      const config: ExecutorConfig = {
        taskId: "test-stop-task",
        workingDirectory: "/tmp",
        prompt: "test",
      };

      const originalSpawn = Bun.spawn;
      let killed = false;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);
        outputs.length = 0; // Clear start logs

        await executor.stop();

        expect(killed).toBe(true);

        // Should have emitted a stop system log
        const stopLog = outputs.find(
          (o) => o.logType === "system" && o.content.includes("stopped"),
        );
        expect(stopLog).toBeDefined();
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("sendMessage", () => {
    test("sends message to running process", async () => {
      executor = new ClaudeCodeExecutor();

      const config: ExecutorConfig = {
        taskId: "test-send-task",
        workingDirectory: "/tmp",
        prompt: "initial prompt",
      };

      const originalSpawn = Bun.spawn;
      const writtenMessages: string[] = [];
      const mockStdin = {
        write: mock((data: string) => {
          writtenMessages.push(data);
        }),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        expect(writtenMessages.length).toBe(1);
        const sentMessage = JSON.parse(writtenMessages[0].trim());
        expect(sentMessage.type).toBe("user");
        expect(sentMessage.message.role).toBe("user");
        expect(sentMessage.message.content).toEqual([
          { type: "text", text: "initial prompt" },
        ]);
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("output parsing", () => {
    test("parses stdout JSON messages", async () => {
      executor = new ClaudeCodeExecutor();
      const outputs: ExecutorOutput[] = [];

      executor.onOutput((output) => {
        outputs.push(output);
      });

      const config: ExecutorConfig = {
        taskId: "test-parse-task",
        workingDirectory: "/tmp",
        prompt: "test",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      // Create a stream that emits JSON data
      const mockStdout = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('{"type":"message","content":"Hello"}\n'),
          );
          controller.close();
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        // Wait for stream processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should have stdout output
        const stdoutLog = outputs.find((o) => o.logType === "stdout");
        expect(stdoutLog).toBeDefined();
        expect(stdoutLog?.content).toContain("message");
        expect(stdoutLog?.content).toContain("Hello");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("handles stderr output", async () => {
      executor = new ClaudeCodeExecutor();
      const outputs: ExecutorOutput[] = [];

      executor.onOutput((output) => {
        outputs.push(output);
      });

      const config: ExecutorConfig = {
        taskId: "test-stderr-task",
        workingDirectory: "/tmp",
        prompt: "test",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      // Create a stream that emits error data
      const mockStderr = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("Error: something went wrong\n"));
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        // Wait for stream processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should have stderr output
        const stderrLog = outputs.find((o) => o.logType === "stderr");
        expect(stderrLog).toBeDefined();
        expect(stderrLog?.content).toContain("Error: something went wrong");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("handles non-JSON stdout output", async () => {
      executor = new ClaudeCodeExecutor();
      const outputs: ExecutorOutput[] = [];

      executor.onOutput((output) => {
        outputs.push(output);
      });

      const config: ExecutorConfig = {
        taskId: "test-nonjson-task",
        workingDirectory: "/tmp",
        prompt: "test",
      };

      const originalSpawn = Bun.spawn;
      const mockStdin = {
        write: mock(() => {}),
        flush: mock(() => {}),
      };

      // Create a stream that emits non-JSON data
      const mockStdout = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("Plain text output\n"));
          controller.close();
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
      Bun.spawn = mock(() => mockProcess);

      try {
        await executor.start(config);

        // Wait for stream processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should have stdout output with plain text
        const stdoutLog = outputs.find(
          (o) => o.logType === "stdout" && o.content.includes("Plain text"),
        );
        expect(stdoutLog).toBeDefined();
        expect(stdoutLog?.content).toBe("Plain text output");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });
});
