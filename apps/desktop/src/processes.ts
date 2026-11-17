import { utilityProcess, type UtilityProcess } from "electron";
import { desktopIdentity } from "./channel";
import type { LogSink } from "./logger";
import { logChunk } from "./logger";

export interface ManagedProcess {
  name: string;
  child: UtilityProcess;
  logPath: string;
  stop: () => Promise<void>;
  exited: Promise<number | null>;
}

export interface StartProcessOptions {
  name: string;
  entry: string;
  env: Record<string, string | undefined>;
  log: LogSink;
  onUnexpectedExit: (name: string, code: number | null) => void;
}

export function startManagedProcess(
  options: StartProcessOptions,
): ManagedProcess {
  const child = utilityProcess.fork(options.entry, [], {
    env: options.env,
    stdio: "pipe",
    serviceName: `${desktopIdentity().executableName}-${options.name}`,
  });
  const startedAt = Date.now();
  let stopping = false;
  let settled = false;
  let resolveExit: (code: number | null) => void = () => {};
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve;
  });

  child.stdout?.on("data", (chunk) => logChunk(options.log, chunk as Buffer));
  child.stderr?.on("data", (chunk) => logChunk(options.log, chunk as Buffer));
  child.on("exit", (code) => {
    if (settled) return;
    settled = true;
    resolveExit(code);
    if (!stopping) options.onUnexpectedExit(options.name, code);
  });
  options.log.write(
    `[${new Date().toISOString()}] started ${options.name} pid=${child.pid ?? "unknown"} entry=${options.entry} at=${startedAt}`,
  );

  return {
    name: options.name,
    child,
    logPath: options.log.path,
    exited,
    async stop() {
      if (stopping) return;
      stopping = true;
      const pid = child.pid;
      if (!pid || settled) return;
      options.log.write(
        `[${new Date().toISOString()}] stopping ${options.name} pid=${pid}`,
      );
      signal(pid, "SIGTERM");
      if (!(await within(exited, 12_000))) {
        options.log.write(
          `[${new Date().toISOString()}] force killing ${options.name} pid=${pid}`,
        );
        signal(pid, "SIGKILL");
        await within(exited, 3_000);
      }
      options.log.write(
        `[${new Date().toISOString()}] stopped ${options.name}`,
      );
    },
  };
}

export async function waitForHttp(
  url: string,
  process: ManagedProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "No response.";
  let exited = false;
  void process.exited.then(() => {
    exited = true;
  });
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `${process.name} exited before becoming ready. See ${process.logPath}.`,
      );
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "No response.";
    }
    await delay(250);
  }
  throw new Error(
    `${process.name} did not become ready at ${url} within ${Math.round(timeoutMs / 1000)} seconds (${lastError}). See ${process.logPath}.`,
  );
}

export async function startAndWait(
  options: StartProcessOptions,
  healthUrl: string,
  timeoutMs: number,
): Promise<ManagedProcess> {
  const process = startManagedProcess(options);
  try {
    await waitForHttp(healthUrl, process, timeoutMs);
    options.log.write(
      `[${new Date().toISOString()}] ${options.name} ready at ${healthUrl}`,
    );
    return process;
  } catch (error) {
    await process.stop();
    throw error;
  }
}

function signal(pid: number, name: NodeJS.Signals): void {
  try {
    process.kill(pid, name);
  } catch {
    // The process may already have exited.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    delay(ms).then(() => false),
  ]);
}
