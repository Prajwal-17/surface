import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Archive,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  FileText,
  Mail,
  MessagesSquare,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { Link } from "react-router";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { ConversationChat } from "@/features/writing/conversation-chat";
import {
  type WritingConversation,
  type WritingScheduledEmail,
  writingConversationsKey,
  writingScheduleKey,
  useWritingContext,
  useWritingConversations,
  useWritingMessages,
  useWritingSchedule,
} from "@/features/writing/writing-query";

const blankConversation: WritingConversation = {
  id: "",
  title: "Writing assistant",
  company: "",
  recipientName: "",
  recipientEmail: "",
  role: "",
  whyNow: "",
  contextLink: "",
  outputType: "cold-email",
  draftSubject: "",
  draftBody: "",
  draftUpdatedAt: null,
  model: null,
  archived: false,
  createdAt: "",
  updatedAt: "",
};

const emptyConversations: WritingConversation[] = [];

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function defaultScheduleTime() {
  return localDateTimeValue(new Date(Date.now() + 60 * 60_000));
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function scheduledStatusLabel(status: WritingScheduledEmail["status"]) {
  switch (status) {
    case "processing":
      return "Sending";
    case "sent":
      return "Sent";
    case "failed":
      return "Needs attention";
    case "uncertain":
      return "Check Gmail";
    case "cancelled":
      return "Cancelled";
    default:
      return "Scheduled";
  }
}

export function Component() {
  const client = useQueryClient();
  const conversationsQuery = useWritingConversations();
  const conversations = conversationsQuery.data ?? emptyConversations;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorByConversation, setEditorByConversation] = useState<
    Record<
      string,
      { draft: string; recipientEmail: string; subject: string; saved: boolean }
    >
  >({});
  const [filter, setFilter] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const writingContext = useWritingContext();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState(defaultScheduleTime);
  const [scheduleMin, setScheduleMin] = useState("");
  const desktop = window.surfaceDesktop;
  const gmailStatus = useQuery({
    queryKey: ["gmail-status"],
    enabled: Boolean(desktop),
    queryFn: () => desktop!.gmailStatus(),
  });
  const aiStatus = useQuery({
    queryKey: ["desktop-ai-status"],
    queryFn: () =>
      apiClient<{ aiConfigured: boolean; aiModel: string }>(
        "/api/desktop/status",
      ),
  });
  const appInfo = useQuery({
    queryKey: ["desktop-app-info"],
    enabled: Boolean(desktop),
    queryFn: () => desktop!.appInfo(),
  });
  const development = appInfo.data?.channel === "development";
  const schedule = useWritingSchedule();
  const selectedId = activeId ?? conversations[0]?.id ?? null;
  const active =
    conversations.find((thread) => thread.id === selectedId) ??
    blankConversation;
  const editor = editorByConversation[active.id] ?? {
    draft: active.draftBody,
    recipientEmail: active.recipientEmail,
    subject: active.draftSubject,
    saved: Boolean(active.draftUpdatedAt),
  };
  const { draft, recipientEmail, subject, saved } = editor;
  const messagesQuery = useWritingMessages(active.id || null);

  function updateEditor(values: Partial<typeof editor>) {
    if (!active.id) return;
    setEditorByConversation((current) => ({
      ...current,
      [active.id]: { ...editor, ...values },
    }));
  }
  const createConversation = useMutation({
    mutationFn: () =>
      apiClient<WritingConversation>("/api/writing/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async (conversation) => {
      await client.invalidateQueries({ queryKey: writingConversationsKey });
      setActiveId(conversation.id);
    },
    onError: (error) => toast.error(error.message),
  });
  const updateConversation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Partial<WritingConversation>;
    }) =>
      apiClient<WritingConversation>(`/api/writing/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingConversationsKey });
    },
    onError: (error) => toast.error(error.message),
  });
  const archiveConversation = useMutation({
    mutationFn: (id: string) =>
      apiClient<{ archived: boolean }>(`/api/writing/conversations/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingConversationsKey });
      setActiveId(null);
      toast.success("Conversation archived");
    },
    onError: (error) => toast.error(error.message),
  });
  const createGmailDraft = useMutation({
    mutationFn: async () => {
      const email = gmailStatus.data?.email;
      if (!desktop || !email || !active.id) {
        throw new Error("Connect Gmail before creating a draft.");
      }
      return desktop.saveGmailDraft(
        {
          id: active.id,
          to: recipientEmail,
          subject,
          body: draft,
          updatedAt: new Date().toISOString(),
        },
        email,
      );
    },
    onSuccess: ({ email }) => {
      setReviewOpen(false);
      toast.success(`Gmail draft saved for ${email}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const deliveryRecipient = development
    ? (gmailStatus.data?.email ?? "")
    : recipientEmail.trim();
  const scheduleEmail = useMutation({
    mutationFn: () => {
      if (!active.id || !gmailStatus.data?.email || !desktop) {
        throw new Error("Connect Gmail before scheduling a message.");
      }
      const scheduledAt = new Date(scheduleLocal);
      if (!Number.isFinite(scheduledAt.getTime())) {
        throw new Error("Choose a valid date and time.");
      }
      return apiClient<WritingScheduledEmail>("/api/writing/schedule", {
        method: "POST",
        body: JSON.stringify({
          conversationId: active.id,
          recipient: deliveryRecipient,
          subject,
          body: draft,
          scheduledAt: scheduledAt.toISOString(),
          timezone: localTimezone(),
        }),
      });
    },
    onSuccess: async () => {
      setScheduleOpen(false);
      setReviewOpen(false);
      await client.invalidateQueries({ queryKey: writingScheduleKey });
      toast.success("Email scheduled");
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelScheduledEmail = useMutation({
    mutationFn: (id: string) =>
      apiClient<{ cancelled: boolean }>(
        `/api/writing/schedule/${encodeURIComponent(id)}/cancel`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingScheduleKey });
      toast.success("Scheduled email cancelled");
    },
    onError: (error) => toast.error(error.message),
  });
  const retryScheduledEmail = useMutation({
    mutationFn: (id: string) =>
      apiClient<{ queued: boolean }>(
        `/api/writing/schedule/${encodeURIComponent(id)}/retry`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingScheduleKey });
      toast.success("Email queued to retry in one minute");
    },
    onError: (error) => toast.error(error.message),
  });
  const visibleThreads = useMemo(
    () =>
      conversations.filter((thread) =>
        `${thread.company} ${thread.recipientName} ${thread.role}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [conversations, filter],
  );

  function selectThread(id: string) {
    setActiveId(id);
  }
  function newThread() {
    createConversation.mutate();
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Draft copied to clipboard");
    } catch {
      toast.error("Could not access the clipboard");
    }
  }
  function saveDraft() {
    if (!active.id) return;
    updateEditor({ saved: false });
    updateConversation.mutate(
      {
        id: active.id,
        values: { draftBody: draft, draftSubject: subject, recipientEmail },
      },
      {
        onSuccess: () => {
          updateEditor({ saved: true });
          toast.success("Draft saved");
        },
      },
    );
  }

  function useAssistantDraft(text: string) {
    const parsed = parseAssistantDraft(text);
    updateEditor({
      draft: parsed.body,
      ...(parsed.subject ? { subject: parsed.subject } : {}),
      saved: false,
    });
    toast.success(
      parsed.subject
        ? "Subject and message added to the draft"
        : "Assistant response added to the draft",
    );
  }

  return (
    <main className="writing-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <PenLine className="size-4 text-brand" />
          <span className="hidden font-semibold sm:inline">Writing</span>
          <span className="hidden text-muted-foreground sm:inline">/</span>
          <span className="truncate font-medium text-foreground/80">
            {active.company || active.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setConversationsOpen(true)}
            aria-label="Browse conversations"
            title="Browse conversations"
          >
            <MessagesSquare />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 xl:hidden"
            onClick={() => setDraftOpen(true)}
            disabled={!active.id}
          >
            <Mail className="size-3.5" />
            <span className="hidden sm:inline">Edit draft</span>
          </Button>
          <Link
            to="/settings"
            title={
              aiStatus.data?.aiConfigured
                ? aiStatus.data.aiModel
                : "Connect an AI provider"
            }
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:flex ${aiStatus.data?.aiConfigured ? "border-success/20 bg-success/5 text-success hover:bg-success/10" : "border-warning/20 bg-warning/5 text-warning hover:bg-warning/10"}`}
          >
            <span
              className={`size-1.5 rounded-full ${aiStatus.data?.aiConfigured ? "bg-success" : "bg-warning"}`}
            />
            {aiStatus.data?.aiConfigured ? "AI ready" : "AI not connected"}{" "}
            <ArrowUpRight className="size-3" />
          </Link>
          {active.id ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                window.confirm("Archive this opportunity conversation?") &&
                archiveConversation.mutate(active.id)
              }
              aria-label="Archive conversation"
              title="Archive conversation"
              disabled={archiveConversation.isPending}
            >
              <Archive />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(370px,0.92fr)_minmax(410px,1.08fr)]">
        <aside className="hidden min-h-0 flex-col border-r border-border md:flex">
          <div className="space-y-3 p-3">
            <Button
              className="w-full justify-center"
              onClick={newThread}
              disabled={createConversation.isPending}
            >
              <Plus /> New conversation
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find an opportunity"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center justify-between px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Recent conversations</span>
            </div>
          </div>
          <nav
            aria-label="Writing conversations"
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3"
          >
            {visibleThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => selectThread(thread.id)}
                className={`group flex w-full gap-2.5 rounded-lg p-2.5 text-left transition-colors ${selectedId === thread.id ? "bg-selected" : "hover:bg-hover"}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {(thread.company || thread.recipientName || thread.title)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {thread.company || thread.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(thread.updatedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {[thread.role, thread.recipientName]
                      .filter(Boolean)
                      .join(" · ") || "Opportunity details needed"}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">
                    {thread.whyNow || "Start a conversation to draft outreach…"}
                  </span>
                </span>
              </button>
            ))}
            {visibleThreads.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No matching conversations
              </p>
            )}
          </nav>
          <div className="border-t border-border p-3">
            <Link
              to="/writing/profile"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-hover"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-muted">
                <UserRound className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Your writing profile</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Profile and style preferences
                </span>
              </span>
              <ArrowUpRight className="size-3.5 text-muted-foreground" />
            </Link>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                {(active.company || active.recipientName || "W")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">
                  {active.company || active.title}
                </h1>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[active.recipientName, active.role]
                    .filter(Boolean)
                    .join(" · ") || "Add opportunity details"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-4 py-2.5">
            {(
              [
                ["Company", "company", active.company],
                ["Recipient", "recipientName", active.recipientName],
                ["Role", "role", active.role],
              ] as const
            ).map(([label, field, value]) => (
              <label
                key={field}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px]"
              >
                <span className="text-muted-foreground">{label}</span>
                <Input
                  key={`${active.id}-${field}-${value}`}
                  defaultValue={value}
                  placeholder={`Add ${label.toLowerCase()}`}
                  aria-label={label}
                  className="h-6 w-32 border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0"
                  onBlur={(event) => {
                    const key = field as "company" | "recipientName" | "role";
                    if (active.id && event.target.value !== value) {
                      updateConversation.mutate({
                        id: active.id,
                        values: { [key]: event.target.value },
                      });
                    }
                  }}
                />
              </label>
            ))}
            <button
              onClick={() => setContextOpen((open) => !open)}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-hover hover:text-foreground"
            >
              <Plus className="size-3" />
              {contextOpen ? "Hide context" : "Add context"}
            </button>
          </div>
          {contextOpen && active.id ? (
            <div className="grid shrink-0 gap-2 border-b border-border bg-card/40 px-4 py-3 sm:grid-cols-2">
              <label className="space-y-1 text-[10px] text-muted-foreground">
                Why this opportunity, why now?
                <Textarea
                  key={`${active.id}-why-${active.whyNow}`}
                  defaultValue={active.whyNow}
                  maxLength={5000}
                  onBlur={(event) =>
                    updateConversation.mutate({
                      id: active.id,
                      values: { whyNow: event.target.value },
                    })
                  }
                  placeholder="What caught your attention?"
                  className="min-h-16 text-xs"
                />
              </label>
              <label className="space-y-1 text-[10px] text-muted-foreground">
                Relevant link
                <Input
                  key={`${active.id}-link-${active.contextLink}`}
                  defaultValue={active.contextLink}
                  type="url"
                  onBlur={(event) =>
                    updateConversation.mutate({
                      id: active.id,
                      values: { contextLink: event.target.value },
                    })
                  }
                  placeholder="https://…"
                  className="text-xs"
                />
              </label>
            </div>
          ) : null}
          {active.id && messagesQuery.error ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
              <p role="alert" className="max-w-xs text-xs text-destructive">
                {messagesQuery.error.message}
              </p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => void messagesQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : active.id && messagesQuery.data ? (
            <ConversationChat
              key={active.id}
              conversationId={active.id}
              conversationTitle={active.company || active.title}
              initialMessages={messagesQuery.data}
              draftSubject={subject}
              draftBody={draft}
              onUseDraft={useAssistantDraft}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card text-brand">
                <Sparkles className="size-5" />
              </span>
              <h2 className="mt-4 text-sm font-semibold">
                {active.id
                  ? "Loading conversation…"
                  : "Start with an opportunity"}
              </h2>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                Create a separate workspace for each person, role, or company.
              </p>
              {!active.id ? (
                <Button className="mt-4" onClick={newThread}>
                  <Plus /> New conversation
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <section className="hidden min-h-0 flex-col border-l border-border/50 bg-card/30 xl:flex">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-brand" />
                <h2 className="text-sm font-semibold">Draft preview</h2>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                  {saved ? "Saved" : "Unsaved"}
                </span>
              </div>
              <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
                Edit freely · nothing is sent automatically
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2.5">
            <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
              {[
                ["Cold email", "cold-email"],
                ["Cover letter", "cover-letter"],
              ].map(([mode, outputType]) => (
                <button
                  key={mode}
                  onClick={() =>
                    active.id &&
                    updateConversation.mutate({
                      id: active.id,
                      values: {
                        outputType:
                          outputType as WritingConversation["outputType"],
                      },
                    })
                  }
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${active.outputType === outputType ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copyDraft()}
                className="h-8 px-2 text-[11px]"
              >
                <Copy className="size-3" /> Copy
              </Button>
              <Button
                size="sm"
                onClick={saveDraft}
                className="h-8 px-2 text-[11px]"
              >
                {saved ? (
                  <Check className="size-3" />
                ) : (
                  <FileText className="size-3" />
                )}
                {saved ? "Saved" : "Save draft"}
              </Button>
              {gmailStatus.data?.email ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReviewOpen(true)}
                  disabled={
                    (!development && !recipientEmail.trim()) ||
                    !subject.trim() ||
                    !draft.trim()
                  }
                  className="h-8 px-2 text-[11px]"
                >
                  {gmailStatus.data.connectionType === "smtp" ? (
                    <CalendarClock className="size-3" />
                  ) : (
                    <Mail className="size-3" />
                  )}
                  {gmailStatus.data.connectionType === "smtp"
                    ? "Review to schedule"
                    : "Review for Gmail"}
                </Button>
              ) : (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-[11px]"
                >
                  <Link to="/settings?section=gmail">
                    <Mail className="size-3" /> Connect Gmail
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mx-auto max-w-xl">
              <div className="mb-4 space-y-2 rounded-xl border border-border bg-card p-4">
                <label className="grid grid-cols-[48px_1fr] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">To</span>
                  <span className="flex items-center gap-2 border-b border-border pb-2">
                    <span className="shrink-0">
                      {active.recipientName || "Add recipient"}
                    </span>
                    <Input
                      type="email"
                      value={recipientEmail}
                      onChange={(event) =>
                        updateEditor({ recipientEmail: event.target.value })
                      }
                      onBlur={() =>
                        active.id &&
                        updateConversation.mutate({
                          id: active.id,
                          values: { recipientEmail },
                        })
                      }
                      placeholder="Add email address"
                      aria-label="Recipient email address"
                      className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                    />
                  </span>
                </label>
                {development && gmailStatus.data?.email ? (
                  <p className="pl-[50px] text-[10px] leading-4 text-warning">
                    Scheduled test messages go only to {gmailStatus.data.email}.
                  </p>
                ) : null}
                <label className="grid grid-cols-[48px_1fr] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Subject</span>
                  <Input
                    value={subject}
                    onChange={(event) =>
                      updateEditor({ subject: event.target.value })
                    }
                    placeholder="Add a subject"
                    aria-label="Email subject"
                    className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                  />
                </label>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <WandSparkles className="size-3.5 text-brand" />
                    Your draft <span className="text-border-strong">
                      ·
                    </span>{" "}
                    {active.outputType === "cover-letter"
                      ? "Cover letter"
                      : "Cold email"}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {draft.length} characters
                  </span>
                </div>
                <Textarea
                  value={draft}
                  onChange={(event) => {
                    updateEditor({ draft: event.target.value, saved: false });
                  }}
                  aria-label="Editable email draft"
                  className="min-h-[360px] resize-y rounded-none border-0 bg-transparent px-5 py-4 text-sm leading-[1.9] shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2">
                  <span className="text-[11px] text-muted-foreground">
                    Edit here, then ask the assistant for revisions
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-success">
                    <ShieldCheck className="size-3" />
                    Review before sending
                  </span>
                </div>
              </div>
              <Link
                to="/writing/profile"
                className="mt-3 flex w-full items-center justify-between rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-[10px] text-muted-foreground hover:bg-hover"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="size-3.5" />
                  {writingContext.data?.guide
                    ? `Writing guide · ${writingContext.data.guide.slice(0, 52)}${writingContext.data.guide.length > 52 ? "…" : ""}`
                    : "Set your writing style guide"}
                </span>
                <ArrowUpRight className="size-3.5" />
              </Link>
              <section
                aria-labelledby="scheduled-emails-heading"
                className="mt-7 border-t border-border pt-4"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3
                    id="scheduled-emails-heading"
                    className="flex items-center gap-2 text-xs font-semibold"
                  >
                    <CalendarClock className="size-3.5 text-brand" />
                    Scheduled email
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {schedule.data?.filter((item) => item.status === "queued")
                      .length ?? 0}{" "}
                    queued
                  </span>
                </div>
                <p className="mb-3 text-[11px] leading-5 text-muted-foreground">
                  Surface sends while the desktop app is open. Due messages
                  retry after a restart.
                </p>
                {schedule.isLoading ? (
                  <p className="py-3 text-[11px] text-muted-foreground">
                    Loading schedule…
                  </p>
                ) : schedule.error ? (
                  <p role="alert" className="py-3 text-[11px] text-destructive">
                    {schedule.error.message}
                  </p>
                ) : (schedule.data?.length ?? 0) === 0 ? (
                  <p className="py-3 text-[11px] text-muted-foreground">
                    Nothing scheduled yet. Review a draft to choose a send time.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {schedule.data!.slice(0, 8).map((item) => {
                      const statusIcon =
                        item.status === "sent" ? (
                          <CircleCheck className="size-3.5 text-success" />
                        ) : item.status === "failed" ? (
                          <CircleAlert className="size-3.5 text-destructive" />
                        ) : item.status === "uncertain" ? (
                          <CircleAlert className="size-3.5 text-warning" />
                        ) : item.status === "queued" ? (
                          <Clock3 className="size-3.5 text-warning" />
                        ) : (
                          <CalendarClock className="size-3.5 text-muted-foreground" />
                        );
                      return (
                        <li key={item.id} className="py-2.5 first:pt-1">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 shrink-0">
                              {statusIcon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-[11px] font-medium">
                                  {item.subject}
                                </p>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {scheduledStatusLabel(item.status)}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                {item.status === "sent" && item.sentAt
                                  ? `Sent ${new Date(item.sentAt).toLocaleString()}`
                                  : `To ${item.recipient} · ${new Date(item.scheduledAt).toLocaleString()}`}
                              </p>
                              {item.error ? (
                                <p className="mt-1 text-[10px] leading-4 text-destructive">
                                  {item.error}
                                </p>
                              ) : null}
                            </div>
                            {item.status === "queued" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="-mr-1 -mt-1 size-6"
                                aria-label={`Cancel scheduled email: ${item.subject}`}
                                title="Cancel scheduled email"
                                disabled={cancelScheduledEmail.isPending}
                                onClick={() =>
                                  cancelScheduledEmail.mutate(item.id)
                                }
                              >
                                <X className="size-3" />
                              </Button>
                            ) : item.status === "failed" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="-mr-1 -mt-1 h-7 px-1.5 text-[10px]"
                                disabled={retryScheduledEmail.isPending}
                                onClick={() =>
                                  retryScheduledEmail.mutate(item.id)
                                }
                              >
                                <RotateCcw className="size-3" /> Retry
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-success" />
            <span>Nothing sends without your review and confirmation.</span>
            <span className="ml-auto shrink-0">Local workspace</span>
          </div>
        </section>
      </div>
      <Dialog open={conversationsOpen} onOpenChange={setConversationsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
            <DialogTitle>Conversations</DialogTitle>
            <DialogDescription>
              Keep each opportunity and its writing in one place.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find a conversation"
                aria-label="Find a conversation"
                className="h-10 pl-9"
              />
            </div>
            <Button
              type="button"
              className="w-full justify-center"
              onClick={() => {
                setConversationsOpen(false);
                newThread();
              }}
              disabled={createConversation.isPending}
            >
              <Plus /> New conversation
            </Button>
            <div className="space-y-1">
              {visibleThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    selectThread(thread.id);
                    setConversationsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === thread.id ? "bg-selected" : "hover:bg-hover"}`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                    {(thread.company || thread.recipientName || thread.title)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {thread.company || thread.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[thread.recipientName, thread.role]
                        .filter(Boolean)
                        .join(" · ") || "Add opportunity details"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(thread.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
              {visibleThreads.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {filter
                    ? "No matching conversations"
                    : "No conversations yet"}
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="grid h-[min(92dvh,820px)] max-h-[92dvh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-4 text-brand" /> Draft editor
            </DialogTitle>
            <DialogDescription>
              Shape the message here, then review it before saving or
              scheduling.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Message type</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the format the assistant should work toward.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1">
                {[
                  ["Email", "cold-email"],
                  ["Cover letter", "cover-letter"],
                ].map(([mode, outputType]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      active.id &&
                      updateConversation.mutate({
                        id: active.id,
                        values: {
                          outputType:
                            outputType as WritingConversation["outputType"],
                        },
                      })
                    }
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active.outputType === outputType ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="compact-recipient"
                className="text-xs font-medium"
              >
                To
              </label>
              <Input
                id="compact-recipient"
                type="email"
                value={recipientEmail}
                onChange={(event) =>
                  updateEditor({ recipientEmail: event.target.value })
                }
                placeholder={
                  development
                    ? "Test messages go to your account"
                    : "name@company.com"
                }
                disabled={development}
              />
              {development && gmailStatus.data?.email ? (
                <p className="text-xs text-muted-foreground">
                  Development messages are locked to {gmailStatus.data.email}.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="compact-subject" className="text-xs font-medium">
                Subject
              </label>
              <Input
                id="compact-subject"
                value={subject}
                onChange={(event) =>
                  updateEditor({ subject: event.target.value })
                }
                placeholder="A clear, specific subject"
              />
            </div>
            <div className="min-h-56 space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="compact-draft" className="text-xs font-medium">
                  Message
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {draft.length} characters
                </span>
              </div>
              <Textarea
                id="compact-draft"
                value={draft}
                onChange={(event) =>
                  updateEditor({ draft: event.target.value, saved: false })
                }
                placeholder="Your message will appear here. Ask the assistant to draft or revise it."
                className="min-h-64 resize-y text-sm leading-7"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between gap-2 border-t border-border px-4 py-3 sm:px-5">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <ShieldCheck className="size-3.5 text-success" /> Nothing sends
              without your review.
            </span>
            <div className="flex flex-1 justify-end gap-2 sm:flex-none">
              <Button
                type="button"
                variant="secondary"
                onClick={saveDraft}
                disabled={!active.id}
              >
                {saved ? <Check /> : <FileText />}
                {saved ? "Saved" : "Save draft"}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setDraftOpen(false);
                  setReviewOpen(true);
                }}
                disabled={
                  (!development && !recipientEmail.trim()) ||
                  !subject.trim() ||
                  !draft.trim()
                }
              >
                Review message
                <ArrowUpRight />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>
              {gmailStatus.data?.connectionType === "smtp"
                ? "Review scheduled email"
                : "Review Gmail draft"}
            </DialogTitle>
            <DialogDescription>
              {gmailStatus.data?.connectionType === "smtp"
                ? "Review the destination and message. App password mode keeps this draft in Surface; scheduling sends it through Gmail SMTP."
                : `Review the complete message before saving it to ${gmailStatus.data?.email ?? "Gmail"}. Creating a draft does not send it.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 text-xs">
            <p>
              <span className="font-medium">
                {gmailStatus.data?.connectionType === "smtp"
                  ? "Schedule recipient:"
                  : "Draft recipient:"}
              </span>{" "}
              {(gmailStatus.data?.connectionType === "smtp"
                ? deliveryRecipient
                : recipientEmail) || "Add a recipient"}
            </p>
            {development && gmailStatus.data?.connectionType === "oauth" ? (
              <p className="text-warning">
                Scheduled test messages will go to {gmailStatus.data?.email}.
              </p>
            ) : null}
            <p>
              <span className="font-medium">Subject:</span>{" "}
              {subject || "Add a subject"}
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border pt-3 font-sans leading-6">
              {draft || "Write the email body before continuing."}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>
              Back to edit
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReviewOpen(false);
                setScheduleLocal(defaultScheduleTime());
                setScheduleMin(
                  localDateTimeValue(new Date(Date.now() + 60_000)),
                );
                setScheduleOpen(true);
              }}
              disabled={
                !gmailStatus.data?.email ||
                !appInfo.data ||
                !deliveryRecipient ||
                !subject.trim() ||
                !draft.trim()
              }
            >
              <CalendarClock /> Schedule email
            </Button>
            {gmailStatus.data?.connectionType === "oauth" ? (
              <Button
                onClick={() => createGmailDraft.mutate()}
                disabled={
                  createGmailDraft.isPending ||
                  !gmailStatus.data?.email ||
                  !recipientEmail.trim() ||
                  !subject.trim() ||
                  !draft.trim()
                }
              >
                {createGmailDraft.isPending
                  ? "Saving to Gmail…"
                  : "Create Gmail draft"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>Schedule email</DialogTitle>
            <DialogDescription>
              Confirm the destination and send time. Surface will send this
              message from {gmailStatus.data?.email ?? "your connected Gmail"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4 text-xs">
            <div className="space-y-1.5">
              <p className="font-medium">Send to</p>
              <p className="break-all text-muted-foreground">
                {deliveryRecipient || "Connect Gmail to schedule a message"}
              </p>
              {development ? (
                <p className="text-[10px] leading-4 text-warning">
                  Development safety is on. This test email is locked to your
                  connected address.
                </p>
              ) : null}
            </div>
            <label className="block space-y-1.5">
              <span className="font-medium">Send at</span>
              <Input
                type="datetime-local"
                value={scheduleLocal}
                min={scheduleMin}
                onChange={(event) => setScheduleLocal(event.target.value)}
                aria-label="Scheduled send date and time"
                className="max-w-xs"
              />
              <span className="block text-[10px] text-muted-foreground">
                {localTimezone()} · Keep Surface open at the send time.
              </span>
            </label>
            <div className="space-y-2 border-t border-border pt-3">
              <p>
                <span className="font-medium">Subject:</span> {subject}
              </p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans leading-5 text-muted-foreground">
                {draft}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
              Back to draft
            </Button>
            <Button
              onClick={() => scheduleEmail.mutate()}
              disabled={
                scheduleEmail.isPending ||
                !gmailStatus.data?.email ||
                !appInfo.data ||
                !deliveryRecipient ||
                !subject.trim() ||
                !draft.trim() ||
                !scheduleLocal
              }
            >
              {scheduleEmail.isPending ? "Scheduling…" : "Confirm schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function parseAssistantDraft(text: string) {
  const [subjectLine, ...bodyLines] = text.trim().split(/\r?\n/);
  const match = subjectLine?.match(/^Subject:\s*(.+)$/i);
  if (!match) return { body: text.trim() };
  return {
    subject: match[1]?.trim() ?? "",
    body: bodyLines.join("\n").trim(),
  };
}
