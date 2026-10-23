import { env } from "../../config/env";
import { withModelSlot } from "../../shared/model-client";
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

// Research has its own decoder: a tool-call finish is valid here, unlike a JSON summary.
export async function decodeResearchResponse(
  response: Response,
  onText: (text: string) => void | Promise<void>,
) {
  let content = "",
    model = "",
    finish = "";
  const calls = new Map<number, ToolCall>();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const raw = await boundedBody(response);
    const body = JSON.parse(raw);
    if (body.error)
      throw new Error("OmniRoute could not complete the research request.");
    const choice = body.choices?.[0];
    if (!choice?.message)
      throw new Error("OmniRoute returned no research message.");
    content = choice.message.content ?? "";
    model = body.model ?? env.OMNIROUTE_MODEL;
    finish = choice.finish_reason;
    for (const [i, call] of (choice.message.tool_calls ?? []).entries())
      calls.set(i, call);
    if (content) await onText(content);
  } else {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let pending = "",
      size = 0;
    const line = async (value: string) => {
      if (!value.startsWith("data:")) return;
      const data = value.slice(5).trim();
      if (!data || data === "[DONE]") return;
      const event = JSON.parse(data);
      if (event.error)
        throw new Error("OmniRoute could not complete the research request.");
      model = event.model || model;
      const choice = event.choices?.[0];
      if (!choice) return;
      if (choice.finish_reason) finish = choice.finish_reason;
      if (typeof choice.delta?.content === "string") {
        content += choice.delta.content;
        await onText(content);
      }
      for (const delta of choice.delta?.tool_calls ?? []) {
        if (!Number.isInteger(delta.index))
          throw new Error("Invalid tool-call index.");
        const call = calls.get(delta.index) ?? {
          id: "",
          type: "function",
          function: { name: "", arguments: "" },
        };
        call.id += delta.id ?? "";
        call.function.name += delta.function?.name ?? "";
        call.function.arguments += delta.function?.arguments ?? "";
        calls.set(delta.index, call);
      }
    };
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2_000_000)
          throw new Error("Research response exceeds the transport limit.");
        pending += decoder.decode(part.value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop()!;
        for (const value of lines) await line(value);
      }
      await line(pending + decoder.decode());
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  if (!["stop", "tool_calls"].includes(finish))
    throw new Error(
      "The research response was incomplete. Check the configured model's output/context support and retry.",
    );
  if (finish === "tool_calls" && !calls.size)
    throw new Error("OmniRoute returned an empty tool call.");
  for (const call of calls.values()) {
    if (
      !call.id ||
      call.type !== "function" ||
      !call.function?.name ||
      typeof call.function.arguments !== "string"
    )
      throw new Error(
        "OmniRoute returned an invalid function call. Select a model with tool support.",
      );
  }
  if (!content.trim() && !calls.size)
    throw new Error("OmniRoute returned an empty research answer.");
  return {
    message: {
      role: "assistant" as const,
      content: content || null,
      ...(calls.size ? { tool_calls: [...calls.values()] } : {}),
    },
    model: model || env.OMNIROUTE_MODEL,
  };
}
async function boundedBody(response: Response) {
  const reader = response.body!.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2_000_000)
        throw new Error("Research response exceeds the transport limit.");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(parts).toString("utf8");
}
export async function researchModel(
  messages: ModelMessage[],
  tools: ToolDefinition[],
  signal: AbortSignal,
  onText: (text: string) => void | Promise<void>,
) {
  return await withModelSlot(async () => {
    const response = await fetch(
      `${env.OMNIROUTE_BASE_URL.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
        headers: {
          Authorization: `Bearer ${env.OMNIROUTE_API_KEY}`,
          "Content-Type": "application/json",
          "X-OmniRoute-No-Memory": "true",
        },
        body: JSON.stringify({
          model: env.OMNIROUTE_MODEL,
          stream: true,
          max_tokens: 16000,
          messages,
          ...(tools.length ? { tools, tool_choice: "auto" } : {}),
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `OmniRoute rejected research (HTTP ${response.status}). Check the configured model supports function tools and the supplied context size.`,
      );
    return await decodeResearchResponse(response, onText);
  });
}
