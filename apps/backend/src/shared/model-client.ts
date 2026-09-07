import { z } from "zod";
import { env } from "../config/env";
let activeRequests = 0;
export function modelCapacityAvailable() {
  return activeRequests < 2;
}
export async function requestModelJson<T>(
  schema: z.ZodType<T>,
  name: string,
  instructions: string,
  data: unknown,
  maxTokens: number,
) {
  if (!modelCapacityAvailable())
    throw new Error("Two AI requests are already running. Try again shortly.");
  activeRequests++;
  try {
    return await sendModelJson(schema, name, instructions, data, maxTokens);
  } finally {
    activeRequests--;
  }
}
async function sendModelJson<T>(
  schema: z.ZodType<T>,
  name: string,
  instructions: string,
  data: unknown,
  maxTokens: number,
) {
  const response = await fetch(
    `${env.OMNIROUTE_BASE_URL.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: {
        Authorization: `Bearer ${env.OMNIROUTE_API_KEY}`,
        "Content-Type": "application/json",
        "X-OmniRoute-No-Memory": "true",
      },
      body: JSON.stringify({
        model: env.OMNIROUTE_MODEL,
        stream: false,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(data) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name,
            strict: true,
            schema: z.toJSONSchema(schema, { target: "draft-7" }),
          },
        },
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `OmniRoute rejected the request (HTTP ${response.status}). The supplied information has not been shortened. Check the model configuration or context limit.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty OmniRoute response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 2000000) {
      await reader.cancel();
      throw new Error("OmniRoute response exceeds the limit.");
    }
    chunks.push(part.value);
  }
  const completion = z
    .object({
      model: z.string(),
      choices: z
        .array(z.object({ message: z.object({ content: z.string() }) }))
        .min(1),
    })
    .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  return {
    output: schema.parse(JSON.parse(completion.choices[0]!.message.content)),
    model: completion.model,
  };
}
