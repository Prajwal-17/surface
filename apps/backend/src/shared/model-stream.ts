// Decode only complete JSON string characters. A chunk can end inside an escape.
export function partialSummaryText(json: string) {
  const value =
    /^\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*)/.exec(
      json,
    )?.[1];
  if (value === undefined) return "";
  return (JSON.parse(`"${value}"`) as string).replace(/[\uD800-\uDBFF]$/, "");
}

export async function readModelStream(
  body: ReadableStream<Uint8Array>,
  onJson: (json: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "",
    content = "",
    model = "",
    size = 0,
    finished = false;
  function line(value: string) {
    if (!value.startsWith("data:")) return;
    const data = value.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    if (event.error)
      throw new Error("The AI provider could not complete the response.");
    if (typeof event.model === "string") model = event.model;
    const choice = event.choices?.[0];
    if (choice?.finish_reason === "stop") finished = true;
    if (choice?.finish_reason && choice.finish_reason !== "stop")
      throw new Error(
        "The AI response was incomplete. Try again or check the model output limit.",
      );
    if (typeof choice?.delta?.content === "string") {
      content += choice.delta.content;
      onJson(content);
    }
  }
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2000000)
        throw new Error("OmniRoute response exceeds the limit.");
      pending += decoder.decode(part.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const value of lines) line(value);
    }
    line(pending + decoder.decode());
    if (!finished || !content)
      throw new Error(
        "The AI stream ended before the response was complete. Try again.",
      );
    return { content, model };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
