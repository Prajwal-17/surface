import { Hono } from "hono";
import { z } from "zod";
import { env } from "../../config/env";
import { findProfile } from "../profile/profile.repository";
import { clearSession, createSession, readSession } from "./session";

export const authRoutes = new Hono();

authRoutes.get("/session", async (context) => {
  const session = await readSession(context);
  if (!session) return context.json({ authenticated: false });
  return context.json({ authenticated: true, email: session.email });
});

authRoutes.post("/login", async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return context.json({ error: "Enter a valid email address." }, 400);
  }

  const emailInput =
    typeof body === "object" && body !== null && "email" in body
      ? body.email
      : undefined;
  const parsedEmail = z
    .email()
    .max(254)
    .safeParse(
      typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "",
    );
  if (!parsedEmail.success) {
    return context.json({ error: "Enter a valid email address." }, 400);
  }

  const profileEmail = (await findProfile())?.context.details?.email
    ?.trim()
    .toLowerCase();
  const allowedEmail = env.AUTH_EMAIL ?? (profileEmail || undefined);

  if (!allowedEmail && env.APP_ENV !== "development") {
    return context.json(
      {
        error:
          "Login is not configured. Set AUTH_EMAIL or add an email to the saved profile.",
      },
      503,
    );
  }

  if (allowedEmail && parsedEmail.data !== allowedEmail) {
    return context.json(
      { error: "That email does not match this workspace." },
      401,
    );
  }

  await createSession(context, parsedEmail.data);
  return context.json({ authenticated: true, email: parsedEmail.data });
});

authRoutes.post("/logout", (context) => {
  clearSession(context);
  return context.json({ authenticated: false });
});
