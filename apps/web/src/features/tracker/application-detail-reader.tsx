import { useEffect, useState } from "react";
import {
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type ApplicationDetail = {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  status: string;
  type: string | null;
  description: string;
  location: string;
  employmentType: string;
  workMode: string;
  compensation: string;
  sourceUrl: string | null;
  appliedOn: string | null;
  contactedOn: string | null;
  followUpOn: string | null;
  contactName: string;
  contactEmail: string;
  channels: string;
  outcome: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export function ApplicationDetailReader({
  application,
  loading,
  onClose,
}: {
  application: ApplicationDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1279px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isNarrow) return; // the Sheet closes on Escape for narrow screens
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isNarrow, onClose]);

  return (
    <>
      <aside
        aria-label="Application details"
        className="absolute inset-y-0 right-0 z-40 hidden w-[min(440px,42vw)] flex-col border-l border-border bg-card shadow-2xl xl:flex"
      >
        <ReaderBody
          application={application}
          loading={loading}
          onClose={onClose}
          showClose
        />
      </aside>
      {isNarrow ? (
        <Sheet open onOpenChange={(open) => !open && onClose()}>
          <SheetContent
            className="inset-0 flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none xl:hidden"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document
                .querySelector<HTMLElement>(
                  '[aria-label^="View details for "][aria-current="true"]',
                )
                ?.focus();
            }}
          >
            <SheetTitle className="sr-only">
              {application?.title ?? "Application details"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Read-only details for this tracked opportunity.
            </SheetDescription>
            <ReaderBody
              application={application}
              loading={loading}
              onClose={onClose}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}

function ReaderBody({
  application,
  loading,
  onClose,
  showClose = false,
}: {
  application: ApplicationDetail | null;
  loading: boolean;
  onClose: () => void;
  showClose?: boolean;
}) {
  if (loading && !application) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
        <div className="space-y-5 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Application details</h2>
          {showClose ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close application details"
              onClick={onClose}
            >
              <X />
            </Button>
          ) : null}
        </header>
        <p className="p-4 text-sm text-muted-foreground">
          This application is no longer in the tracker.
        </p>
      </div>
    );
  }

  const compensation = compensationLabel(application.compensation);
  const postingLinks = postingLinksOf(application.sourceUrl);
  const workMode =
    application.workMode === "unknown" ? "" : capitalize(application.workMode);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border p-4 pr-14 xl:pr-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className={statusTone(application.status)}>
              {application.status}
            </Badge>
            {application.type ? (
              <span className="text-xs text-muted-foreground">
                {application.type}
              </span>
            ) : null}
          </div>
          <h2 className="break-words text-lg font-semibold leading-snug tracking-tight">
            {application.title}
          </h2>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <Link
              to={`/companies?company=${encodeURIComponent(application.companyId)}`}
              className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{application.companyName}</span>
            </Link>
            {postingLinks.length ? (
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0"
              >
                <a
                  href={postingLinks[0]!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${application.title} posting in browser`}
                  title="Open posting"
                >
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
            ) : null}
            {postingLinks.length > 1 ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                +{postingLinks.length - 1}
              </span>
            ) : null}
          </div>
        </div>
        {showClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Close application details"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {postingLinks.length ? (
          <section aria-label="Posting links" className="border-b p-4">
            <h3 className="mb-3 text-sm font-semibold">Posting links</h3>
            <div className="grid gap-2">
              {postingLinks.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-2 text-sm underline decoration-border underline-offset-4 hover:text-brand"
                >
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">
                    {hostnameOf(link)}
                    {postingLinks.length > 1 ? ` · ${link}` : ""}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-label="Role details" className="border-b p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <DetailField
              icon={MapPin}
              label="Location"
              value={application.location}
            />
            <DetailField
              icon={BriefcaseBusiness}
              label="Work mode"
              value={workMode}
            />
            <DetailField
              icon={BriefcaseBusiness}
              label="Employment"
              value={application.employmentType}
            />
            <DetailField
              icon={Banknote}
              label="Compensation"
              value={compensation}
            />
            <DetailField
              icon={Send}
              label="Channels"
              value={application.channels}
            />
          </div>
        </section>

        <section aria-label="Application timeline" className="border-b p-4">
          <h3 className="mb-3 text-sm font-semibold">Timeline</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <DetailField
              icon={CalendarDays}
              label="Applied"
              value={dateLabel(application.appliedOn)}
            />
            <DetailField
              icon={CalendarDays}
              label="Last contacted"
              value={dateLabel(application.contactedOn)}
            />
            <DetailField
              icon={CalendarDays}
              label="Follow-up"
              value={dateLabel(application.followUpOn)}
            />
          </div>
        </section>

        {application.contactName || application.contactEmail ? (
          <section aria-label="Contact" className="border-b p-4">
            <h3 className="mb-3 text-sm font-semibold">Contact</h3>
            <div className="grid gap-3">
              {application.contactName ? (
                <DetailField
                  icon={UserRound}
                  label="Name"
                  value={application.contactName}
                />
              ) : null}
              {application.contactEmail ? (
                <div className="flex min-w-0 items-start gap-2.5">
                  <Mail
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <a
                      href={`mailto:${application.contactEmail}`}
                      className="break-all text-sm underline decoration-border underline-offset-4 hover:text-brand"
                    >
                      {application.contactEmail}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section aria-label="Job description" className="border-b p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            Job description
          </h3>
          {application.description ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {application.description}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No description was saved for this opportunity.
              {postingLinks.length
                ? " Open the posting to view its current details."
                : ""}
            </p>
          )}
        </section>

        {application.notes ? (
          <section aria-label="Application notes" className="border-b p-4">
            <h3 className="mb-2 text-sm font-semibold">Notes</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {application.notes}
            </p>
          </section>
        ) : null}

        {application.outcome ? (
          <section aria-label="Outcome" className="border-b p-4">
            <h3 className="mb-2 text-sm font-semibold">Outcome</h3>
            <Badge className={outcomeTone(application.outcome)}>
              {application.outcome}
            </Badge>
          </section>
        ) : null}

        <footer
          aria-label="Record metadata"
          className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border p-4"
        >
          <MetadataField
            label="Created at"
            value={timestampLabel(application.createdAt)}
          />
          <MetadataField
            label="Updated at"
            value={timestampLabel(application.updatedAt)}
          />
          <p className="col-span-2 truncate font-mono text-[11px] text-muted-foreground">
            ID {application.id}
          </p>
        </footer>
      </div>
    </div>
  );
}

function DetailField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm">{value}</p>
      </div>
    </div>
  );
}

function dateLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function timestampLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function compensationLabel(value: string): string {
  if (!value) return "";
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) {
      const compensation = parsed as {
        original?: unknown;
        min?: unknown;
        max?: unknown;
        currency?: unknown;
        period?: unknown;
      };
      if (typeof compensation.original === "string")
        return compensation.original;
      if (compensation.min !== null || compensation.max !== null) {
        const currency =
          typeof compensation.currency === "string"
            ? `${compensation.currency} `
            : "";
        const period =
          typeof compensation.period === "string"
            ? ` / ${compensation.period}`
            : "";
        const min =
          typeof compensation.min === "number"
            ? compensation.min.toLocaleString()
            : "?";
        const max =
          typeof compensation.max === "number"
            ? compensation.max.toLocaleString()
            : "?";
        return `${currency}${min}–${max}${period}`;
      }
    }
  } catch {
    // A plain text range is a valid tracker value too.
  }
  return value;
}

function capitalize(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : "";
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function postingLinksOf(value: string | null): string[] {
  return (value ?? "")
    .split(/\s+/)
    .map((link) => safeHttpUrl(link))
    .filter((link): link is string => Boolean(link));
}

function outcomeTone(outcome: string): string {
  if (outcome === "Offer accepted") return "tone-mint";
  if (outcome === "Offer declined" || outcome === "Withdrew")
    return "tone-amber";
  return "tone-muted";
}

function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function statusTone(status: string): string {
  if (status === "Applied" || status === "In conversation") return "tone-mint";
  if (status === "To apply") return "tone-blue";
  return "tone-muted";
}
