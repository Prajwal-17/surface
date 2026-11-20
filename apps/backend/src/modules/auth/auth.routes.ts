import { Hono } from "hono";
import { z } from "zod";
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

  await createSession(context, parsedEmail.data);
  return context.json({ authenticated: true, email: parsedEmail.data });
});

authRoutes.post("/logout", (context) => {
  clearSession(context);
  return context.json({ authenticated: false });
});
