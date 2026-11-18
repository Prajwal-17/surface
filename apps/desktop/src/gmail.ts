import { dialog, safeStorage, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";

const scope = "https://www.googleapis.com/auth/gmail.compose";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const draftEndpoint = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
const storageError =
  "Unlock your OS keyring to connect Gmail. Your local drafts are available.";

type Client = { id: string; secret: string };
type Credentials = {
  client: Client;
  email: string;
  sub: string;
  refreshToken: string;
};
type Draft = {
  id: string;
  to: string;
  subject: string;
  body: string;
  updatedAt: string;
};
type RemoteDraft = {
  messageId: string;
  remoteId?: string;
  savedRevision?: string;
};
type DraftMap = Record<string, RemoteDraft>;

export type GmailState = {
  email: string | null;
  available: boolean;
  error: string | null;
};

class GmailError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function protectedStorage() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  return (
    process.platform !== "linux" ||
    ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"].includes(
      safeStorage.getSelectedStorageBackend(),
    )
  );
}

async function atomicWrite(file: string, data: string | Buffer) {
  await mkdir(dirname(file), { mode: 0o700, recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, file);
}

async function readOptional(file: string) {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseClient(text: string): Client {
  const parsed = JSON.parse(text) as {
    installed?: { client_id?: unknown; client_secret?: unknown };
  };
  const installed = parsed.installed;
  if (
    typeof installed?.client_id !== "string" ||
    !installed.client_id.endsWith(".apps.googleusercontent.com") ||
    typeof installed.client_secret !== "string" ||
    !installed.client_secret
  ) {
    throw new Error("Choose the OAuth JSON for a Google Desktop app client.");
  }
  return { id: installed.client_id, secret: installed.client_secret };
}

async function exchange(client: Client, fields: Record<string, string>) {
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      ...fields,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };
  if (!response.ok || !tokens.access_token)
    throw new GmailError(
      response.status,
      tokens.error === "invalid_grant"
        ? "Gmail authorization expired. Reconnect the account and try again."
        : "Google could not authorize this Gmail connection.",
    );
  return { ...tokens, accessToken: tokens.access_token };
}

async function authorize(client: Client) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const server = createServer();
  const signal = AbortSignal.timeout(180000);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: client.id,
      redirect_uri: redirect,
      response_type: "code",
      scope: `openid email ${scope}`,
      access_type: "offline",
      prompt: "select_account consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    const code = await new Promise<string>((resolve, reject) => {
      signal.addEventListener(
        "abort",
        () =>
          reject(
            new Error("Gmail authorization timed out. Try connecting again."),
          ),
        { once: true },
      );
      server.on("request", (request, response) => {
        const path = new URL(request.url ?? "/", redirect);
        const headers = {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "close",
          "Referrer-Policy": "no-referrer",
        };
        if (
          request.method !== "GET" ||
          path.pathname !== "/oauth/callback" ||
          path.searchParams.get("state") !== state
        ) {
          response
            .writeHead(404, headers)
            .end("No matching authorization request.");
          return;
        }
        const value = path.searchParams.get("code");
        if (!value || path.searchParams.has("error")) {
          response
            .writeHead(400, headers)
            .end("Gmail connection was canceled. Return to Surface.");
          reject(new Error("Gmail authorization was canceled."));
          return;
        }
        response
          .writeHead(200, headers)
          .end("Authorization received. Return to Surface to see the result.");
        resolve(value);
      });
      void shell.openExternal(url.href).catch(reject);
    });
    const tokens = await exchange(client, {
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    if (!tokens.refresh_token || !tokens.scope?.split(" ").includes(scope)) {
      throw new Error(
        "Allow Gmail draft access and offline access when connecting your account.",
      );
    }
    const identity = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    const user = (await identity.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
    };
    if (!identity.ok || !user.sub || !user.email_verified || !user.email) {
      throw new Error("Google did not return a verified account email.");
    }
    return {
      client,
      email: user.email,
      sub: user.sub,
      refreshToken: tokens.refresh_token,
    };
  } finally {
    server.close();
  }
}

export function mimeMessage(draft: Draft, messageId: string) {
  const subject = Array.from(draft.subject)
    .reduce<string[]>(
      (lines, char) => {
        const last = lines.at(-1) ?? "";
        if (Buffer.byteLength(last + char) > 42) lines.push(char);
        else lines[lines.length - 1] = last + char;
        return lines;
      },
      [""],
    )
    .map((part) => `=?UTF-8?B?${Buffer.from(part).toString("base64")}?=`)
    .join("\r\n ");
  const content =
    Buffer.from(draft.body.replace(/\r?\n/g, "\r\n"))
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const lines = [
    ...(draft.to ? [`To: ${draft.to}`] : []),
    `Subject: ${subject}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    content,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

async function gmailRequest(
  token: string,
  url: string,
  method = "GET",
  data?: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new GmailError(
      response.status,
      response.status === 401
        ? "Reconnect Gmail in Settings."
        : `Gmail returned HTTP ${response.status}.`,
    );
  return (await response.json()) as {
    id?: string;
    drafts?: { id: string }[];
    nextPageToken?: string;
  };
}

export class GmailConnection {
  private readonly credentialsFile: string;
  private readonly linksFile: string;
  private queue = Promise.resolve<unknown>(null);

  constructor(root: string) {
    this.credentialsFile = join(root, "gmail-credentials");
    this.linksFile = join(root, "gmail-drafts.json");
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const work = this.queue.then(action);
    this.queue = work.catch(() => null);
    return work;
  }

  private async credentials(): Promise<Credentials | null> {
    const file = await readOptional(this.credentialsFile);
    if (!file) return null;
    if (!(await protectedStorage())) throw new Error(storageError);
    const result = await safeStorage.decryptStringAsync(file);
    return JSON.parse(result.result) as Credentials;
  }

  async status(): Promise<GmailState> {
    try {
      if (!(await protectedStorage()))
        return { available: false, email: null, error: storageError };
      return {
        available: true,
        email: (await this.credentials())?.email ?? null,
        error: null,
      };
    } catch {
      return {
        available: true,
        email: null,
        error: "Gmail credentials could not be read. Reconnect your account.",
      };
    }
  }

  connect() {
    return this.serial(async () => {
      if (!(await protectedStorage())) throw new Error(storageError);
      const previous = await this.credentials().catch(() => null);
      let client = previous?.client;
      if (!client) {
        const file = process.env.SURFACE_GMAIL_CLIENT_FILE;
        const selected =
          file ||
          (
            await dialog.showOpenDialog({
              title: "Choose Google Desktop OAuth credentials",
              properties: ["openFile"],
              filters: [{ name: "OAuth JSON", extensions: ["json"] }],
            })
          ).filePaths[0];
        if (!selected) return this.status();
        try {
          client = parseClient(await readFile(selected, "utf8"));
        } catch {
          throw new Error(
            "Choose the OAuth JSON for a Google Desktop app client.",
          );
        }
      }
      const connected = await authorize(client);
      await atomicWrite(
        this.credentialsFile,
        await safeStorage.encryptStringAsync(JSON.stringify(connected)),
      );
      return this.status();
    });
  }

  disconnect() {
    return this.serial(async () => {
      await unlink(this.credentialsFile).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        },
      );
      return this.status();
    });
  }

  draftStatus(id: string) {
    return this.serial(async () => {
      const credentials = await this.credentials();
      if (!credentials) return null;
      const raw = await readOptional(this.linksFile);
      const links = raw ? (JSON.parse(raw.toString()) as DraftMap) : {};
      const link = links[`${credentials.sub}:${id}`];
      return link?.savedRevision ?? null;
    });
  }

  save(draft: Draft, confirmedEmail: string, open: boolean, replace: boolean) {
    return this.serial(async () => {
      const credentials = await this.credentials();
      if (!credentials) throw new Error("Connect a Gmail account in Settings.");
      if (credentials.email !== confirmedEmail)
        throw new Error(
          "The Gmail account changed. Review the connected account before saving.",
        );
      if (!draft.subject.trim() || !draft.body.trim())
        throw new Error("Enter a subject and message before saving to Gmail.");
      const { accessToken } = await exchange(credentials.client, {
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
      });
      const raw = await readOptional(this.linksFile);
      const links = raw ? (JSON.parse(raw.toString()) as DraftMap) : {};
      const key = `${credentials.sub}:${draft.id}`;
      let link = links[key];
      if (link && !link.remoteId) {
        const q = new URLSearchParams({ q: `rfc822msgid:<${link.messageId}>` });
        const response = await gmailRequest(
          accessToken,
          `${draftEndpoint}?${q}`,
        );
        if ((response.drafts?.length ?? 0) > 1 || response.nextPageToken) {
          throw new Error(
            "Gmail has more than one matching draft. Keep one matching draft in Gmail, then retry.",
          );
        }
        link.remoteId = response.drafts?.[0]?.id;
        if (!link.remoteId && !replace)
          throw new Error(
            "Gmail has not confirmed the previous save. Check Gmail Drafts and retry before creating a replacement.",
          );
        if (!link.remoteId) link = undefined;
      }
      if (link?.remoteId) {
        try {
          const url = `${draftEndpoint}/${encodeURIComponent(link.remoteId)}`;
          if (link.savedRevision !== draft.updatedAt) {
            await gmailRequest(accessToken, url, "PUT", {
              message: { raw: mimeMessage(draft, link.messageId) },
            });
          } else {
            await gmailRequest(accessToken, url);
          }
        } catch (error) {
          if (!(error instanceof GmailError) || error.status !== 404)
            throw error;
          if (!replace)
            throw new Error(
              "Gmail no longer has this draft. Check Gmail before creating a replacement.",
              { cause: error },
            );
          link = undefined;
        }
      }
      if (!link) {
        link = {
          messageId: `surface.${randomBytes(16).toString("hex")}@surface.local`,
        };
        links[key] = link;
        await atomicWrite(this.linksFile, JSON.stringify(links));
        try {
          const uploaded = await gmailRequest(
            accessToken,
            draftEndpoint,
            "POST",
            { message: { raw: mimeMessage(draft, link.messageId) } },
          );
          if (!uploaded.id)
            throw new Error(
              "Gmail did not confirm the draft ID. Check Gmail Drafts and retry.",
            );
          link.remoteId = uploaded.id;
        } catch (error) {
          if (
            error instanceof GmailError &&
            [400, 401, 403, 404, 429].includes(error.status)
          ) {
            delete links[key];
            await atomicWrite(this.linksFile, JSON.stringify(links));
          }
          throw error;
        }
      }
      link.savedRevision = draft.updatedAt;
      links[key] = link;
      await atomicWrite(this.linksFile, JSON.stringify(links));
      if (open)
        await shell.openExternal(
          `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(credentials.email)}#drafts`,
        );
      return { email: credentials.email, savedRevision: draft.updatedAt };
    });
  }
}
