import { BrowserWindow, session } from "electron";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Rendered fetch for JS-heavy pages (tier-2 engine). One hidden BrowserWindow
 * at a time in the desktop main process, on a dedicated in-memory session.
 * The window resolves DNS itself, so the guard runs both as a pre-check and
 * as a webRequest block rule on the render session (defense in depth).
 */

export type RenderedPage = {
  url: string;
  title: string;
  text: string;
  renderedAt: string;
};

export class RenderFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderFetchError";
  }
}

const RENDER_PARTITION = "leads-render";
// Reserves a persistent partition for a future tier-3 login flow; nothing
// ships in it today. See docs/find-leads-discovery-plan.md §4.4.
const LOGIN_PARTITION = "persist:leads-login";
const RENDER_TIMEOUT_MS = 20_000;
const SETTLE_SAMPLE_MS = 500;
// Keep in sync with MAX_EXCERPT in apps/backend fetch-source.ts.
const MAX_TEXT = 7000;

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(value: string) {
  const address = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("::ffff:")) {
    return isPrivateIpv4(address.slice("::ffff:".length));
  }
  return (
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    address.startsWith("fe8") ||
    address.startsWith("fe9") ||
    address.startsWith("fea") ||
    address.startsWith("feb") ||
    address.startsWith("ff")
  );
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function isBlockedHostname(hostname: string) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home") ||
    host.endsWith(".lan")
  );
}

/** Resolves and validates that every address is public unicast. */
async function resolvePublicAddresses(
  hostname: string,
): Promise<{ address: string; family: 4 | 6 }[] | null> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return null;
  let addresses: { address: string; family: 4 | 6 }[];
  if (isIP(host)) {
    if (isPrivateAddress(host)) return null;
    addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
  } else {
    try {
      const found = await lookup(host, { all: true, verbatim: true });
      addresses = found.map((entry) => ({
        address: entry.address,
        family: entry.family === 6 ? 6 : 4,
      }));
    } catch {
      return null;
    }
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    return null;
  }
  return addresses;
}

let guardInstalled = false;

/**
 * Installs the webRequest guard once for the render partition: every request
 * the render window makes must target a resolvable, public HTTP(S) host.
 * Results are cached briefly so a page's many subresources do not each trigger
 * a DNS lookup.
 */
function installSessionGuard(): Electron.Session {
  const ses = session.fromPartition(RENDER_PARTITION);
  if (!guardInstalled) {
    guardInstalled = true;
    ses.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );
    ses.setPermissionCheckHandler(() => false);
    const allowedHosts = new Map<string, boolean>();
    ses.webRequest.onBeforeRequest((details, callback) => {
      let target: URL;
      try {
        target = new URL(details.url);
      } catch {
        callback({ cancel: true });
        return;
      }
      if (!["http:", "https:"].includes(target.protocol)) {
        callback({ cancel: true });
        return;
      }
      const hostname = target.hostname;
      const cached = allowedHosts.get(hostname);
      if (cached !== undefined) {
        callback({ cancel: !cached });
        return;
      }
      void resolvePublicAddresses(hostname).then((addresses) => {
        const allowed = Boolean(addresses) && !isBlockedHostname(hostname);
        allowedHosts.set(hostname, allowed);
        callback({ cancel: !allowed });
      });
    });
  }
  return ses;
}

async function readStableText(
  contents: Electron.WebContents,
  deadline: number,
): Promise<string> {
  const read = async () =>
    (await contents.executeJavaScript(
      "document.body ? String(document.body.innerText) : ''",
      false,
    )) as string;
  let previous = await read();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_SAMPLE_MS));
    const current = await read();
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

/**
 * Loads `url` in a hidden window, waits for the page to settle, and returns
 * the rendered inner text. Throws RenderFetchError on refusal, failure, or
 * the 20s cap; the window is always destroyed.
 */
export async function renderFetch(rawUrl: string): Promise<RenderedPage> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RenderFetchError("Use a valid HTTP or HTTPS source URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new RenderFetchError("Only HTTP and HTTPS sources can be rendered.");
  }
  if (url.username || url.password) {
    throw new RenderFetchError("Source URLs cannot include credentials.");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new RenderFetchError("Local source URLs are not allowed.");
  }
  const addresses = await resolvePublicAddresses(url.hostname);
  if (!addresses) {
    throw new RenderFetchError(
      "Source URLs must resolve to public internet addresses.",
    );
  }

  // The session guard (permission handlers + webRequest block rule) was
  // installed once on the render partition; just make sure it exists.
  installSessionGuard();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: RENDER_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      devTools: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  // Read through a holder object: the assignment happens inside a callback,
  // so a plain `let` would be narrowed to `null` by the checker.
  const loadFailureRef = { current: null as Error | null };
  const loadWatchdog = setTimeout(() => {
    loadFailureRef.current = new RenderFetchError(
      "The page did not finish loading in time.",
    );
    window.webContents.stop();
  }, RENDER_TIMEOUT_MS);
  loadWatchdog.unref();

  try {
    await window.loadURL(url.toString()).catch((error: Error) => {
      // Subresource and frame errors surface here too; only abort when the
      // main frame never loaded.
      loadFailureRef.current = loadFailureRef.current ?? error;
    });
    const failure = loadFailureRef.current;
    if (window.isDestroyed()) {
      throw failure ?? new RenderFetchError("Render window was closed.");
    }
    const text = await readStableText(window.webContents, deadline);
    if (failure && text.trim().length === 0) {
      throw new RenderFetchError(
        `Could not render ${url.hostname}. ${failure.message}`,
      );
    }
    return {
      url: window.webContents.getURL() || url.toString(),
      title: window.webContents.getTitle(),
      text: text.slice(0, MAX_TEXT),
      renderedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw error instanceof RenderFetchError
      ? error
      : new RenderFetchError(
          `Could not render ${url.hostname}. ${
            error instanceof Error ? error.message : "The render failed."
          }`,
        );
  } finally {
    clearTimeout(loadWatchdog);
    if (!window.isDestroyed()) window.destroy();
  }
}

export { RENDER_PARTITION, LOGIN_PARTITION };
