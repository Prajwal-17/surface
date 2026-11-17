import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
} from "ai";
import {
  descriptionSummarySchema,
  type DescriptionSummary,
} from "@surface/contracts";

type SummaryStreamData =
  | { status: "complete"; summary: DescriptionSummary }
  | { status: "error"; error: string };

export async function streamSummary(
  id: string,
  regenerate: boolean,
  onText: (text: string) => void,
  signal?: AbortSignal,
) {
  try {
    const response = await fetch(`/api/jobs/${id}/summary/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate }),
      signal,
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
    const chunks = parseJsonEventStream({
      stream: response.body,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (!chunk.success) throw chunk.error;
          controller.enqueue(chunk.value);
        },
      }),
    );
    let text = "";
    let summary: DescriptionSummary | undefined;
    let streamError: string | undefined;
    for await (const message of readUIMessageStream({ stream: chunks })) {
      const nextText = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
      if (nextText !== text) {
        text = nextText;
        onText(text);
      }
      for (const part of message.parts) {
        if (part.type !== "data-summary") continue;
        const data = part.data as SummaryStreamData;
        if (data.status === "complete") {
          summary = descriptionSummarySchema.parse(data.summary);
          streamError = undefined;
        } else {
          streamError = data.error;
        }
      }
    }
    if (streamError) throw new Error(streamError);
    if (!summary)
      throw new Error("The summary connection ended early. Try again.");
    return summary;
  } catch (error) {
    if (signal?.aborted)
      throw new Error("The summary was stopped.", { cause: error });
    throw error;
  }
}
