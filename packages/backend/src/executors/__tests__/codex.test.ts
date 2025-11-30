import { afterEach, describe, expect, mock, test } from "bun:test";
import { CodexExecutor } from "../codex";
import type { ExecutorConfig, ExecutorOutput } from "../interface";

describe("CodexExecutor", () => {
  let executor: CodexExecutor;

  afterEach(async () => {
    if (executor) {
      await executor.stop().catch(() => {});
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

  describe("sendMessage", () => {
    test("throws error when process is not running", async () => {
      executor = new CodexExecutor();

      await expect(executor.sendMessage("hello")).rejects.toThrow(
        "Process is not running",
      );
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

        await expect(executor.start(config)).rejects.toThrow(
          "Executor is already running",
        );
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("emits system log on start", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output) => outputs.push(output));

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
        await new Promise((resolve) => setTimeout(resolve, 20));

        const systemLog = outputs.find((o) => o.logType === "system");
        expect(systemLog).toBeDefined();
        expect(systemLog?.content).toContain("Started Codex executor");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("sends initial prompt message", async () => {
      executor = new CodexExecutor();
      const writtenMessages: string[] = [];

      const config: ExecutorConfig = {
        taskId: "codex-initial-prompt",
        workingDirectory: "/tmp",
        prompt: "Hello Codex",
      };

      const originalSpawn = Bun.spawn;
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
        expect(writtenMessages[0]).toBe("Hello Codex\n");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("spawns codex with correct arguments", async () => {
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

        const args = spawnArgs as { cmd: string[]; cwd: string };
        expect(args.cmd).toEqual([
          "codex",
          "exec",
          "--json",
          "--full-auto",
          "-",
        ]);
        expect(args.cwd).toBe("/work/tree");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("stop", () => {
    test("kills the process and emits system log", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output) => outputs.push(output));

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

  describe("sendMessage when running", () => {
    test("writes message to stdin", async () => {
      executor = new CodexExecutor();
      const writtenMessages: string[] = [];

      const config: ExecutorConfig = {
        taskId: "codex-send",
        workingDirectory: "/tmp",
        prompt: "initial",
      };

      const originalSpawn = Bun.spawn;
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
        writtenMessages.length = 0;

        await executor.sendMessage("follow up");
        expect(writtenMessages).toEqual(["follow up\n"]);
      } finally {
        Bun.spawn = originalSpawn;
      }
    });
  });

  describe("output parsing", () => {
    test("parses stdout JSON messages", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output) => outputs.push(output));

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
      const mockStdout = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('{"event":"message"}\n'));
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
        await new Promise((resolve) => setTimeout(resolve, 50));

        const stdoutLog = outputs.find((o) => o.logType === "stdout");
        expect(stdoutLog).toBeDefined();
        expect(stdoutLog?.content).toContain("message");
      } finally {
        Bun.spawn = originalSpawn;
      }
    });

    test("handles stderr output", async () => {
      executor = new CodexExecutor();
      const outputs: ExecutorOutput[] = [];
      executor.onOutput((output) => outputs.push(output));

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
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("error\n"));
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
      executor.onOutput((output) => outputs.push(output));

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
      const mockStdout = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("plain output\n"));
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
