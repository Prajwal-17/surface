import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Context } from "hono";
import {
  deleteCookie,
  getCookie,
  getSignedCookie,
  setSignedCookie,
} from "hono/cookie";
import { z } from "zod";
import { env } from "../../config/env";

const cookieName = "surface_session";
const desktopCookieName = "surface_desktop_token";
export const sessionDurationSeconds = 60 * 60 * 24 * 7;
let cachedSecret: string | undefined;

interface SessionPayload {
  email: string;
  expiresAt: number;
}

function getSigningSecret(): string {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (cachedSecret) return cachedSecret;

  const secretPath = join(env.DATA_DIR, ".surface-auth-secret");
  mkdirSync(dirname(secretPath), { recursive: true });

  if (existsSync(secretPath)) {
    cachedSecret = readStoredSecret(secretPath);
    return cachedSecret;
  }

  const generatedSecret = randomBytes(32).toString("base64url");
  try {
    writeFileSync(secretPath, generatedSecret, { flag: "wx", mode: 0o600 });
    cachedSecret = generatedSecret;
  } catch (error) {
    if (!isFileAlreadyExistsError(error)) throw error;
    cachedSecret = readStoredSecret(secretPath);
  }

  return cachedSecret;
}

function readStoredSecret(secretPath: string): string {
  const secret = readFileSync(secretPath, "utf8").trim();
  if (secret.length < 32) {
    throw new Error(`The session signing key at ${secretPath} is invalid.`);
  }
  return secret;
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

const cookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "Strict" as const,
  secure: env.AUTH_COOKIE_SECURE,
};

export function hasDesktopToken(context: Context): boolean {
  const expected = env.SURFACE_DESKTOP_TOKEN;
  if (!expected) return false;
  const header = context.req.header("x-surface-desktop-token");
  const authorization = context.req.header("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  const supplied =
    header ?? bearer ?? getCookie(context, desktopCookieName) ?? "";
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function readSession(
  context: Context,
): Promise<SessionPayload | null> {
  if (hasDesktopToken(context)) {
    return { email: "desktop@localhost", expiresAt: Date.now() + 60_000 };
  }
  const value = await getSignedCookie(context, getSigningSecret(), cookieName);
  if (typeof value !== "string") return null;

  try {
    const payload: unknown = JSON.parse(value);
    if (!isSessionPayload(payload) || payload.expiresAt <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(
  context: Context,
  email: string,
): Promise<void> {
  const expiresAt = Date.now() + sessionDurationSeconds * 1000;
  const payload: SessionPayload = { email, expiresAt };
  await setSignedCookie(
    context,
    cookieName,
    JSON.stringify(payload),
    getSigningSecret(),
    {
      ...cookieOptions,
      maxAge: sessionDurationSeconds,
      expires: new Date(expiresAt),
    },
  );
}

export function clearSession(context: Context): void {
  deleteCookie(context, cookieName, cookieOptions);
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    z.email().max(254).safeParse(payload.email).success &&
    typeof payload.expiresAt === "number" &&
    Number.isFinite(payload.expiresAt)
  );
}
