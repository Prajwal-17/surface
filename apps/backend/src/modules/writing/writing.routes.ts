import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamText, type UIMessage } from "ai";
import { z } from "zod";
import { hasDesktopToken } from "../auth/session";
import { getWritingModel } from "../../shared/ai/model";
import {
  archiveConversation,
  createConversation,
  getConversation,
  getMessageHistory,
  listConversations,
  listMessages,
  saveMessage,
  updateConversation,
} from "./conversation.repository";
import { buildWritingInstructions } from "./writing-prompt";
import { pdfText } from "../profile/resume";
import { HttpError } from "../../shared/errors/http-error";
import {
  createWritingExample,
  createScheduledEmail,
  cancelScheduledEmail,
  claimDueScheduledEmails,
  deleteWritingExample,
  getWritingContext,
  listScheduledEmails,
  recordScheduledEmailResult,
  retryScheduledEmail,
  reorderWritingExamples,
  saveWritingGuide,
  updateWritingExample,
} from "./writing.repository";

export const writingRoutes = new Hono();

const guideSchema = z.object({ guide: z.string().max(10000) }).strict();
const exampleSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(20000),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
const conversationInputSchema = z
  .object({
    company: z.string().trim().max(300).default(""),
    recipientName: z.string().trim().max(200).default(""),
    recipientEmail: z.union([z.email().max(254), z.literal("")]).default(""),
    role: z.string().trim().max(300).default(""),
    whyNow: z.string().trim().max(5000).default(""),
    contextLink: z.union([z.url().max(2048), z.literal("")]).default(""),
    outputType: z
      .enum(["cold-email", "cover-letter", "other"])
      .default("cold-email"),
    draftSubject: z.string().max(500).default(""),
    draftBody: z.string().max(30000).default(""),
  })
  .strict();
const uiMessageSchema = z
  .object({
    id: z.string().min(1).max(128),
    role: z.enum(["user", "assistant"]),
    parts: z
      .array(
        z
          .object({
            type: z.string(),
            text: z.string().max(10000).optional(),
            filename: z.string().max(255).optional(),
            mediaType: z.string().max(100).optional(),
            url: z
              .string()
              .max(9 * 1024 * 1024)
              .optional(),
          })
          .passthrough(),
      )
      .max(30),
  })
  .passthrough();
const scheduledEmailSchema = z
  .object({
    conversationId: z.uuid(),
    recipient: z.email().max(254),
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(30000),
    scheduledAt: z.iso.datetime(),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();

writingRoutes.get("/context", async (context) =>
  context.json(await getWritingContext()),
);

writingRoutes.get("/schedule", async (context) =>
  context.json(await listScheduledEmails()),
);

writingRoutes.post(
  "/schedule",
  zValidator("json", scheduledEmailSchema),
  async (context) =>
    context.json(await createScheduledEmail(context.req.valid("json")), 201),
);

writingRoutes.post("/schedule/:id/cancel", async (context) =>
  context.json(await cancelScheduledEmail(context.req.param("id"))),
);

writingRoutes.post("/schedule/:id/retry", async (context) =>
  context.json(await retryScheduledEmail(context.req.param("id"))),
);

// These endpoints are called only by the local Electron process. The desktop
// token keeps the queue worker separate from browser-initiated send requests.
writingRoutes.post("/schedule/due", async (context) => {
  if (!hasDesktopToken(context)) {
    return context.json({ error: "Desktop scheduler access required." }, 403);
  }
  return context.json(await claimDueScheduledEmails());
});

writingRoutes.post(
  "/schedule/:id/result",
  zValidator(
    "json",
    z
      .object({
        status: z.enum(["sent", "failed", "uncertain"]),
        error: z.string().max(1000).optional(),
      })
      .strict()
      .refine(
        (value) => value.status === "sent" || Boolean(value.error?.trim()),
      ),
  ),
  async (context) => {
    if (!hasDesktopToken(context)) {
      return context.json({ error: "Desktop scheduler access required." }, 403);
    }
    const result = context.req.valid("json");
    return context.json(
      await recordScheduledEmailResult(
        context.req.param("id"),
        result.status === "sent"
          ? { status: "sent" }
          : result.status === "uncertain"
            ? { status: "uncertain", error: result.error! }
            : { status: "failed", error: result.error! },
      ),
    );
  },
);

writingRoutes.use(
  "/conversations/:id/messages",
  bodyLimit({ maxSize: 9 * 1024 * 1024 }),
);

writingRoutes.get("/conversations", async (context) =>
  context.json(await listConversations()),
);

writingRoutes.post(
  "/conversations",
  zValidator("json", conversationInputSchema),
  async (context) =>
    context.json(await createConversation(context.req.valid("json")), 201),
);

writingRoutes.get("/conversations/:id", async (context) =>
  context.json(await getConversation(context.req.param("id"))),
);

writingRoutes.patch(
  "/conversations/:id",
  zValidator("json", conversationInputSchema.partial().strict()),
  async (context) =>
    context.json(
      await updateConversation(
        context.req.param("id"),
        context.req.valid("json"),
      ),
    ),
);

writingRoutes.delete("/conversations/:id", async (context) => {
  await archiveConversation(context.req.param("id"));
  return context.json({ archived: true });
});

writingRoutes.get("/conversations/:id/messages", async (context) =>
  context.json(
    (await listMessages(context.req.param("id"))).map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text", text: message.content }],
      model: message.model,
      createdAt: message.createdAt,
    })),
  ),
);

writingRoutes.post("/conversations/:id/messages", async (context) => {
  const conversationId = context.req.param("id");
  const parsed = z
    .object({
      messages: z.array(uiMessageSchema).min(1).max(100),
      draftSubject: z.string().max(500).default(""),
      draftBody: z.string().max(30000).default(""),
    })
    .passthrough()
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: "Send a valid chat message." }, 400);
  }
  const latest = parsed.data.messages.at(-1);
  const text =
    latest?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";
  const fileParts = latest?.parts.filter((part) => part.type === "file") ?? [];
  if (
    latest?.role !== "user" ||
    (!text && !fileParts.length) ||
    text.length > 10000 ||
    latest.parts.some((part) => part.type !== "text" && part.type !== "file")
  ) {
    return context.json(
      { error: "Enter a message or attach a supported file." },
      400,
    );
  }

  if (fileParts.length > 3) {
    return context.json({ error: "Attach up to 3 files at a time." }, 400);
  }
  const attachments: Array<{ filename: string; text: string }> = [];
  let totalBytes = 0;
  let totalText = 0;
  for (const part of fileParts) {
    if (!part.filename || !part.url) {
      return context.json(
        { error: "One of the attached files is incomplete." },
        400,
      );
    }
    const filename = safeAttachmentName(part.filename);
    const extracted = await extractWritingAttachment({
      filename,
      url: part.url,
    });
    totalBytes += extracted.bytes;
    totalText += extracted.text.length;
    if (totalBytes > 6 * 1024 * 1024) {
      return context.json(
        { error: "Attached files must total 6 MB or less." },
        400,
      );
    }
    if (totalText > 60000) {
      return context.json(
        { error: "The attached files contain too much text." },
        400,
      );
    }
    attachments.push({ filename, text: extracted.text });
  }
  const messageContent = [
    text,
    ...attachments.map(
      ({ filename, text: fileText }) =>
        `\n\n[Attached: ${filename}]\n${fileText}`,
    ),
  ]
    .filter(Boolean)
    .join("")
    .trim();

  const conversation = await getConversation(conversationId);
  const { model, settings } = getWritingModel(conversationId);
  const [instructions, history] = await Promise.all([
    buildWritingInstructions(conversation, {
      subject: parsed.data.draftSubject,
      body: parsed.data.draftBody,
    }),
    getMessageHistory(conversationId),
  ]);
  await saveMessage({ conversationId, role: "user", content: messageContent });

  const result = streamText({
    model,
    system: instructions,
    messages: [
      ...history.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
      { role: "user", content: messageContent },
    ],
    abortSignal: context.req.raw.signal,
    maxOutputTokens: 1800,
    providerOptions:
      settings.reasoning === "default"
        ? undefined
        : { [settings.provider]: { reasoningEffort: settings.reasoning } },
  });
  return result.toUIMessageStreamResponse({
    originalMessages: parsed.data.messages as UIMessage[],
    onFinish: async ({ responseMessage, isAborted }) => {
      if (isAborted) return;
      const content = responseMessage.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
      if (!content) return;
      await saveMessage({
        conversationId,
        role: "assistant",
        content,
        model: settings.model,
      });
    },
    onError: () => "The assistant could not finish this response. Try again.",
  });
});

writingRoutes.put("/guide", zValidator("json", guideSchema), async (context) =>
  context.json(await saveWritingGuide(context.req.valid("json").guide)),
);

writingRoutes.post(
  "/examples",
  zValidator("json", exampleSchema),
  async (context) =>
    context.json(await createWritingExample(context.req.valid("json")), 201),
);

writingRoutes.put(
  "/examples/order",
  zValidator(
    "json",
    z.object({ ids: z.array(z.string().uuid()).max(100) }).strict(),
  ),
  async (context) =>
    context.json(await reorderWritingExamples(context.req.valid("json").ids)),
);

writingRoutes.put(
  "/examples/:id",
  zValidator("json", exampleSchema),
  async (context) =>
    context.json(
      await updateWritingExample(
        context.req.param("id"),
        context.req.valid("json"),
      ),
    ),
);

writingRoutes.delete("/examples/:id", async (context) => {
  await deleteWritingExample(context.req.param("id"));
  return context.json({ deleted: true });
});

const MAX_WRITING_FILE_BYTES = 4 * 1024 * 1024;

function safeAttachmentName(name: string) {
  return (
    name
      .replaceAll("\\", "/")
      .split("/")
      .at(-1)
      ?.split("")
      .map((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 || "[]".includes(character)
          ? "_"
          : character;
      })
      .join("")
      .trim()
      .slice(0, 160) || "attachment"
  );
}

async function extractWritingAttachment(input: {
  filename: string;
  url: string;
}) {
  const match = /^data:([^,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.url);
  if (!match || !match[2]) {
    throw new HttpError(400, "Could not read an attached file.");
  }
  if (match[2].length > Math.ceil((MAX_WRITING_FILE_BYTES * 4) / 3) + 4) {
    throw new HttpError(400, "Each attached file must be 4 MB or smaller.");
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_WRITING_FILE_BYTES) {
    throw new HttpError(400, "Each attached file must be 4 MB or smaller.");
  }
  if (
    bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")
  ) {
    throw new HttpError(400, "Could not read an attached file.");
  }

  const extension = input.filename.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    const pdf = await pdfText(
      new File([bytes], input.filename, { type: "application/pdf" }),
    );
    const text = pdf.trim();
    if (!text) {
      throw new HttpError(
        400,
        "This PDF has no selectable text. Try a text-based PDF or paste its contents.",
      );
    }
    return { bytes: bytes.length, text };
  }
  if (!["txt", "md", "csv", "json"].includes(extension ?? "")) {
    throw new HttpError(400, "Attach a PDF, TXT, MD, CSV, or JSON file.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "")
      .trim();
  } catch {
    throw new HttpError(400, "Text attachments must use UTF-8 encoding.");
  }
  const controlCharacterCount = [...text].filter((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  }).length;
  if (controlCharacterCount > Math.max(2, text.length * 0.01)) {
    throw new HttpError(400, "Choose a text-based file.");
  }
  if (!text) throw new HttpError(400, "That attachment does not contain text.");
  if (text.length > 60000) {
    throw new HttpError(
      400,
      "Text attachments must contain 60,000 characters or less.",
    );
  }
  return { bytes: bytes.length, text };
}
