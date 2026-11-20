import type { MessagePort } from "node:worker_threads";

/**
 * Backend ↔ desktop channel for rendered fetch. When the backend runs as an
 * Electron utility process, the desktop main process hands it one end of a
 * MessageChannelMain over the utility process's parent port; the backend keeps
 * that end and sends render-fetch requests over it. When the backend runs
 * standalone (development, tests) there is no parent port and the channel
 * stays unavailable — callers degrade instead of failing the run.
 */

export type RenderedPage = {
  url: string;
  title: string;
  text: string;
  renderedAt: string;
};

type PendingRequest = {
  resolve: (value: RenderedPage) => void;
  reject: (error: Error) => void;
};

type ParentPortLike = {
  on: (
    event: "message",
    listener: (event: { data?: unknown; ports?: MessagePort[] }) => void,
  ) => void;
};

let port: MessagePort | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

const parentPort = (process as unknown as { parentPort?: ParentPortLike })
  .parentPort;

export function initDesktopRenderChannel(): void {
  if (!parentPort) return;
  parentPort.on("message", (event) => {
    const received = event?.ports?.[0];
    if (received) attachPort(received);
  });
}

function attachPort(received: MessagePort): void {
  // Never let a dangling channel keep the backend process alive.
  received.unref?.();
  received.on("message", (payload: unknown) => {
    const message = payload as {
      id?: number;
      ok?: boolean;
      data?: RenderedPage;
      error?: string;
    };
    if (typeof message.id !== "number") return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok && message.data) entry.resolve(message.data);
    else entry.reject(new Error(message.error ?? "Render fetch failed."));
  });
  port = received;
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- MessagePort, not window.postMessage
  received.postMessage({ id: 0, method: "ready" });
}

/**
 * Asks the desktop to render a page in a hidden browser window. Returns null
 * when no desktop channel is attached (backend running standalone). Renders
 * count against the run's budget in the caller.
 */
export async function requestRenderFetch(
  url: string,
  timeoutMs = 30_000,
): Promise<RenderedPage | null> {
  if (!port) return null;
  const id = nextRequestId++;
  const request = new Promise<RenderedPage>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  port.postMessage({ id, method: "render-fetch", url });
  const timeout = setTimeout(() => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.reject(new Error("The render fetch timed out."));
  }, timeoutMs);
  timeout.unref();
  try {
    return await request;
  } catch {
    return null;
  }
}
