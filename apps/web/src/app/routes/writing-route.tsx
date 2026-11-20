import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Copy,
  FileText,
  LoaderCircle,
  Mail,
  MessagesSquare,
  Plus,
  Search,
  Settings2,
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
  writingConversationsKey,
  useWritingContext,
  useWritingConversations,
  useWritingMessages,
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
    onSuccess: (updated) => {
      client.setQueryData<WritingConversation[]>(
        writingConversationsKey,
        (current) =>
          current
            ?.map((conversation) =>
              conversation.id === updated.id ? updated : conversation,
            )
            .toSorted((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            ),
      );
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
          to: development ? (email ?? "") : recipientEmail,
          subject,
          body: draft,
          updatedAt,
        },
        email,
      );
    },
    onSuccess: ({ email }) => {
      setReviewOpen(false);
      toast.success(`Draft saved for ${email}. Choose Schedule send in Gmail.`);
    },
    onError: (error) => toast.error(error.message),
  });
  const deliveryRecipient = development
    ? (gmailStatus.data?.email ?? "")
    : recipientEmail.trim();
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
                      key={`${active.id}-${field}`}
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
                    key={`${active.id}-why`}
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
                    key={`${active.id}-link`}
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
                    <Mail className="size-3" />
                    Review for Gmail
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
                <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-sm">
                  <label className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2 border-b border-border px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground">To</span>
                    <span className="flex min-w-0 items-center gap-2">
                      {active.recipientName ? (
                        <span
                          className="max-w-40 shrink-0 truncate text-foreground/80"
                          title={active.recipientName}
                        >
                          {active.recipientName}
                        </span>
                      ) : null}
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
                        className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      />
                    </span>
                  </label>
                  {development && gmailStatus.data?.email ? (
                    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 px-4 pt-2">
                      <span aria-hidden="true" />
                      <p className="flex items-start gap-1.5 pb-2 text-[11px] leading-4 text-muted-foreground">
                        <CircleAlert className="mt-0.5 size-3 shrink-0 text-warning" />
                        <span>
                          <span className="font-medium text-warning">
                            Test mode
                          </span>
                          {" · Drafts are addressed to "}
                          <span className="font-medium text-foreground/80">
                            {gmailStatus.data.email}
                          </span>
                          .
                        </span>
                      </p>
                    </div>
                  ) : null}
                  <label className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-2 border-t border-border px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground">Subject</span>
                    <Input
                      value={subject}
                      onChange={(event) =>
                        updateEditor({ subject: event.target.value })
                      }
                      placeholder="Add a subject"
                      aria-label="Email subject"
                      className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                    />
                  </label>
                  <Textarea
                    value={draft}
                    onChange={(event) => {
                      updateEditor({ draft: event.target.value, saved: false });
                    }}
                    aria-label="Editable email draft"
                    className="min-h-[360px] resize-y rounded-none border-0 border-t border-border bg-transparent px-5 py-4 text-sm leading-7 shadow-none focus-visible:ring-0"
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
            <DialogTitle>Review Gmail draft</DialogTitle>
            <DialogDescription>
              Review the complete message before saving it to{" "}
              {gmailStatus.data?.email ?? "Gmail"}. Saving opens Gmail Drafts;
              choose Schedule send there when you are ready.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4 text-xs">
            <p>
              <span className="font-medium">Draft recipient:</span>{" "}
              {deliveryRecipient || "Add a recipient"}
            </p>
            {development && gmailStatus.data?.connectionType === "oauth" ? (
              <p className="text-warning">
                Development drafts are addressed to {gmailStatus.data?.email}.
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
            {gmailStatus.data?.connectionType === "oauth" ? (
              <Button
                onClick={() =>
                  createGmailDraft.mutate(new Date().toISOString())
                }
                disabled={
                  createGmailDraft.isPending ||
                  !gmailStatus.data?.email ||
                  !deliveryRecipient ||
                  !subject.trim() ||
                  !draft.trim()
                }
              >
                {createGmailDraft.isPending
                  ? "Saving to Gmail…"
                  : "Save to Gmail & open Drafts"}
              </Button>
            ) : null}
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
