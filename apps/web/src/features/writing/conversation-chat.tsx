import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  Copy,
  FileText,
  LoaderCircle,
  Paperclip,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { copyToClipboard } from "@/lib/clipboard";
import { writingConversationsKey } from "@/features/writing/writing-query";

const QUICK_PROMPTS = [
  "Draft an intro email",
  "Polish this draft",
  "Write a follow-up",
];

export function ConversationChat({
  conversationId,
  initialMessages,
  draftSubject,
  draftBody,
  onUseDraft,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  draftSubject: string;
  draftBody: string;
  onUseDraft: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
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
    onError: (error) => {
      toast.error(error.message);
      void client.invalidateQueries({ queryKey: writingConversationsKey });
    },
    onFinish: () =>
      void Promise.all([
        client.invalidateQueries({
          queryKey: ["writing-messages", conversationId],
        }),
        client.invalidateQueries({ queryKey: writingConversationsKey }),
      ]),
  });
  const busy = preparing || status === "submitted" || status === "streaming";

  useEffect(() => {
    const element = transcript.current;
    if (element && followTranscript.current && messages.length) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  function resizeMessageInput(textarea: HTMLTextAreaElement) {
    textarea.style.height = "0px";
    const height = Math.min(textarea.scrollHeight, 192);
    textarea.style.height = `${Math.max(height, 56)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 192 ? "auto" : "hidden";
  }

  function setMessage(value: string) {
    setInput(value);
    if (!messageInput.current) return;
    messageInput.current.value = value;
    resizeMessageInput(messageInput.current);
  }

  async function submit() {
    const text = input.trim();
    if ((!text && !attachments.length) || busy) return;
    followTranscript.current = true;
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
      setMessage("");
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
    if (await copyToClipboard(text)) {
      toast.success(message);
    } else {
      toast.error("Could not access the clipboard.");
    }
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
      <div
        ref={transcript}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-7 sm:px-6"
        onScroll={(event) => {
          const element = event.currentTarget;
          followTranscript.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            120;
        }}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
      >
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-7">
          {!messages.length ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
              <h2 className="text-base font-semibold tracking-tight">
                What would you like to write?
              </h2>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
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
                <article key={message.id} className="group flex">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex min-h-7 items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Sparkles className="size-3.5" />
                      </span>
                      <span className="text-xs font-semibold text-foreground/90">
                        Writing assistant
                      </span>
                      <div className="ml-auto flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
                          className="h-7 gap-1.5 px-2.5 text-[11px]"
                          onClick={() => onUseDraft(content)}
                        >
                          <WandSparkles className="size-3.5" />
                          Use in draft
                        </Button>
                      </div>
                    </div>
                    <div className="max-w-[72ch] whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                      {visibleContent}
                    </div>
                  </div>
                </article>
              );
            }

            return (
              <article key={message.id} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md border border-border/60 bg-muted/65 px-4 py-3 text-sm leading-6 text-foreground sm:max-w-[72ch]">
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

      <div className="shrink-0 px-3 pb-3 pt-3 sm:px-6 sm:pb-4">
        <div className="mx-auto max-w-4xl rounded-2xl border border-border-strong/70 bg-card transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-sm">
          <Textarea
            ref={messageInput}
            value={input}
            onChange={(event) => setMessage(event.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask for a draft or edit…"
            maxLength={10000}
            aria-label="Write a message"
            className="block min-h-[56px] max-h-48 resize-none rounded-2xl border-0 bg-transparent px-3.5 py-2.5 text-sm leading-6 shadow-none focus-visible:ring-0"
          />
          {attachments.length ? (
            <div className="flex flex-wrap gap-1.5 px-2.5 pb-1.5">
              {attachments.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <FileText className="size-3 shrink-0" />
                  <span className="max-w-52 truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    aria-label={`Remove ${file.name}`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between px-2 py-1.5">
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
                size="icon"
                className="size-8 rounded-xl"
                aria-label="Attach files"
                title="Attach up to 3 PDF, TXT, MD, CSV, or JSON files"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="size-3.5" />
              </Button>
            </div>
            {busy ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void stop()}
                className="size-8 rounded-xl"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={() => void submit()}
                disabled={(!input.trim() && !attachments.length) || busy}
                aria-label="Send message"
                title="Send message"
                className="size-8 rounded-xl shadow-sm transition-transform active:scale-95"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
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
