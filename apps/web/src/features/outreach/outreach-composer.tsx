import { useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Sparkles } from "lucide-react";
import { z } from "zod";
import {
  outreachContextSchema,
  outreachDraftSchema,
  outreachFieldsSchema,
  outreachProposalSchema,
  type OutreachFields,
  type OutreachTarget,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingStatus } from "@/components/feedback/loading-state";

const responseSchema = z.object({
  draft: outreachDraftSchema.nullable(),
  context: outreachContextSchema,
  aiConfigured: z.boolean(),
});
const empty: OutreachFields = {
  to: "",
  subject: "",
  body: "",
  writingExamples: "",
};
export const gmailKey = ["gmail-account"] as const;

export function OutreachComposer({
  target,
  id,
  knownRecipient = "",
}: {
  target: OutreachTarget;
  id: string;
  knownRecipient?: string;
}) {
  const [open, setOpen] = useState(false);
  const path = `/api/outreach/${target}/${encodeURIComponent(id)}`;
  const query = useQuery({
    queryKey: ["outreach", target, id],
    enabled: open,
    queryFn: async () => responseSchema.parse(await apiClient(path)),
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Mail /> Draft outreach
      </Button>
      {query.data ? (
        <DraftEditor
          key={id}
          path={path}
          current={query.data}
          knownRecipient={knownRecipient}
          open={open}
          onOpenChange={setOpen}
        />
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Draft outreach</DialogTitle>
              <DialogDescription>
                Prepare an email for this opportunity.
              </DialogDescription>
            </DialogHeader>
            {query.isPending ? (
              <LoadingStatus>Loading draft</LoadingStatus>
            ) : (
              <p role="alert">{query.error?.message}</p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function DraftEditor({
  path,
  current,
  knownRecipient,
  open,
  onOpenChange,
}: {
  path: string;
  current: z.infer<typeof responseSchema>;
  knownRecipient: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [fields, setFields] = useState<OutreachFields>(() =>
    current.draft
      ? outreachFieldsSchema.parse(current.draft)
      : { ...empty, to: knownRecipient },
  );
  const [local, setLocal] = useState(current.draft);
  const [proposal, setProposal] = useState<z.infer<
    typeof outreachProposalSchema
  > | null>(null);
  const [emphasis, setEmphasis] = useState("");
  const [confirmedAccount, setConfirmedAccount] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const desktop = window.surfaceDesktop;
  const gmail = useQuery({
    queryKey: gmailKey,
    enabled: open && Boolean(desktop?.gmailStatus),
    queryFn: () => desktop!.gmailStatus(),
  });
  const account = gmail.data?.email;
  const savedTo = useQuery({
    queryKey: ["gmail-draft", account, local?.id],
    enabled: open && Boolean(account && local?.id),
    queryFn: () => desktop!.gmailDraftStatus(local!.id),
  });
  const dirty = Object.entries(fields).some(
    ([name, value]) => value !== (local?.[name as keyof OutreachFields] ?? ""),
  );
  const available = Boolean(
    desktop?.saveGmailDraft && account && confirmedAccount === account,
  );
  const busy = useMutation({
    mutationFn: async (action: "local" | "gmail" | "open") => {
      const valid = outreachFieldsSchema.safeParse(fields);
      if (!valid.success)
        throw new Error(
          "Enter a valid recipient email or leave it blank. Check the subject and draft length.",
        );
      const draft =
        local && !dirty
          ? local
          : outreachDraftSchema.parse(
              await apiClient(path, {
                method: "PUT",
                body: JSON.stringify(valid.data),
              }),
            );
      setLocal(draft);
      if (action === "local") return "Saved locally";
      if (!account || !desktop) throw new Error("Connect Gmail first.");
      const result = await desktop.saveGmailDraft(
        draft.id,
        account,
        action === "open",
        replace,
      );
      client.setQueryData(
        ["gmail-draft", account, draft.id],
        result.savedRevision,
      );
      setReplace(false);
      return action === "open"
        ? `Saved to Gmail. Find “${draft.subject}” in Drafts and choose Schedule Send.`
        : `Saved to Gmail Drafts for ${result.email}.`;
    },
    onMutate: () => {
      setError("");
      setNotice("");
    },
    onSuccess: (message) => setNotice(message),
    onError: (failure) =>
      setError(
        failure.message.replace(
          /^Error invoking remote method .*?: Error: /,
          "",
        ),
      ),
  });
  const generate = useMutation({
    mutationFn: async (mode: "draft" | "shorter" | "emphasis") => {
      abort.current = new AbortController();
      return outreachProposalSchema.parse(
        await apiClient(`${path}/propose`, {
          method: "POST",
          signal: abort.current.signal,
          body: JSON.stringify({ ...fields, mode, emphasis }),
        }),
      );
    },
    onMutate: () => {
      setError("");
      setProposal(null);
    },
    onSuccess: setProposal,
    onError: (failure) => {
      if (failure.name !== "AbortError") setError(failure.message);
    },
  });
  function change(name: keyof OutreachFields, value: string) {
    setFields((previous) => ({ ...previous, [name]: value }));
    setNotice("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>Draft outreach</DialogTitle>
          <DialogDescription>
            {[current.context.title, current.context.company]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="grid min-w-0 content-start gap-3">
            <label className="grid gap-1.5 text-sm">
              To
              <Input
                type="email"
                value={fields.to}
                onChange={(event) => change("to", event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Subject
              <Input
                value={fields.subject}
                maxLength={200}
                onChange={(event) => change("subject", event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Message
              <Textarea
                className="min-h-44"
                value={fields.body}
                maxLength={20000}
                onChange={(event) => change("body", event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {generate.isPending ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => abort.current?.abort()}
                >
                  Cancel generation
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!current.aiConfigured}
                    onClick={() => generate.mutate("draft")}
                  >
                    <Sparkles /> Generate draft
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!current.aiConfigured || !fields.body.trim()}
                    onClick={() => generate.mutate("shorter")}
                  >
                    Make shorter
                  </Button>
                </>
              )}
            </div>
            {current.aiConfigured && fields.body.trim() && (
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Draft emphasis"
                  placeholder="Emphasize a project or skill…"
                  className="min-w-40 flex-1"
                  value={emphasis}
                  maxLength={500}
                  onChange={(event) => setEmphasis(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generate.isPending || !emphasis.trim()}
                  onClick={() => generate.mutate("emphasis")}
                >
                  Change emphasis
                </Button>
              </div>
            )}
            {!current.aiConfigured && (
              <p className="text-xs text-muted-foreground">
                Connect an AI provider in Settings to generate drafts. You can
                write and save manually.
              </p>
            )}
            {proposal && (
              <section
                className="grid gap-2 rounded-md border border-border p-3"
                aria-label="Suggested revision"
              >
                <h3 className="font-semibold">{proposal.subject}</h3>
                <p className="whitespace-pre-wrap text-sm">{proposal.body}</p>
                {proposal.evidence.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      Profile evidence used
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {proposal.evidence.map((fact, index) => (
                        <li key={index}>{fact}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setFields({
                        ...fields,
                        subject: proposal.subject,
                        body: proposal.body,
                      });
                      setProposal(null);
                    }}
                  >
                    Use suggestion
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProposal(null)}
                  >
                    Keep my version
                  </Button>
                </div>
              </section>
            )}
          </div>
          <aside className="grid min-w-0 content-start gap-3 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            <h3 className="text-sm font-semibold">Draft context</h3>
            {current.context.details && (
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Opportunity details
                </summary>
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {current.context.details}
                </p>
              </details>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer">
                Confirmed profile facts
              </summary>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto break-words text-xs text-muted-foreground">
                {current.context.facts.length ? (
                  current.context.facts.map((fact, index) => (
                    <p className="whitespace-pre-wrap" key={index}>
                      {fact}
                    </p>
                  ))
                ) : (
                  <p>No confirmed profile facts are available.</p>
                )}
              </div>
            </details>
            <label className="grid gap-1.5 text-sm">
              Writing examples
              <Textarea
                rows={4}
                value={fields.writingExamples}
                maxLength={12000}
                onChange={(event) =>
                  change("writingExamples", event.target.value)
                }
                placeholder="Paste examples of your tone…"
              />
            </label>
            <h3 className="border-t border-border pt-3 text-sm font-semibold">
              Gmail
            </h3>
            {account ? (
              <>
                <label className="flex items-start gap-2 break-all text-sm">
                  <Checkbox
                    checked={confirmedAccount === account}
                    onCheckedChange={(value) =>
                      setConfirmedAccount(value ? account : null)
                    }
                  />{" "}
                  Save to {account}
                </label>
                {error &&
                  /Gmail (?:no longer has|has not confirmed)/.test(error) && (
                    <label className="flex items-start gap-2 text-xs">
                      <Checkbox
                        checked={replace}
                        onCheckedChange={(value) => setReplace(value === true)}
                      />{" "}
                      I checked Gmail. Create a replacement if the draft is
                      missing.
                    </label>
                  )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {gmail.data?.error ??
                  (desktop?.gmailStatus
                    ? "Connect Gmail in Settings to hand off the draft."
                    : "Gmail handoff is available in the desktop app.")}{" "}
                {desktop?.gmailStatus && (
                  <Link
                    className="text-brand underline"
                    to="/settings?section=gmail"
                  >
                    Gmail settings
                  </Link>
                )}
              </p>
            )}
          </aside>
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            disabled={busy.isPending}
            onClick={() => busy.mutate("local")}
          >
            Save locally
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy.isPending || !available}
            onClick={() => busy.mutate("gmail")}
          >
            Save to Gmail Drafts
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy.isPending || !available}
            onClick={() => busy.mutate("open")}
          >
            Open Gmail to schedule
          </Button>
          <p role="status" className="basis-full text-xs text-muted-foreground">
            {notice ||
              (dirty
                ? "Unsaved edits"
                : savedTo.data && savedTo.data === local?.updatedAt
                  ? "Drafted · saved locally and in Gmail"
                  : local
                    ? "Drafted · saved locally"
                    : "New draft")}
          </p>
          {error && (
            <p role="alert" className="basis-full text-sm text-destructive">
              {error}
            </p>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
