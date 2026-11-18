import { OutreachComposer } from "@/features/outreach/outreach-composer";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowUpRight,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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

const trackingTones: Record<CompanyTrackingStatus, string> = {
  watching: "tone-blue",
  queued: "tone-muted",
  contacted: "tone-mint",
  ignored: "tone-muted",
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
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const client = useQueryClient();
  const selectedId = params.get("company");
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const archive = params.get("archive") ?? "active";
  const sort = params.get("sort") ?? "name";
  const roles = params.get("roles") ?? "all";
  const apps = params.get("applications") ?? "all";
  const website = params.get("website") ?? "all";
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

  const deletion = useMutation({
    mutationFn: (ids: string[]) =>
      apiClient<{ deleted: number }>(
        "/api/company-discovery/companies/bulk-delete",
        {
          method: "POST",
          body: JSON.stringify({ ids }),
        },
      ),
    onSuccess: async ({ deleted }) => {
      setDeleteIds([]);
      setChecked(new Set());
      if (selectedId && deleteIds.includes(selectedId))
        patch({ company: null });
      await client.invalidateQueries();
      toast.success(
        `Permanently deleted ${deleted} ${deleted === 1 ? "company" : "companies"}`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  function patch(fields: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    if (
      [
        "q",
        "status",
        "archive",
        "sort",
        "roles",
        "applications",
        "website",
      ].some((key) => key in fields)
    )
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
  function countFor(key: string, value: string) {
    const filters = {
      status,
      archive,
      roles,
      applications: apps,
      website,
      [key]: value,
    };
    return (list.data ?? [])
      .filter(
        (company) =>
          (filters.archive === "all" ||
            (filters.archive === "archived") === company.archived) &&
          (filters.status === "all" ||
            company.trackingStatus === filters.status) &&
          (filters.roles === "all" ||
            company.openRoles > 0 === (filters.roles === "yes")) &&
          (filters.applications === "all" ||
            company.applicationCount > 0 ===
              (filters.applications === "yes")) &&
          (filters.website === "all" ||
            Boolean(company.website.trim()) === (filters.website === "yes")) &&
          company.name.toLowerCase().includes(q.trim().toLowerCase()),
      )
      .length.toLocaleString();
  }
  const rows = (list.data ?? [])
    .filter(
      (company) =>
        (archive === "all" || (archive === "archived") === company.archived) &&
        (status === "all" || company.trackingStatus === status) &&
        (roles === "all" || company.openRoles > 0 === (roles === "yes")) &&
        (apps === "all" || company.applicationCount > 0 === (apps === "yes")) &&
        (website === "all" ||
          Boolean(company.website.trim()) === (website === "yes")) &&
        company.name.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .toSorted((a, b) => {
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      if (sort === "roles")
        return b.openRoles - a.openRoles || a.name.localeCompare(b.name);
      if (sort === "applications")
        return (
          b.applicationCount - a.applicationCount ||
          a.name.localeCompare(b.name)
        );
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
            <span
              className="ml-2 align-middle font-mono text-xs font-normal tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {list.isPending
                ? "…"
                : `${rows.length.toLocaleString()} compan${rows.length === 1 ? "y" : "ies"}`}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="company-filters mt-3">
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
              <SelectItem value="all">
                All statuses ({countFor("status", "all")})
              </SelectItem>
              {companyTrackingStatusSchema.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {statuses[option]} ({countFor("status", option)})
                </SelectItem>
              ))}
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
              <SelectItem value="active">
                Active ({countFor("archive", "active")})
              </SelectItem>
              <SelectItem value="archived">
                Archived ({countFor("archive", "archived")})
              </SelectItem>
              <SelectItem value="all">
                All companies ({countFor("archive", "all")})
              </SelectItem>
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
              <SelectItem value="name_desc">Name Z–A</SelectItem>
              <SelectItem value="roles">Most open roles</SelectItem>
              <SelectItem value="applications">Most applications</SelectItem>
              <SelectItem value="recent">Recently updated</SelectItem>
              <SelectItem value="opening">Newest opening</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(
            [
              ["roles", roles, "Open roles"],
              ["applications", apps, "Applications"],
              ["website", website, "Website"],
            ] as const
          ).map(([key, value, label]) => (
            <Select
              key={key}
              value={value}
              onValueChange={(v) => patch({ [key]: v === "all" ? null : v })}
            >
              <SelectTrigger aria-label={`Filter by ${label}`} className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Any {label.toLowerCase()} ({countFor(key, "all")})
                </SelectItem>
                <SelectItem value="yes">
                  Has {label.toLowerCase()} ({countFor(key, "yes")})
                </SelectItem>
                <SelectItem value="no">
                  No {label.toLowerCase()} ({countFor(key, "no")})
                </SelectItem>
              </SelectContent>
            </Select>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={!visibleRows.length}
            onClick={() =>
              setChecked(new Set(visibleRows.map((row) => row.id)))
            }
          >
            Select page
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length || rows.length > 10000}
            onClick={() => setChecked(new Set(rows.map((row) => row.id)))}
          >
            Select all matching
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!list.data?.length || list.data.length > 10000}
            onClick={() =>
              setChecked(new Set((list.data ?? []).map((row) => row.id)))
            }
          >
            Select every company
          </Button>
          {(list.data?.length ?? 0) > 10000 && (
            <span className="text-xs text-muted-foreground">
              Select up to 10,000 companies at a time using filters.
            </span>
          )}
          {checked.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {checked.size.toLocaleString()} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChecked(new Set())}
              >
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={checked.size > 10000}
                onClick={() => setDeleteIds([...checked])}
              >
                Delete selected
              </Button>
            </>
          )}
        </div>
        <Dialog
          open={deleteIds.length > 0}
          onOpenChange={(open) => {
            if (!open && !deletion.isPending) setDeleteIds([]);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Permanently delete {deleteIds.length.toLocaleString()}{" "}
                {deleteIds.length === 1 ? "company" : "companies"}?
              </DialogTitle>
              <DialogDescription>
                This permanently removes the companies and their linked jobs,
                applications, contacts, and other related records. This cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={deletion.isPending}
                onClick={() => setDeleteIds([])}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={deletion.isPending}
                onClick={() => deletion.mutate(deleteIds)}
              >
                {deletion.isPending ? "Deleting…" : "Permanently delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            <div className="grid grid-cols-[1rem_minmax(0,1fr)_7rem_10rem_2rem_2rem] items-center gap-2 border-b bg-card px-3 py-2 text-xs text-muted-foreground max-sm:hidden">
              <span className="sr-only">Select</span>
              <span className="pl-9">Company</span>
              <span className="pl-3">Status</span>
              <span>Activity</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {visibleRows.map((company) => (
                <li
                  key={company.id}
                  className={`grid grid-cols-[1rem_minmax(0,1fr)_7rem_10rem_2rem_2rem] items-center gap-2 px-3 py-2 max-sm:grid-cols-[1rem_minmax(0,1fr)_7rem_2rem_2rem] ${selectedId === company.id ? "bg-accent" : "hover:bg-muted/50"}`}
                >
                  <Checkbox
                    aria-label={`Select ${company.name}`}
                    checked={checked.has(company.id)}
                    onCheckedChange={(value) =>
                      setChecked((previous) => {
                        const next = new Set(previous);
                        if (value === true) next.add(company.id);
                        else next.delete(company.id);
                        return next;
                      })
                    }
                  />
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
                      className={`${trackingTones[company.trackingStatus]} min-w-0`}
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
                    aria-label={`Permanently delete ${company.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteIds([company.id])}
                  >
                    <Trash2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${company.archived ? "Restore" : "Archive"} ${company.name}`}
                    disabled={mutation.isPending}
                    className={`text-muted-foreground ${company.archived ? "hover:text-brand" : "hover:text-destructive"}`}
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
              <CompanyReader
                company={selected.data}
                onClose={closeReader}
                mutate={(input) => mutation.mutateAsync(input)}
                pending={mutation.isPending}
                actions={
                  <>
                    <span className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" asChild>
                        <Link
                          to={`/applications?new=1&company=${encodeURIComponent(selectedId)}`}
                        >
                          <Plus /> Add application
                        </Link>
                      </Button>
                      <OutreachComposer target="company" id={selectedId} />
                    </span>
                    <span className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to={`/applications?companyId=${encodeURIComponent(selectedId)}`}
                        >
                          Open roles <ArrowUpRight />
                        </Link>
                      </Button>
                    </span>
                  </>
                }
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
