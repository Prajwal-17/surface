import { OutreachComposer } from "@/features/outreach/outreach-composer";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowUpRight, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  companyDetailSchema,
  companyTrackingStatusSchema,
  trackedCompanySchema,
  type CompanyTrackingStatus,
} from "@surface/contracts";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingRows } from "@/components/feedback/loading-state";
import { apiClient } from "@/lib/api-client";
import {
  applicationKeys,
  applicationLabels,
  getApplications,
} from "@/features/applications/application-api";
import { CompanyReader } from "./company-reader";

const statuses: Record<CompanyTrackingStatus, string> = {
  watching: "Watching",
  queued: "In queue",
  contacted: "Contacted",
  ignored: "Ignored",
};

function CompanyStatusOptions() {
  return companyTrackingStatusSchema.options.map((status) => (
    <SelectItem key={status} value={status}>
      {statuses[status]}
    </SelectItem>
  ));
}

export function TrackedCompanies() {
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const client = useQueryClient();
  const selectedId = params.get("company");
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const archive = params.get("archive") ?? "active";
  const sort = params.get("sort") ?? "name";
  const list = useQuery({
    queryKey: ["tracked-companies"],
    queryFn: async () =>
      trackedCompanySchema
        .array()
        .parse(await apiClient("/api/tracked-companies")),
  });
  const selected = useQuery({
    queryKey: ["company-detail", selectedId],
    queryFn: async () =>
      companyDetailSchema.parse(
        await apiClient(
          `/api/company-discovery/companies/${encodeURIComponent(selectedId!)}`,
        ),
      ),
    enabled: Boolean(selectedId),
  });
  const applications = useQuery({
    queryKey: applicationKeys,
    queryFn: getApplications,
    enabled: Boolean(selectedId),
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      apiClient<{ id: string }>(path, {
        method,
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          "tracked-companies",
          "companies",
          "company-detail",
          "company-opportunities",
          "runs",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    },
    onError: (error) => toast.error(error.message),
  });

  function patch(fields: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    if (["q", "status", "archive", "sort"].some((key) => key in fields))
      next.delete("page");
    for (const [key, value] of Object.entries(fields)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  }
  function closeReader() {
    patch({ company: null });
    requestAnimationFrame(() => {
      const target =
        selectedId &&
        document.querySelector<HTMLButtonElement>(
          `[data-tracked-company="${CSS.escape(selectedId)}"]`,
        );
      if (target) target.focus();
      else document.getElementById("tracked-companies-title")?.focus();
    });
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate(
      {
        path: "/api/companies",
        body: { name: form.get("name"), website: form.get("website") },
      },
      {
        onSuccess: (company) => {
          setAdding(false);
          patch({ company: company.id, archive: null, q: null, status: null });
        },
      },
    );
  }
  const rows = (list.data ?? [])
    .filter(
      (company) =>
        (archive === "all" || (archive === "archived") === company.archived) &&
        (status === "all" || company.trackingStatus === status) &&
        company.name.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .toSorted((a, b) => {
      if (sort === "recent") return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "opening")
        return (b.newestOpening ?? "").localeCompare(a.newestOpening ?? "");
      return a.name.localeCompare(b.name);
    });
  const pageSize = 60;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(
    pages,
    Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
  );
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden lg:flex-row">
      <section
        className={`min-w-0 flex-1 overflow-y-auto px-4 pb-5 pt-5 ${selectedId ? "max-lg:hidden" : ""}`}
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1
            id="tracked-companies-title"
            tabIndex={-1}
            className="text-xl font-semibold"
          >
            Companies
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings?section=sources">Manage sources</Link>
            </Button>
            <Dialog open={adding} onOpenChange={setAdding}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus /> Add company
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add company</DialogTitle>
                  <DialogDescription>
                    Save a company to watch or contact.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={add} className="grid gap-3">
                  <label className="grid gap-1.5 text-sm">
                    Name
                    <Input name="name" required maxLength={200} />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Website
                    <Input name="website" type="url" />
                  </label>
                  <Button
                    className="justify-self-end"
                    type="submit"
                    disabled={mutation.isPending}
                  >
                    Add company
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </header>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              aria-label="Search by company name"
              placeholder="Search companies…"
              className="pl-8"
              value={q}
              onChange={(event) => patch({ q: event.target.value })}
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) =>
              patch({ status: value === "all" ? null : value })
            }
          >
            <SelectTrigger
              aria-label="Filter companies by status"
              className="min-w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <CompanyStatusOptions />
            </SelectContent>
          </Select>
          <Select
            value={archive}
            onValueChange={(value) =>
              patch({ archive: value === "active" ? null : value })
            }
          >
            <SelectTrigger
              aria-label="Filter companies by archive state"
              className="min-w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All companies</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) =>
              patch({ sort: value === "name" ? null : value })
            }
          >
            <SelectTrigger aria-label="Sort companies" className="min-w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Company name</SelectItem>
              <SelectItem value="recent">Recently updated</SelectItem>
              <SelectItem value="opening">Newest opening</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {list.isPending && <LoadingRows count={4} label="Loading companies" />}
        {list.error && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-2">
            {list.error.message}
            <Button variant="outline" onClick={() => void list.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {list.isSuccess && (
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_10rem_2rem] items-center gap-2 border-b bg-card px-3 py-2 text-xs text-muted-foreground max-sm:hidden">
              <span>Company</span>
              <span>Status</span>
              <span>Activity</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {visibleRows.map((company) => (
                <li
                  key={company.id}
                  className={`grid grid-cols-[minmax(0,1fr)_7rem_10rem_2rem] items-center gap-2 px-3 py-2 max-sm:grid-cols-[minmax(0,1fr)_7rem_2rem] ${selectedId === company.id ? "bg-accent" : "hover:bg-muted/50"}`}
                >
                  <button
                    data-tracked-company={company.id}
                    type="button"
                    aria-current={
                      selectedId === company.id ? "true" : undefined
                    }
                    className="flex min-w-0 items-center gap-2 rounded-sm text-left font-semibold"
                    onClick={() => patch({ company: company.id })}
                  >
                    <CompanyMark
                      name={company.name}
                      src={company.logoPath}
                      company={company}
                      className="size-7 shrink-0"
                    />
                    <span className="min-w-0 truncate" title={company.name}>
                      {company.name}
                    </span>
                  </button>
                  <Select
                    value={company.trackingStatus}
                    onValueChange={(value) =>
                      mutation.mutate({
                        path: `/api/tracked-companies/${encodeURIComponent(company.id)}`,
                        method: "PATCH",
                        body: { trackingStatus: value },
                      })
                    }
                  >
                    <SelectTrigger
                      aria-label={`Status for ${company.name}`}
                      disabled={mutation.isPending}
                      className="min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <CompanyStatusOptions />
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground max-sm:hidden">
                    {company.openRoles} open · {company.applicationCount}{" "}
                    tracked
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${company.archived ? "Restore" : "Archive"} ${company.name}`}
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        path: `/api/tracked-companies/${encodeURIComponent(company.id)}`,
                        method: "PATCH",
                        body: { archived: !company.archived },
                      })
                    }
                  >
                    {company.archived ? <RotateCcw /> : <Archive />}
                  </Button>
                </li>
              ))}
            </ul>
            {!rows.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No companies match this view.
              </p>
            )}
            {pages > 1 && (
              <nav
                aria-label="Company pages"
                className="flex items-center justify-between gap-3 border-t px-3 py-2"
              >
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {rows.length.toLocaleString()} companies · Page {page} of{" "}
                  {pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => patch({ page: String(page - 1) })}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === pages}
                    onClick={() => patch({ page: String(page + 1) })}
                  >
                    Next
                  </Button>
                </div>
              </nav>
            )}
          </div>
        )}
      </section>
      {selectedId && (
        <aside
          className="min-w-0 flex-1 overflow-y-auto border-border bg-card lg:max-w-[490px] lg:border-l"
          aria-label="Company details"
        >
          {selected.isPending && (
            <LoadingRows count={4} label="Loading company" />
          )}
          {selected.error && (
            <div role="alert" className="p-4">
              {selected.error.message}{" "}
              <Button variant="ghost" onClick={closeReader}>
                Close company reader
              </Button>
            </div>
          )}
          {selected.data && (
            <>
              <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
                <Button variant="secondary" size="sm" asChild>
                  <Link
                    to={`/applications?new=1&company=${encodeURIComponent(selectedId)}`}
                  >
                    <Plus /> Add application
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    to={`/applications?companyId=${encodeURIComponent(selectedId)}`}
                  >
                    Open roles <ArrowUpRight />
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    to={`/companies?company=${encodeURIComponent(selectedId)}&reader=research&expanded=1&queue=all`}
                  >
                    Saved research <ArrowUpRight />
                  </Link>
                </Button>
              </div>
              <div className="px-3 pt-2">
                <OutreachComposer target="company" id={selectedId} />
              </div>
              <CompanyReader
                company={selected.data}
                onClose={closeReader}
                mutate={(input) => mutation.mutateAsync(input)}
                pending={mutation.isPending}
                readerTab="overview"
                onReaderTabChange={(tab) => {
                  if (tab === "research")
                    patch({ reader: "research", expanded: "1", queue: "all" });
                }}
              />
              {applications.data?.some(
                (row) => row.companyId === selectedId,
              ) && (
                <section className="space-y-2 border-t p-4">
                  <h3 className="font-semibold">Applications</h3>
                  {applications.data
                    .filter((row) => row.companyId === selectedId)
                    .map((row) => (
                      <Link
                        key={row.id}
                        className="flex justify-between gap-3 rounded-sm text-sm hover:underline"
                        to={`/applications?application=${encodeURIComponent(row.id)}`}
                      >
                        <span>{row.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {applicationLabels[row.status]}
                        </span>
                      </Link>
                    ))}
                </section>
              )}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
