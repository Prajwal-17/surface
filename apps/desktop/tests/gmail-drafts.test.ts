import { afterEach, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("electron", () => ({
  dialog: {},
  shell: { openExternal: mock(async () => {}) },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    decryptStringAsync: async (data: Buffer) => ({ result: data.toString() }),
  },
}));

const { GmailConnection } = await import("../src/gmail");
const originalFetch = globalThis.fetch;
const paths: string[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(
    paths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function profile() {
  const directory = await mkdtemp(join(tmpdir(), "surface-gmail-test-"));
  paths.push(directory);
  await writeFile(
    join(directory, "gmail-credentials"),
    JSON.stringify({
      client: { id: "fixture", secret: "fixture" },
      sub: "account-1",
      email: "test@example.test",
      refreshToken: "fixture",
    }),
  );
  return directory;
}

const draft = {
  id: "d223ba13-6e5b-4bd1-995c-eb20540cc273",
  subject: "Product engineering at Northstar",
  to: "recipient@example.test",
  body: "Hello,\n\nCould we talk about the product engineering role?",
  updatedAt: "2026-01-01",
};

test("reconciles a committed Gmail draft after a timed-out first save", async () => {
  const directory = await profile();
  const methods: string[] = [];
  let messageId = "";
  globalThis.fetch = (async (input, options) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com")
      return Response.json({ access_token: "example" });
    const method = options?.method ?? "GET";
    methods.push(method);
    if (method === "POST") {
      const raw = JSON.parse(String(options?.body)).message.raw;
      const mime = Buffer.from(raw, "base64url").toString();
      messageId = /^Message-ID: <([^>]+)>/m.exec(mime)?.[1] ?? "";
      throw new DOMException("timeout", "TimeoutError");
    }
    if (url.searchParams.has("q")) {
      expect(url.searchParams.get("q")).toBe(`rfc822msgid:<${messageId}>`);
      return Response.json({ drafts: [{ id: "remote-id" }] });
    }
    expect(url.pathname).toEndWith("/remote-id");
    return Response.json({ id: "remote-id" });
  }) as typeof fetch;

  await expect(
    new GmailConnection(directory).save(
      draft,
      "test@example.test",
      false,
      false,
    ),
  ).rejects.toThrow("timeout");
  const restarted = new GmailConnection(directory);
  const revised = { ...draft, body: "Updated", updatedAt: "2026-01-02" };
  await restarted.save(revised, "test@example.test", false, false);
  await restarted.save(revised, "test@example.test", false, false);
  expect(methods).toEqual(["POST", "GET", "PUT", "GET"]);
  expect(await restarted.draftStatus(draft.id)).toBe(revised.updatedAt);
  const links = await readFile(join(directory, "gmail-drafts.json"), "utf8");
  expect(links).toContain("remote-id");
  expect(links).not.toContain("fixture");
});

test("requires confirmation of the current Gmail account", async () => {
  const directory = await profile();
  const network = mock(async () => Response.json({}));
  globalThis.fetch = network as unknown as typeof fetch;
  await expect(
    new GmailConnection(directory).save(
      draft,
      "other@example.test",
      false,
      false,
    ),
  ).rejects.toThrow("account changed");
  expect(network).not.toHaveBeenCalled();
});
