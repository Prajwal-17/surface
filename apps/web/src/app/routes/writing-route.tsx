import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  FileText,
  LoaderCircle,
  Mail,
  MessagesSquare,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiClient } from "@/lib/api-client";
import { copyToClipboard } from "@/lib/clipboard";
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
  title: "New conversation",
  company: "",
  companyId: null,
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

function compactConversationDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const daysAgo = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) /
      (24 * 60 * 60 * 1000),
  );
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function conversationSummary(
  thread: Pick<
    WritingConversation,
    "title" | "company" | "role" | "recipientName"
  >,
) {
  return (
    [thread.company, thread.role, thread.recipientName]
      .filter((value) => value && value !== thread.title)
      .join(" · ") || "No opportunity details yet"
  );
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
  const appInfo = useQuery({
    queryKey: ["desktop-app-info"],
    enabled: Boolean(desktop),
    queryFn: () => desktop!.appInfo(),
  });
  const development = appInfo.data?.channel === "development";
  const schedule = useWritingSchedule();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCompanyId = searchParams.get("company");
  const requestedCompanyConversation = requestedCompanyId
    ? conversations.find((thread) => thread.companyId === requestedCompanyId)
    : undefined;
  const selectedId =
    activeId ??
    requestedCompanyConversation?.id ??
    conversations[0]?.id ??
    null;
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
    mutationFn: (input?: { companyId?: string; company?: string }) =>
      apiClient<WritingConversation>("/api/writing/conversations", {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: async (conversation) => {
      await client.invalidateQueries({ queryKey: writingConversationsKey });
      setContextOpen(false);
      setActiveId(conversation.id);
    },
    onError: (error) => toast.error(error.message),
  });
  const draftCompanyHandled = useRef<string | null>(null);
  const companyOptions = useQuery({
    queryKey: ["tracker", "companies", "draft-options"],
    enabled: Boolean(requestedCompanyId),
    queryFn: () =>
      apiClient<Array<{ id: string; name: string; website: string }>>(
        "/api/tracker/companies",
      ),
  });
  useEffect(() => {
    if (
      !requestedCompanyId ||
      draftCompanyHandled.current === requestedCompanyId
    ) {
      return;
    }
    const existing = conversations.find(
      (thread) => thread.companyId === requestedCompanyId,
    );
    if (existing) {
      draftCompanyHandled.current = requestedCompanyId;
      // oxlint-disable-next-line react/set-state-in-effect -- selecting the conversation that was requested by URL
      setActiveId(existing.id);
      const next = new URLSearchParams(searchParams);
      next.delete("company");
      setSearchParams(next, { replace: true });
      return;
    }
    if (companyOptions.isLoading) return;
    const company = companyOptions.data?.find(
      (candidate) => candidate.id === requestedCompanyId,
    );
    draftCompanyHandled.current = requestedCompanyId;
    if (!company) {
      const next = new URLSearchParams(searchParams);
      next.delete("company");
      setSearchParams(next, { replace: true });
      toast.error("That company is no longer in the tracker.");
      return;
    }
    createConversation.mutate(
      { companyId: company.id, company: company.name },
      {
        onSuccess: () => {
          toast.success(`Draft conversation ready for ${company.name}`);
          const next = new URLSearchParams(searchParams);
          next.delete("company");
          setSearchParams(next, { replace: true });
        },
        onError: () => {
          const next = new URLSearchParams(searchParams);
          next.delete("company");
          setSearchParams(next, { replace: true });
        },
      },
    );
  }, [
    companyOptions.data,
    companyOptions.isLoading,
    conversations,
    createConversation,
    requestedCompanyId,
    searchParams,
    setSearchParams,
  ]);
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
  const createGmailDraft = useMutation({
    mutationFn: async (updatedAt: string) => {
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
          updatedAt,
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
        `${thread.title} ${thread.company} ${thread.recipientName} ${thread.role}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [conversations, filter],
  );

  function selectThread(id: string) {
    setContextOpen(false);
    setActiveId(id);
  }
  function newThread() {
    setContextOpen(false);
    createConversation.mutate(undefined);
  }
  function saveContextField(
    field: "company" | "recipientName" | "role" | "whyNow" | "contextLink",
    value: string,
    previousValue: string,
  ) {
    if (!active.id || value === previousValue) return;
    updateConversation.mutate({ id: active.id, values: { [field]: value } });
  }
  async function copyDraft() {
    if (await copyToClipboard(draft)) {
      toast.success("Draft copied to clipboard");
    } else {
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
    setDraftOpen(true);
    toast.success(
      parsed.subject
        ? "Subject and message added to the draft"
        : "Assistant response added to the draft",
    );
  }

  return (
    <main className="writing-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col border-r border-border md:flex">
          <div className="space-y-2.5 p-2.5">
            <Button
              className="h-9 w-full justify-center"
              onClick={newThread}
              disabled={createConversation.isPending}
            >
              {createConversation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {createConversation.isPending ? "Creating…" : "New conversation"}
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center justify-between px-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Recent conversations</span>
            </div>
          </div>
          <nav
            aria-label="Writing conversations"
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2"
          >
            {conversationsQuery.isError ? (
              <div className="space-y-2 px-2 py-5 text-center text-xs text-muted-foreground">
                <p>Could not load conversations.</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void conversationsQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : conversationsQuery.isPending ? (
              <div
                className="flex items-center justify-center gap-2 px-2 py-5 text-xs text-muted-foreground"
                role="status"
              >
                <LoaderCircle className="size-3.5 animate-spin" />
                Loading conversations
              </div>
            ) : (
              visibleThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`group flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === thread.id ? "bg-selected" : "hover:bg-hover"}`}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                    {thread.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium leading-5">
                        {thread.title}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {compactConversationDate(thread.updatedAt)}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                      {conversationSummary(thread)}
                    </span>
                  </span>
                </button>
              ))
            )}
            {!conversationsQuery.isPending &&
              !conversationsQuery.isError &&
              visibleThreads.length === 0 && (
                <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                  {filter
                    ? "No matching conversations"
                    : "No conversations yet"}
                </p>
              )}
          </nav>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                {(active.company || active.recipientName || "W")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">
                  {active.title}
                </h1>
                <p className="truncate text-[11px] text-muted-foreground">
                  {conversationSummary(active)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
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
                className="h-8"
                onClick={() => setDraftOpen(true)}
                disabled={!active.id}
                aria-label="Edit draft"
                title="Edit draft"
              >
                <Mail className="size-3.5" />
                <span className="hidden sm:inline">Edit draft</span>
              </Button>
            </div>
          </div>
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="shrink-0 font-medium text-muted-foreground">
                Opportunity
              </span>
              <span className="truncate text-foreground/80">
                {[active.company, active.recipientName, active.role]
                  .filter(Boolean)
                  .join(" · ") || "Add company, recipient, and role"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setContextOpen((open) => !open)}
              aria-expanded={contextOpen}
              aria-controls={contextOpen ? "opportunity-details" : undefined}
              disabled={!active.id}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <Settings2 className="size-3.5" />
              {contextOpen ? "Hide details" : "Edit details"}
            </button>
          </div>
          {contextOpen && active.id ? (
            <div
              id="opportunity-details"
              role="region"
              aria-label="Opportunity details"
              className="shrink-0 border-b border-border bg-muted/20 px-4 py-3"
            >
              <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-3">
                {(
                  [
                    ["Company", "company", active.company],
                    ["Recipient", "recipientName", active.recipientName],
                    ["Role", "role", active.role],
                  ] as const
                ).map(([label, field, value]) => (
                  <label
                    key={field}
                    className="min-w-0 space-y-1.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {label}
                    <Input
                      key={`${active.id}-${field}-${value}`}
                      defaultValue={value}
                      placeholder={`Add ${label.toLowerCase()}`}
                      aria-label={label}
                      className="h-9 min-w-0 bg-background text-xs font-normal"
                      onBlur={(event) =>
                        saveContextField(field, event.target.value, value)
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="mx-auto mt-3 grid max-w-5xl gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <label className="min-w-0 space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Why this opportunity, why now?
                  <Textarea
                    key={`${active.id}-why-${active.whyNow}`}
                    defaultValue={active.whyNow}
                    maxLength={5000}
                    onBlur={(event) =>
                      saveContextField(
                        "whyNow",
                        event.target.value,
                        active.whyNow,
                      )
                    }
                    placeholder="What caught your attention?"
                    className="min-h-20 bg-background text-xs font-normal"
                  />
                </label>
                <label className="min-w-0 space-y-1.5 text-[11px] font-medium text-muted-foreground">
                  Relevant link
                  <Input
                    key={`${active.id}-link-${active.contextLink}`}
                    defaultValue={active.contextLink}
                    type="url"
                    onBlur={(event) =>
                      saveContextField(
                        "contextLink",
                        event.target.value,
                        active.contextLink,
                      )
                    }
                    placeholder="https://…"
                    className="h-9 bg-background text-xs font-normal"
                  />
                </label>
              </div>
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
              initialMessages={messagesQuery.data}
              draftSubject={subject}
              draftBody={draft}
              onUseDraft={useAssistantDraft}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
              {active.id ? (
                <LoaderCircle
                  className="mb-3 size-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : null}
              <h2 className="text-sm font-semibold">
                {active.id
                  ? "Loading conversation…"
                  : "Start with an opportunity"}
              </h2>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                Keep each outreach conversation focused with its own company,
                recipient, and draft.
              </p>
              {!active.id ? (
                <Button className="mt-4 md:hidden" onClick={newThread}>
                  <Plus className="size-4" /> New conversation
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <Sheet open={draftOpen} onOpenChange={setDraftOpen}>
          <SheetContent
            side="right"
            className="flex h-dvh w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[min(92vw,760px)] sm:max-w-[760px]"
          >
            <SheetHeader className="flex-row shrink-0 items-center justify-between space-y-0 border-b border-border px-5 py-4 pr-12 text-left">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Mail className="size-4 text-brand" /> Draft editor
                </SheetTitle>
                <SheetDescription className="mt-1 truncate text-xs">
                  {active.company || active.title} · Edit before saving or
                  scheduling
                </SheetDescription>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                {saved ? "Saved" : "Unsaved"}
              </span>
            </SheetHeader>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 sm:px-5">
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
              <div className="flex flex-wrap items-center gap-1">
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
                    onClick={() => {
                      setDraftOpen(false);
                      setReviewOpen(true);
                    }}
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
              <div className="mx-auto max-w-2xl">
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
                      Scheduled test messages go only to{" "}
                      {gmailStatus.data.email}.
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
                  <div className="flex items-center justify-end border-b border-border px-4 py-2.5">
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
                </div>
                <Link
                  to="/writing/profile"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Settings2 className="size-3.5" />
                  {writingContext.data?.guide
                    ? "Writing preferences"
                    : "Set writing preferences"}
                  <ArrowUpRight className="size-3" />
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
                    <p
                      role="alert"
                      className="py-3 text-[11px] text-destructive"
                    >
                      {schedule.error.message}
                    </p>
                  ) : (schedule.data?.length ?? 0) === 0 ? (
                    <p className="py-3 text-[11px] text-muted-foreground">
                      Nothing scheduled yet. Review a draft to choose a send
                      time.
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
          </SheetContent>
        </Sheet>
      </div>
      <Dialog open={conversationsOpen} onOpenChange={setConversationsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
            <DialogTitle>Conversations</DialogTitle>
            <DialogDescription>
              Keep each outreach conversation and its draft together.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
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
              {createConversation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {createConversation.isPending ? "Creating…" : "New conversation"}
            </Button>
            <div className="space-y-1">
              {conversationsQuery.isError ? (
                <div className="space-y-2 px-3 py-6 text-center text-sm text-muted-foreground">
                  <p>Could not load conversations.</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void conversationsQuery.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : conversationsQuery.isPending ? (
                <div
                  className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"
                  role="status"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading conversations
                </div>
              ) : (
                visibleThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      selectThread(thread.id);
                      setConversationsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === thread.id ? "bg-selected" : "hover:bg-hover"}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {thread.title.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {thread.title}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {compactConversationDate(thread.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {conversationSummary(thread)}
                      </span>
                    </span>
                  </button>
                ))
              )}
              {!conversationsQuery.isPending &&
              !conversationsQuery.isError &&
              visibleThreads.length === 0 ? (
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
                onClick={() =>
                  createGmailDraft.mutate(new Date().toISOString())
                }
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
