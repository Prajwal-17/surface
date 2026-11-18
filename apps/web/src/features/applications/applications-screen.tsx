import { OutreachComposer } from "@/features/outreach/outreach-composer";
import { useEffect, useRef, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  applicationStatusSchema,
  type Application,
  type ApplicationStatus,
} from "@surface/contracts";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LoadingRows } from "@/components/feedback/loading-state";
import { apiClient } from "@/lib/api-client";
import {
  applicationKeys,
  applicationLabels,
  getApplications,
  useSaveApplication,
} from "./application-api";

const selectStyle =
  "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
}

function StatusOptions() {
  return applicationStatusSchema.options.map((status) => (
    <option key={status} value={status}>
      {applicationLabels[status]}
    </option>
  ));
}

const statusTones: Record<ApplicationStatus, string> = {
  queued: "tone-blue",
  applied: "tone-mint",
  contacted: "tone-blue",
  in_conversation: "tone-mint",
  closed: "tone-muted",
  ignored: "tone-muted",
};

export function ApplicationsScreen() {
  const [params, setParams] = useSearchParams();
  const update = useSaveApplication();
  const list = useQuery({
    queryKey: applicationKeys,
    queryFn: getApplications,
  });
  const companies = useQuery({
    queryKey: ["application-company-options"],
    queryFn: () => apiClient<{ id: string; name: string }[]>("/api/companies"),
  });
  const listRef = useRef<HTMLDivElement>(null);
  const item = params.get("application");
  const company = params.get("company");
  const archive = params.get("archive") ?? "active";
  const status = params.get("status") ?? "all";
  const sort = params.get("sort") ?? "recent";
  const q = params.get("q") ?? "";
  const selected = list.data?.find((row) => row.id === item);
  const creating = params.get("new") === "1";
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (item || creating) backRef.current?.focus({ preventScroll: true });
  }, [item, creating]);
  const detail = Boolean(creating || item);
  const selectedCompany = companies.data?.find((row) => row.id === company);
  const companyNames = [
    ...new Set((list.data ?? []).map((row) => row.companyName)),
  ].toSorted((a, b) => a.localeCompare(b));

  function patch(values: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next, { replace: true, preventScrollReset: true });
  }

  function closeDetail() {
    patch({ application: null, new: null });
    requestAnimationFrame(() => {
      const target =
        item &&
        listRef.current?.querySelector<HTMLButtonElement>(
          `[data-application-id="${CSS.escape(item)}"]`,
        );
      (target || listRef.current?.querySelector("h1"))?.focus();
    });
  }

  const rows = (list.data ?? [])
    .filter(
      (row) =>
        (archive === "all" ||
          (archive === "archived") === Boolean(row.archivedAt)) &&
        (status === "all" || row.status === status) &&
        (!company ||
          row.companyId === company ||
          row.companyName === company) &&
        (!q ||
          `${row.title} ${row.companyName}`
            .toLowerCase()
            .includes(q.trim().toLowerCase())),
    )
    .toSorted((a, b) => {
      if (sort === "applied")
        return (b.appliedOn ?? "").localeCompare(a.appliedOn ?? "");
      if (sort === "followup")
        return (a.followUpOn ?? "9999").localeCompare(b.followUpOn ?? "9999");
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden lg:flex-row">
      <section
        ref={listRef}
        className={`min-w-0 flex-1 overflow-y-auto px-4 pb-5 pt-5 ${detail ? "max-lg:hidden" : ""}`}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 tabIndex={-1} className="text-xl font-semibold">
            Applications
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {list.isSuccess && (
                <>
                  <span className="font-mono tabular-nums">{rows.length}</span>{" "}
                  {rows.length === 1 ? "record" : "records"}
                </>
              )}
            </p>
            <Button
              size="sm"
              onClick={() => patch({ new: "1", application: null })}
            >
              <Plus /> Add application
            </Button>
          </div>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              aria-label="Search applications"
              placeholder="Search roles or companies…"
              className="pl-8"
              value={q}
              onChange={(event) => patch({ q: event.target.value })}
            />
          </div>
          <select
            aria-label="Filter by status"
            className={selectStyle}
            value={status}
            onChange={(event) =>
              patch({
                status:
                  event.target.value === "all" ? null : event.target.value,
              })
            }
          >
            <option value="all">All statuses</option>
            <StatusOptions />
          </select>
          <select
            aria-label="Filter by company"
            className={`${selectStyle} max-w-40`}
            value={company ?? ""}
            onChange={(event) => patch({ company: event.target.value || null })}
          >
            <option value="">All companies</option>
            {selectedCompany && (
              <option value={selectedCompany.id}>{selectedCompany.name}</option>
            )}
            {companyNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by archive state"
            className={selectStyle}
            value={archive}
            onChange={(event) =>
              patch({
                archive:
                  event.target.value === "active" ? null : event.target.value,
              })
            }
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All records</option>
          </select>
          <select
            aria-label="Sort applications"
            className={selectStyle}
            value={sort}
            onChange={(event) =>
              patch({
                sort:
                  event.target.value === "recent" ? null : event.target.value,
              })
            }
          >
            <option value="recent">Recently updated</option>
            <option value="applied">Date applied</option>
            <option value="followup">Next follow-up</option>
          </select>
        </div>
        {list.isPending && (
          <LoadingRows label="Loading applications" count={4} />
        )}
        {list.error && (
          <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
            <p>{list.error.message}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {list.isSuccess && (
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_7rem_2rem] items-center gap-2 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground max-sm:hidden">
              <span>Role / company</span>
              <span>Status</span>
              <span>{sort === "followup" ? "Follow-up" : "Latest date"}</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const date =
                  sort === "followup"
                    ? row.followUpOn
                    : sort === "applied"
                      ? row.appliedOn
                      : (row.contactedOn ?? row.appliedOn ?? row.updatedAt);
                return (
                  <li
                    key={row.id}
                    className={`grid grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_7rem_2rem] items-center gap-2 px-3 py-2 max-sm:grid-cols-[minmax(0,1fr)_auto_2rem] ${item === row.id ? "bg-accent" : "hover:bg-muted/50"}`}
                  >
                    <button
                      data-application-id={row.id}
                      aria-current={item === row.id ? "true" : undefined}
                      className="min-w-0 rounded-sm text-left"
                      type="button"
                      onClick={() => patch({ application: row.id, new: null })}
                    >
                      <span
                        className="block truncate text-sm font-semibold"
                        title={row.title}
                      >
                        {row.title}
                      </span>
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        title={row.companyName}
                      >
                        {row.companyName}
                      </span>
                    </button>
                    <select
                      aria-label={`Status for ${row.title}`}
                      className={`${selectStyle} ${statusTones[row.status]}`}
                      value={row.status}
                      disabled={update.isPending}
                      onChange={(event) =>
                        update.mutate({
                          id: row.id,
                          fields: {
                            status: applicationStatusSchema.parse(
                              event.target.value,
                            ),
                          },
                        })
                      }
                    >
                      <StatusOptions />
                    </select>
                    <span className="text-xs text-muted-foreground max-sm:hidden">
                      {date ? dateLabel(date) : "—"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${row.archivedAt ? "Restore" : "Archive"} ${row.title}`}
                      title={row.archivedAt ? "Restore" : "Archive"}
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          id: row.id,
                          fields: { archived: !row.archivedAt },
                        })
                      }
                    >
                      {row.archivedAt ? <RotateCcw /> : <Archive />}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {!rows.length && (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <BriefcaseBusiness
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
                <p className="font-medium">No applications match this view</p>
                <p className="text-sm text-muted-foreground">
                  Adjust the filters or add an off-platform application.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
      {detail && (
        <aside
          className="min-w-0 flex-1 overflow-y-auto border-border bg-card lg:max-w-[460px] lg:border-l"
          aria-label="Application details"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              ref={backRef}
              onClick={closeDetail}
            >
              <ArrowLeft /> Back to applications
            </Button>
            {selected && (
              <Badge className={statusTones[selected.status]}>
                {selected.archivedAt
                  ? "Archived"
                  : applicationLabels[selected.status]}
              </Badge>
            )}
          </div>
          {creating || selected ? (
            <ApplicationForm
              key={selected?.id ?? `new-${company}`}
              application={creating ? undefined : selected}
              company={selectedCompany}
              onCreated={(row) =>
                patch({ new: null, application: row.id, status: null })
              }
            />
          ) : list.isPending ? (
            <LoadingRows label="Loading application" count={3} />
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {list.error
                ? "Application details could not load."
                : "Application not found."}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

function ApplicationForm({
  application,
  company,
  onCreated,
}: {
  application?: Application;
  company?: { id: string; name: string };
  onCreated: (row: Application) => void;
}) {
  const save = useSaveApplication();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const fields = {
      title: text("title"),
      companyName: text("companyName"),
      companyId: application?.companyId ?? company?.id ?? null,
      sourceUrl: text("sourceUrl") || null,
      status: applicationStatusSchema.parse(text("status")),
      appliedOn: text("appliedOn") || null,
      contactedOn: text("contactedOn") || null,
      followUpOn: text("followUpOn") || null,
      contactName: text("contactName") || null,
      contactEmail: text("contactEmail") || null,
      outcome: text("outcome") || null,
      notes: String(data.get("notes") ?? ""),
    };
    if (application && fields.sourceUrl === application.sourceUrl) {
      save.mutate({
        id: application.id,
        fields: { ...fields, sourceUrl: undefined },
      });
    } else if (application) {
      save.mutate({ id: application.id, fields });
    } else {
      save.mutate({ fields }, { onSuccess: onCreated });
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-5 px-4 pb-4 pt-5"
    >
      <div>
        <h2 className="break-words text-xl font-semibold">
          {application?.title ?? "Add application"}
        </h2>
        {(application?.companyName ?? company?.name) && (
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {application?.companyName ?? company?.name}
          </p>
        )}
        {application && (
          <div className="mt-2 flex flex-wrap gap-2">
            <OutreachComposer
              target="application"
              id={application.id}
              knownRecipient={application.contactEmail ?? ""}
            />
            {application.companyId && (
              <Button variant="ghost" size="sm" asChild>
                <Link
                  to={`/companies?company=${encodeURIComponent(application.companyId)}&queue=all`}
                >
                  Company <ArrowUpRight />
                </Link>
              </Button>
            )}
            {application.jobId && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/?job=${encodeURIComponent(application.jobId)}`}>
                  Job details <ArrowUpRight />
                </Link>
              </Button>
            )}
            {application.sourceUrl &&
              /^https?:\/\//i.test(application.sourceUrl) && (
                <Button variant="ghost" size="sm" asChild>
                  <a
                    href={application.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Original listing <ArrowUpRight />
                  </a>
                </Button>
              )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 grid gap-1.5 text-sm">
          Role or outreach subject
          <Input
            name="title"
            required
            maxLength={300}
            defaultValue={application?.title}
          />
        </label>
        <label className="col-span-2 grid gap-1.5 text-sm">
          Company
          <Input
            name="companyName"
            required
            maxLength={300}
            defaultValue={application?.companyName ?? company?.name}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Status
          <select
            name="status"
            className={selectStyle}
            defaultValue={application?.status ?? "queued"}
          >
            <StatusOptions />
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          Next follow-up
          <Input
            name="followUpOn"
            type="date"
            defaultValue={application?.followUpOn ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Date applied
          <Input
            name="appliedOn"
            type="date"
            defaultValue={application?.appliedOn ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Date contacted
          <Input
            name="contactedOn"
            type="date"
            defaultValue={application?.contactedOn ?? ""}
          />
        </label>
      </div>
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm">
          Source URL
          <Input
            name="sourceUrl"
            inputMode="url"
            defaultValue={application?.sourceUrl ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Contact name
          <Input
            name="contactName"
            maxLength={250}
            defaultValue={application?.contactName ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Contact email
          <Input
            name="contactEmail"
            type="email"
            defaultValue={application?.contactEmail ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Outcome
          <Input
            name="outcome"
            maxLength={500}
            defaultValue={application?.outcome ?? ""}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Notes
          <Textarea
            name="notes"
            rows={4}
            maxLength={20000}
            defaultValue={application?.notes}
          />
        </label>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-card py-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending
            ? "Saving…"
            : application
              ? "Save changes"
              : "Add application"}
        </Button>
        {save.isSuccess && (
          <span role="status" className="text-sm text-muted-foreground">
            Saved
          </span>
        )}
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
      </div>
    </form>
  );
}
