import {
  descriptionSummarySchema,
  type DescriptionSummary,
} from "backend/contracts";

export async function streamSummary(
  id: string,
  regenerate: boolean,
  onText: (text: string) => void,
) {
  const response = await fetch(`/api/jobs/${id}/summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ regenerate }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Could not summarise this job. Try again.",
    );
  }
  if (!response.body)
    throw new Error("The summary response was empty. Try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "",
    text = "";
  let result: DescriptionSummary | undefined;
  function line(value: string) {
    if (!value.trim()) return;
    const event = JSON.parse(value);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "text" && typeof event.text === "string") {
      text += event.text;
      onText(text);
    }
    if (event.type === "complete")
      result = descriptionSummarySchema.parse(event.summary);
  }
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      pending += decoder.decode(chunk.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const value of lines) line(value);
    }
    line(pending + decoder.decode());
    if (!result)
      throw new Error("The summary connection ended early. Try again.");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
