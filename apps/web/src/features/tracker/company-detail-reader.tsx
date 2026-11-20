import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  BriefcaseBusiness,
  ExternalLink,
  MapPin,
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
import { CompanyResearchPanel } from "@/features/leads/company-research-panel";

type CompanyDetail = {
  id: string;
  name: string;
  website: string;
  location: string;
  description: string;
  status: string;
  notes: string;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
};

type ApplicationLink = {
  id: string;
  title: string;
  status: string;
};

export function CompanyDetailReader({
  company,
  applications,
  loading,
  onClose,
}: {
  company: CompanyDetail | null;
  applications: ApplicationLink[];
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

  return (
    <>
      <aside
        aria-label="Company details"
        className="hidden h-full min-h-0 w-[min(440px,42vw)] shrink-0 flex-col border-l border-border bg-card xl:flex"
      >
        <ReaderBody
          company={company}
          applications={applications}
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
                  '[aria-label^="View details for company "][aria-current="true"]',
                )
                ?.focus();
            }}
          >
            <SheetTitle className="sr-only">
              {company?.name ?? "Company details"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Details and tracked applications for this company.
            </SheetDescription>
            <ReaderBody
              company={company}
              applications={applications}
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
  company,
  applications,
  loading,
  onClose,
  showClose = false,
}: {
  company: CompanyDetail | null;
  applications: ApplicationLink[];
  loading: boolean;
  onClose: () => void;
  showClose?: boolean;
}) {
  if (loading && !company) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
        <div className="space-y-5 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Company details</h2>
          {showClose ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close company details"
              onClick={onClose}
            >
              <X />
            </Button>
          ) : null}
        </header>
        <p className="p-4 text-sm text-muted-foreground">
          This company is no longer in the tracker.
        </p>
      </div>
    );
  }

  const website = safeWebsite(company.website);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border p-4 pr-14 xl:pr-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{company.status}</Badge>
            <span className="text-xs text-muted-foreground">
              {company.applicationCount}{" "}
              {company.applicationCount === 1 ? "application" : "applications"}
            </span>
          </div>
          <h2 className="break-words text-lg font-semibold leading-snug tracking-tight">
            {company.name}
          </h2>
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-sm text-brand underline-offset-4 hover:underline"
            >
              <span className="truncate">{hostname(website)}</span>
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="sr-only">Open company website</span>
            </a>
          ) : null}
        </div>
        {showClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Close company details"
            onClick={onClose}
          >
            <X />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section aria-label="Company information" className="border-b p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <DetailField
              icon={MapPin}
              label="Location"
              value={company.location}
            />
            <DetailField
              icon={Building2}
              label="Status"
              value={company.status}
            />
          </dl>
          {company.description.trim() ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {company.description}
            </p>
          ) : null}
        </section>

        <CompanyResearchPanel
          companyId={company.id}
          companyName={company.name}
        />

        <section aria-labelledby="company-applications-heading" className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3
              id="company-applications-heading"
              className="text-sm font-semibold"
            >
              Applications
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {company.applicationCount}
            </span>
          </div>
          {applications.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {applications.map((application) => (
                <li key={application.id}>
                  <Link
                    to={`/applications?application=${encodeURIComponent(application.id)}`}
                    className="flex min-w-0 items-start justify-between gap-3 px-3 py-2.5 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <BriefcaseBusiness
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {application.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {application.status}
                        </span>
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No applications linked to this company yet.
            </p>
          )}
        </section>

        {company.notes.trim() ? (
          <section
            aria-labelledby="company-notes-heading"
            className="border-t p-4"
          >
            <h3 id="company-notes-heading" className="text-sm font-semibold">
              Notes
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {company.notes}
            </p>
          </section>
        ) : null}

        <footer
          aria-label="Record metadata"
          className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border p-4"
        >
          <MetadataField
            label="Created at"
            value={timestampLabel(company.createdAt)}
          />
          <MetadataField
            label="Updated at"
            value={timestampLabel(company.updatedAt)}
          />
          <p className="col-span-2 truncate font-mono text-[11px] text-muted-foreground">
            ID {company.id}
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
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm">{value || "Not listed"}</dd>
    </div>
  );
}

function safeWebsite(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostname(value: string) {
  return new URL(value).hostname.replace(/^www\./, "");
}

function timestampLabel(value: string) {
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
