import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { HttpError } from "../shared/errors/http-error";

export function handleError(error: Error, context: Context) {
  if (error instanceof HttpError) {
    return context.json({ error: error.message }, error.status);
  }

  if (error instanceof HTTPException) {
    return context.json({ error: error.message }, error.status);
  }

  console.error(error);
  return context.json(
    { error: "Something went wrong while processing the request." },
    500,
  );
}
