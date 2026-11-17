import { createWriteStream, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

export interface LogSink {
  write(line: string): void;
  close(): void;
  path: string;
}

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function createLogSink(
  directory: string,
  name: string,
  options: { echo?: boolean } = {},
): LogSink {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, name);
  try {
    if (statSync(path).size > MAX_LOG_BYTES) {
      renameSync(path, `${path}.1`);
    }
  } catch {
    // The log does not exist yet.
  }
  const stream = createWriteStream(path, { flags: "a", mode: 0o600 });
  return {
    path,
    write(line: string) {
      const text = line.endsWith("\n") ? line : `${line}\n`;
      stream.write(text);
      if (options.echo) process.stdout.write(text);
    },
    close() {
      stream.end();
    },
  };
}

export function logChunk(sink: LogSink, chunk: Buffer | string): void {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) sink.write(line);
  }
}
