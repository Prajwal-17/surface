import { AiError } from "./errors";

/** Provider requests allowed at once. This is admission control, not a quota. */
export const MAX_CONCURRENT_AI_REQUESTS = 2;

let activeRequests = 0;

export interface ModelSlot {
  release(): void;
}

export function modelCapacityAvailable() {
  return activeRequests < MAX_CONCURRENT_AI_REQUESTS;
}

export function activeModelRequests() {
  return activeRequests;
}

export class BusyAiError extends AiError {
  constructor() {
    super("busy", "Two AI requests are already running. Try again shortly.");
    this.name = "BusyAiError";
  }
}

export function acquireModelSlot(): ModelSlot {
  if (!modelCapacityAvailable()) throw new BusyAiError();
  activeRequests++;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
    },
  };
}

export async function withModelSlot<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const slot = acquireModelSlot();
  try {
    return await operation();
  } finally {
    slot.release();
  }
}
