import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { CompanyDetail, CompanyContact } from "@surface/contracts";
import { Button } from "@/components/ui/button";
import { CompanyMark } from "@/components/ui/company-mark";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SiteLink } from "./site-link";
import { CompanyLinks } from "./company-links";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowUpRight,
  Bookmark,
  Clock3,
  Copy,
  Mail,
  Plus,
  Search,
  X,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { displayDate, signalLabel, contactStatus } from "../company-ui";
export type CompanyMutation = (v: {
  path: string;
  body?: unknown;
  method?: string;
}) => Promise<unknown>;

function ContactSources({ contact }: { contact: CompanyContact }) {
  const sources = new Map(contact.evidence.map((e) => [e.url, e]));
  for (const method of contact.methods) {
    if (!sources.has(method.sourceUrl))
      sources.set(method.sourceUrl, {
        url: method.sourceUrl,
        title: new URL(method.sourceUrl).hostname.replace(/^www\./, ""),
        excerpt: "",
        retrievedAt: method.checkedAt,
      });
  }
  return (
    <Collapsible className="mt-2 text-xs text-muted-foreground">
      <CollapsibleTrigger className="group flex min-h-11 items-center gap-1.5 rounded-md hover:text-foreground md:min-h-8">
        <ChevronDown className="size-3.5 shrink-0 -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
        Sources · checked {displayDate(contact.checkedAt)}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {sources.size ? (
          [...sources.values()].map((source) => (
            <div key={source.url} className="mt-2">
              <SiteLink href={source.url}>
                {source.title || new URL(source.url).hostname}
              </SiteLink>
              <p>Checked {displayDate(source.retrievedAt)}</p>
              {source.excerpt && (
                <p className="mt-1 line-clamp-4 leading-5">{source.excerpt}</p>
              )}
              {contact.methods
                .filter((m) => m.sourceUrl === source.url)
                .map((m) => (
                  <p key={`${m.kind}:${m.value}`} className="mt-1 break-all">
                    {m.value} · {contactStatus(m.status)} · checked{" "}
                    {displayDate(m.checkedAt)}
                  </p>
                ))}
            </div>
          ))
        ) : (
          <p className="mt-2">Added manually. No public source attached.</p>
        )}
        {contact.methods.some(
          (m) => m.kind === "email" && m.status !== "mailbox_verified",
        ) && (
          <p className="mt-3 leading-5">
            Published addresses have a source. Publication does not verify
            mailbox deliverability.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CompanyReader({
  company: c,
  onClose,
  mutate,
  pending,
  actions,
}: {
  company: CompanyDetail;
  onClose: () => void;
  mutate: CompanyMutation;
  pending: boolean;
  actions?: ReactNode;
}) {
  const [later, setLater] = useState(false),
    [contact, setContact] = useState<CompanyContact | "new" | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const reminderSection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (later)
      reminderSection.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [later]);
  const base = `/api/company-discovery/companies/${c.id}`;
  const perform = async (path: string, body?: unknown, method = "POST") => {
    try {
      await mutate({ path: base + path, body, method });
      return true;
    } catch {
      return false;
    }
  };
  const action = (kind: string, extra: Record<string, unknown> = {}) =>
    perform("/actions", { kind, requestId: crypto.randomUUID(), ...extra });
  const selected = contact && contact !== "new" ? contact : null;
  return (
    <div className="company-reader-content">
      <header className="company-reader-header">
        <CompanyMark name={c.name} src={c.logoPath} company={c} />
        <div className="min-w-0 flex-1">
          <h2
            id="company-reader-title"
            className="break-words text-xl font-semibold"
          >
            {c.name}
          </h2>
          {c.website ? (
            <a
              className="inline-flex items-center gap-1 break-all text-xs text-brand"
              href={c.website}
              target="_blank"
              rel="noreferrer"
            >
              {new URL(c.website).hostname}
              <ArrowUpRight className="size-3" />
            </a>
          ) : (
            <span className="status-pill tone-muted">Website unconfirmed</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close company reader"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <CompanyLinks company={c} mutate={mutate} pending={pending} />
      {actions ? <div className="company-reader-actions">{actions}</div> : null}
      <div className="mt-0 flex min-h-0 flex-1 flex-col">
        <div className="company-reader-body">
          <p className="company-description">
            {c.description ||
              "A company description hasn’t been collected yet."}
          </p>
          {c.deferredUntil && Date.parse(c.deferredUntil) > clock && (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>Saved for later · {displayDate(c.deferredUntil)}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  void perform("", { deferredUntil: null }, "PATCH")
                }
              >
                Return now
              </Button>
            </div>
          )}
          <section className="company-reader-section">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3>
                Contacts{" "}
                <span className="text-muted-foreground">
                  · {c.contacts.length}
                </span>
              </h3>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || c.enrichmentPending || !c.website}
                  onClick={() => void perform("/contacts/find")}
                >
                  <Search />
                  Find contacts
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Add contact"
                  onClick={() => setContact("new")}
                >
                  <Plus />
                </Button>
              </div>
            </div>
            {c.contacts.length ? (
              c.contacts.map((p) => (
                <article key={p.id} className="company-contact">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold">
                        {p.kind === "person"
                          ? p.name
                          : p.kind === "hiring_inbox"
                            ? "Hiring inbox"
                            : "Company inbox"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {p.kind === "person"
                          ? p.role
                          : "Published company address"}
                        {p.manual ? " · Manually corrected" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${p.name || p.role}`}
                      onClick={() => setContact(p)}
                    >
                      <Pencil />
                    </Button>
                  </div>
                  {p.methods
                    .filter((m) => m.kind === "email")
                    .map((m, i) => (
                      <div
                        key={`${m.kind}:${m.value}:${i}`}
                        className="mt-3 min-w-0"
                      >
                        <div className="flex items-center gap-1">
                          <a
                            className="min-w-0 flex-1 break-all text-sm text-brand"
                            href={`mailto:${m.value}`}
                          >
                            {m.value}
                          </a>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Copy ${m.value}`}
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(m.value)
                                .then(() => toast.success("Email copied"))
                                .catch(() =>
                                  toast.error(
                                    "Couldn’t copy. Select the email to copy it.",
                                  ),
                                )
                            }
                          >
                            <Copy />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Email ${p.name || p.role}`}
                            asChild
                          >
                            <a href={`mailto:${m.value}`}>
                              <Mail />
                            </a>
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {contactStatus(m.status)}
                          {m.status === "mailbox_verified"
                            ? ` · ${m.provider} · ${displayDate(m.verifiedAt)}`
                            : " · Mailbox unverified"}
                        </p>
                      </div>
                    ))}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {p.methods
                      .filter((m) => m.kind === "profile")
                      .map((m) => (
                        <SiteLink key={m.value} href={m.value} />
                      ))}
                  </div>
                  {!p.methods.some((m) => m.kind === "email") && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No published email found.
                    </p>
                  )}
                  <ContactSources contact={p} />
                </article>
              ))
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No published contacts collected yet. Find contacts checks public
                team, about, and contact pages.
              </div>
            )}
          </section>
          <section className="company-reader-section">
            <h3>Open roles · {c.jobs.length}</h3>
            {c.jobs.length ? (
              c.jobs.map((j) => (
                <article key={j.id} className="border-b py-3">
                  <Link
                    className="text-sm font-medium text-brand"
                    to={`/applications?job=${encodeURIComponent(j.id)}`}
                  >
                    {j.title}
                  </Link>
                  {j.relevant && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Title matches your target roles
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {j.location || "Location not listed"}
                  </p>
                  <a
                    className="mt-2 inline-flex items-center gap-1 text-xs text-brand"
                    href={j.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View posting
                    <ArrowUpRight className="size-3" />
                  </a>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                No open roles confirmed. You can still save this company for
                founder outreach.
              </p>
            )}
          </section>
          {c.watchReason && (
            <section className="company-reader-section">
              <h3>Why you’re watching</h3>
              <p className="text-sm leading-6 whitespace-pre-wrap">
                {c.watchReason}
              </p>
            </section>
          )}
          {later && (
            <section ref={reminderSection} className="company-reader-section">
              <h3>When should this return?</h3>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  void action("deferred", {
                    deferredUntil: new Date(
                      String(d.get("date")),
                    ).toISOString(),
                  }).then((ok) => ok && setLater(false));
                }}
              >
                <label className="company-field">
                  Reminder date and time
                  <Input
                    type="datetime-local"
                    name="date"
                    required
                    min={new Date(clock + 60000)
                      .toLocaleString("sv-SE")
                      .slice(0, 16)
                      .replace(" ", "T")}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  The company returns to its previous queue when this reminder
                  is due.
                </p>
                <Button disabled={pending}>Save for later</Button>
              </form>
            </section>
          )}
          <section className="company-reader-section">
            <h3>Discovery signals</h3>
            {c.signals.length ? (
              c.signals.map((s) => (
                <article key={s.id} className="company-signal">
                  <span
                    className={`status-pill ${s.kind === "yc" ? "company-yc-badge" : "tone-blue"}`}
                  >
                    {signalLabel(s)}
                  </span>
                  {s.kind === "funding" && (
                    <dl className="company-facts">
                      <div>
                        <dt>Announced</dt>
                        <dd>{displayDate(s.announcementDate)}</dd>
                      </div>
                      <div>
                        <dt>Article published</dt>
                        <dd>{displayDate(s.publicationDate)}</dd>
                      </div>
                    </dl>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    First discovered {displayDate(s.firstDiscoveredAt)}
                  </p>
                  <div className="mt-2 flex flex-col items-start gap-1">
                    {s.evidence.map((e) => (
                      <a
                        key={e.url}
                        className="inline-flex max-w-full items-center gap-1 text-xs text-brand"
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="truncate">
                          {e.title || new URL(e.url).hostname}
                        </span>
                        <ArrowUpRight className="size-3 shrink-0" />
                      </a>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Added to your workspace. No discovery signals recorded.
              </p>
            )}
          </section>
          {c.actions.length > 0 && (
            <section className="company-reader-section">
              <h3>Your activity</h3>
              <ol className="space-y-3">
                {c.actions.slice(0, 15).map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="font-medium capitalize">
                      {a.kind.replaceAll("_", " ")}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {displayDate(a.createdAt)}
                    </span>
                    {a.contactId && (
                      <p className="text-xs text-muted-foreground">
                        {c.contacts.find((p) => p.id === a.contactId)?.name ||
                          "Company inbox"}
                      </p>
                    )}
                    {a.note && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {a.note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <footer className="company-reader-footer">
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() => void action("will_apply")}
            >
              <Bookmark />
              {c.reviewState === "will_apply" ? "In Will apply" : "Will apply"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setLater(!later);
              }}
            >
              <Clock3 />
              Later
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => void action("skipped")}
            >
              Skip
            </Button>
          </div>
          {c.reviewState !== "new" && (
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void action("reopened")}
              >
                Return to New
              </Button>
            </div>
          )}
        </footer>
      </div>
      <Dialog
        open={Boolean(contact)}
        onOpenChange={(v) => !v && setContact(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selected ? "Correct contact" : "Add contact"}
            </DialogTitle>
            <DialogDescription>
              Use a published source or a manual correction. Generic addresses
              stay labeled as company inboxes.
            </DialogDescription>
          </DialogHeader>
          <form
            key={selected?.id ?? "new"}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget),
                sourceUrl = String(d.get("sourceUrl")),
                now = new Date().toISOString(),
                email = String(d.get("email") || "").trim(),
                profiles = String(d.get("profiles") || "")
                  .split(/\s+/)
                  .filter(Boolean);
              void perform(
                `/contacts${selected ? `/${selected.id}` : ""}`,
                {
                  name: d.get("name") || "",
                  role: d.get("role"),
                  kind: d.get("kind"),
                  methods: [
                    ...(email
                      ? [
                          {
                            kind: "email",
                            value: email,
                            sourceUrl,
                            status: "manual",
                            checkedAt: now,
                            provider: null,
                            verifiedAt: null,
                          },
                        ]
                      : []),
                    ...profiles.map((value) => ({
                      kind: "profile",
                      value,
                      sourceUrl,
                      status: "manual",
                      checkedAt: now,
                      provider: null,
                      verifiedAt: null,
                    })),
                  ],
                  evidence: [
                    {
                      url: sourceUrl,
                      title: "Manually supplied contact evidence",
                      excerpt: String(d.get("evidence") || ""),
                      retrievedAt: now,
                    },
                  ],
                },
                selected ? "PUT" : "POST",
              ).then((ok) => ok && setContact(null));
            }}
          >
            <label className="company-field">
              Contact type
              <Select name="kind" defaultValue={selected?.kind ?? "person"}>
                <SelectTrigger aria-label="Contact type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Person</SelectItem>
                  <SelectItem value="hiring_inbox">Hiring inbox</SelectItem>
                  <SelectItem value="company_inbox">Company inbox</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="company-field">
              Name
              <Input
                name="name"
                defaultValue={selected?.name}
                maxLength={200}
              />
            </label>
            <label className="company-field">
              Role
              <Input
                name="role"
                required
                defaultValue={selected?.role}
                maxLength={200}
              />
            </label>
            <label className="company-field">
              Email · optional
              <Input
                name="email"
                type="email"
                defaultValue={
                  selected?.methods.find((m) => m.kind === "email")?.value
                }
              />
            </label>
            <label className="company-field">
              Public profile links
              <Textarea
                name="profiles"
                rows={2}
                defaultValue={selected?.methods
                  .filter((m) => m.kind === "profile")
                  .map((m) => m.value)
                  .join("\n")}
              />
            </label>
            <label className="company-field">
              Source URL
              <Input
                type="url"
                name="sourceUrl"
                required
                defaultValue={selected?.evidence[0]?.url ?? c.website}
              />
            </label>
            <label className="company-field">
              Evidence or correction note
              <Textarea
                name="evidence"
                rows={2}
                defaultValue={selected?.evidence[0]?.excerpt}
              />
            </label>
            <Button disabled={pending}>Save contact</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
