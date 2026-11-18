import { useRef, useState, type KeyboardEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  MessagesSquare,
  Paperclip,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const QUICK_PROMPTS = [
  "Draft a concise intro email",
  "Make this warmer",
  "Tighten the wording",
];

export function ConversationChat({
  conversationId,
  conversationTitle,
  initialMessages,
  draftSubject,
  draftBody,
  onUseDraft,
}: {
  conversationId: string;
  conversationTitle: string;
  initialMessages: UIMessage[];
  draftSubject: string;
  draftBody: string;
  onUseDraft: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const { messages, sendMessage, status, stop } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/writing/conversations/${conversationId}/messages`,
      prepareSendMessagesRequest: ({ messages: requestMessages, body }) => ({
        body: {
          ...body,
          draftSubject,
          draftBody,
          messages: requestMessages.map((message, index) =>
            index === requestMessages.length - 1
              ? message
              : {
                  ...message,
                  parts: message.parts.map((part) =>
                    part.type === "file"
                      ? {
                          type: "file",
                          filename: part.filename,
                          mediaType: part.mediaType,
                        }
                      : part,
                  ),
                },
          ),
        },
      }),
    }),
    onError: (error) => toast.error(error.message),
    onFinish: () =>
      void client.invalidateQueries({
        queryKey: ["writing-messages", conversationId],
      }),
  });
  const busy = preparing || status === "submitted" || status === "streaming";
  const transcript = formatTranscript(messages);

  async function submit() {
    const text = input.trim();
    if ((!text && !attachments.length) || busy) return;
    setPreparing(true);
    try {
      const files = await Promise.all(
        attachments.map(async (file) => ({
          type: "file" as const,
          mediaType: mediaTypeFor(file.name),
          filename: file.name,
          url: await readAsDataUrl(file),
        })),
      );
      setInput("");
      setAttachments([]);
      setPreparing(false);
      void sendMessage({ text, files });
    } catch {
      setPreparing(false);
      toast.error("Could not read that file. Try attaching it again.");
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const accepted = [...attachments];
    let rejected = false;
    for (const file of Array.from(fileList)) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const validType = ["pdf", "txt", "md", "csv", "json"].includes(
        extension ?? "",
      );
      const totalSize = accepted.reduce((total, item) => total + item.size, 0);
      if (
        !validType ||
        file.size > 4 * 1024 * 1024 ||
        totalSize + file.size > 6 * 1024 * 1024 ||
        accepted.length >= 3
      ) {
        rejected = true;
        continue;
      }
      accepted.push(file);
    }
    if (rejected) {
      toast.error("Attach up to 3 PDF or text files, 4 MB each (6 MB total).");
    }
    setAttachments(accepted);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function copyText(text: string, message = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Could not access the clipboard.");
    }
  }

  function downloadTranscript() {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(conversationTitle)}-transcript.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-5 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MessagesSquare className="size-3.5" />
          <span>
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2.5 text-xs"
          onClick={() => setTranscriptOpen(true)}
          disabled={!messages.length}
        >
          <FileText className="size-3.5" />
          Transcript
        </Button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-7 sm:px-6"
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-7">
          {!messages.length ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm">
                <Sparkles className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold tracking-tight">
                What do you want to write?
              </h2>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => {
            const content = messageText(message);
            const visibleContent = visibleMessageText(content);
            const filenames = attachmentNames(message, content);
            if (!visibleContent && !filenames.length) return null;

            if (message.role === "assistant") {
              return (
                <article key={message.id} className="group flex gap-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-foreground/90">
                        Writing assistant
                      </span>
                      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            void copyText(content, "Response copied")
                          }
                          aria-label="Copy response"
                          title="Copy response"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2.5 text-[11px]"
                          onClick={() => onUseDraft(content)}
                        >
                          <WandSparkles className="size-3.5" />
                          Use in draft
                        </Button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                      {visibleContent}
                    </div>
                  </div>
                </article>
              );
            }

            return (
              <article key={message.id} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md border border-border/60 bg-muted/65 px-4 py-3.5 text-sm leading-6 text-foreground sm:max-w-[82%]">
                  {visibleContent ? (
                    <p className="whitespace-pre-wrap">{visibleContent}</p>
                  ) : null}
                  {filenames.length ? (
                    <div
                      className={
                        visibleContent
                          ? "mt-3 flex flex-wrap gap-2"
                          : "flex flex-wrap gap-2"
                      }
                    >
                      {filenames.map((name) => (
                        <span
                          key={name}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-background/65 px-2.5 py-1.5 text-xs text-muted-foreground"
                        >
                          <FileText className="size-3.5 shrink-0" />
                          <span className="max-w-52 truncate">{name}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {busy ? (
            <div
              className="flex items-center gap-2 pl-11 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="size-3.5 animate-spin" />
              Drafting
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background/90 px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border-strong/70 bg-card shadow-lg shadow-black/10 transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-md focus-within:shadow-primary/5">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message the writing assistant…"
            maxLength={10000}
            aria-label="Message the writing assistant"
            className="min-h-[92px] resize-y border-0 bg-transparent px-4 py-3.5 text-sm leading-6 shadow-none focus-visible:ring-0"
          />
          {attachments.length ? (
            <div className="flex flex-wrap gap-2 px-3 pb-2.5">
              {attachments.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground"
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="max-w-52 truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    aria-label={`Remove ${file.name}`}
                    className="rounded p-0.5 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,.csv,.json"
                multiple
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => addFiles(event.currentTarget.files)}
                aria-label="Choose files to attach"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                aria-label="Attach files"
                title="Attach up to 3 PDF, TXT, MD, CSV, or JSON files"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="size-3.5" />
                <span className="hidden sm:inline">Attach</span>
              </Button>
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                Return to send · Shift+Return for a new line
              </span>
            </div>
            {busy ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void stop()}
                className="h-9 rounded-full px-3"
              >
                <Square className="size-3.5 fill-current" />
                Stop
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={() => void submit()}
                disabled={(!input.trim() && !attachments.length) || busy}
                aria-label="Send message"
                title="Send message"
                className="size-9 rounded-full"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <DialogContent className="grid h-[min(82vh,760px)] max-h-[82vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12">
            <DialogTitle>Transcript</DialogTitle>
            <DialogDescription className="truncate">
              {conversationTitle}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-6 overflow-y-auto p-5">
            {messages.map((message) => {
              const content = messageText(message);
              const visibleContent = visibleMessageText(content);
              const filenames = attachmentNames(message, content);
              if (!visibleContent && !filenames.length) return null;
              return (
                <article key={message.id} className="flex gap-3">
                  <span className="w-16 shrink-0 pt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {message.role === "assistant" ? "Assistant" : "You"}
                  </span>
                  <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6">
                    {visibleContent}
                    {filenames.length ? (
                      <div
                        className={
                          visibleContent ? "mt-2 space-y-1" : "space-y-1"
                        }
                      >
                        {filenames.map((filename) => (
                          <p
                            key={filename}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <FileText className="size-3.5" /> {filename}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyText(transcript, "Transcript copied")}
              disabled={!transcript}
            >
              <Copy className="size-3.5" /> Copy transcript
            </Button>
            <Button
              type="button"
              onClick={downloadTranscript}
              disabled={!transcript}
            >
              <Download className="size-3.5" /> Download .txt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function visibleMessageText(content: string) {
  return content.split(/\n\n\[Attached: [^\]]+\]\n/)[0]?.trimEnd() ?? "";
}

function attachmentNames(message: UIMessage, content: string) {
  const savedNames = [...content.matchAll(/\n\n\[Attached: ([^\]]+)\]\n/g)].map(
    (match) => match[1] ?? "",
  );
  const liveNames = message.parts.flatMap((part) =>
    part.type === "file" && part.filename ? [part.filename] : [],
  );
  return [...new Set([...savedNames, ...liveNames].filter(Boolean))];
}

function formatTranscript(messages: UIMessage[]) {
  return messages
    .map((message) => {
      const content = visibleMessageText(messageText(message));
      const filenames = attachmentNames(message, messageText(message));
      const body = [
        content,
        ...filenames.map((filename) => `[Attached: ${filename}]`),
      ]
        .filter(Boolean)
        .join("\n");
      if (!body) return "";
      return `${message.role === "assistant" ? "Assistant" : "You"}\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n────────────────────────────────────────\n\n");
}

function safeFilename(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "writing-conversation"
  );
}

function mediaTypeFor(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension === "pdf"
    ? "application/pdf"
    : extension === "csv"
      ? "text/csv"
      : extension === "json"
        ? "application/json"
        : extension === "md"
          ? "text/markdown"
          : "text/plain";
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Unable to read file")),
      { once: true },
    );
    reader.addEventListener(
      "error",
      () => reject(reader.error ?? new Error("Unable to read file")),
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}
