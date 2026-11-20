import { MessageChannelMain, type UtilityProcess } from "electron";
import { renderFetch } from "./render-fetch";
import type { LogSink } from "./logger";

/**
 * Main-process side of the backend ↔ desktop channel. One offer hands the
 * backend a fresh MessagePortMain; the backend acknowledges with a `ready`
 * ping, after which it can request rendered fetches. If the backend missed
 * the transfer (it attaches listeners asynchronously), a new channel is
 * offered on a short retry cadence.
 */

const OFFER_TIMEOUT_MS = 3_000;
const MAX_OFFER_ATTEMPTS = 6;

export function attachRenderChannel(
  backend: UtilityProcess,
  log: LogSink,
): void {
  let ready = false;
  let attempts = 0;
  let retryTimer: NodeJS.Timeout | null = null;

  const offer = () => {
    if (ready || attempts >= MAX_OFFER_ATTEMPTS) return;
    attempts += 1;
    // Main keeps this end and answers requests; port1 is transferred.
    const { port1, port2 } = new MessageChannelMain();
    port2.on("message", (event) => {
      const payload = event.data as {
        id?: number;
        method?: string;
        url?: string;
      };
      if (payload?.method === "ready") {
        ready = true;
        if (retryTimer) clearTimeout(retryTimer);
        log.write(
          `[${new Date().toISOString()}] desktop render channel ready (attempt ${attempts})`,
        );
        return;
      }
      if (payload?.method !== "render-fetch" || typeof payload.url !== "string")
        return;
      const id = typeof payload.id === "number" ? payload.id : -1;
      void renderFetch(payload.url)
        .then((data) => {
          port2.postMessage({ id, ok: true, data });
        })
        .catch((error: unknown) => {
          port2.postMessage({
            id,
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "The render fetch failed.",
          });
        });
    });
    port2.on("close", () => {
      ready = false;
    });
    backend.postMessage({ type: "desktop-channel" }, [port1]);
    retryTimer = setTimeout(offer, OFFER_TIMEOUT_MS);
    retryTimer.unref();
  };

  offer();
}
