"use client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { LoadingCards, LoadingRows } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompanyMark } from "@/components/ui/company-mark";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  companySchema,
  configuredSourceSchema,
  sourceInspectionSchema,
  type Company,
  type ConfiguredSource,
  type SourceInspection,
} from "backend/contracts";
import {
  Archive,
  ArrowUpRight,
  Building2,
  Check,
  Globe2,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
export function CompaniesScreen({
  sourcesOnly = false,
}: {
  sourcesOnly?: boolean;
}) {
  const client = useQueryClient();
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: async () =>
      companySchema.array().parse(await apiClient("/api/companies")),
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () =>
      configuredSourceSchema.array().parse(await apiClient("/api/sources")),
  });
  const [editing, setEditing] = useState<Company | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceEditing, setSourceEditing] = useState<ConfiguredSource | null>(
    null,
  );
  const [showArchived, setShowArchived] = useState(false);
  const [urls, setUrls] = useState("");
  const [owner, setOwner] = useState("");
  const [inspected, setInspected] = useState<SourceInspection[]>([]);
  const mutate = useMutation({
    mutationFn: async ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body: unknown;
    }) => apiClient(path, { method, body: JSON.stringify(body) }),
    onSuccess: async (_, variables) => {
      await client.invalidateQueries({ queryKey: ["companies"] });
      await client.invalidateQueries({ queryKey: ["sources"] });
      await client.invalidateQueries({ queryKey: ["runs"] });
      toast.success(
        variables.path.endsWith("/refresh")
          ? "Collection queued"
          : "Changes saved",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const inspect = useMutation({
    mutationFn: async () =>
      sourceInspectionSchema.array().parse(
        await apiClient("/api/sources/inspect", {
          method: "POST",
          body: JSON.stringify({ urls: urls.split(/\s+/).filter(Boolean) }),
        }),
      ),
    onSuccess: setInspected,
    onError: (e) => toast.error(e.message),
  });
  const sourceList = (
    <div className="space-y-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Job sources</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Public boards and feeds that bring opportunities into your inbox.
          </p>
        </div>
        <Button onClick={() => setSourceOpen(true)}>
          <Plus />
          Add source
        </Button>
      </div>
      {sources.error && (
        <p role="alert" className="text-destructive">
          {sources.error.message}
        </p>
      )}
      {sources.isPending && <LoadingRows label="Loading sources" count={3} />}
      {sources.data?.map((source) => (
        <Card
          key={source.id}
          className="panel flex flex-wrap items-start gap-4 p-4"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-brand">
            <Globe2 className="size-5" />
          </span>
          <div className="min-w-[160px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{source.label}</h3>
              <span
                className={`status-pill ${source.paused ? "tone-muted" : source.support === "unsupported" ? "tone-amber" : "tone-mint"}`}
              >
                {source.paused
                  ? "Paused"
                  : source.support === "unsupported"
                    ? "Unavailable"
                    : source.scheduleHours
                      ? "Monitoring"
                      : "Manual"}
              </span>
            </div>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex max-w-full items-center gap-1 text-xs text-brand"
            >
              <span className="truncate">
                {new URL(source.url).hostname}
                {new URL(source.url).pathname === "/"
                  ? ""
                  : new URL(source.url).pathname}
              </span>
              <ArrowUpRight className="size-3 shrink-0" />
            </a>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {companies.data?.find((c) => c.id === source.companyId)?.name ??
                "Independent source"}{" "}
              · {source.provider}
            </p>
            {source.support === "unsupported" && (
              <p className="mt-2 text-xs leading-5 text-warning">
                {source.reason}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={
                mutate.isPending ||
                source.paused ||
                source.support === "unsupported"
              }
              onClick={() =>
                mutate.mutate({
                  path: `/api/sources/${source.id}/refresh`,
                  method: "POST",
                  body: {},
                })
              }
            >
              <RefreshCw />
              Refresh
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={mutate.isPending}
              title={source.paused ? "Resume monitoring" : "Pause monitoring"}
              aria-label={`${source.paused ? "Resume" : "Pause"} ${source.label}`}
              onClick={() =>
                mutate.mutate({
                  path: `/api/sources/${source.id}`,
                  method: "PUT",
                  body: { ...source, paused: !source.paused },
                })
              }
            >
              {source.paused ? <Play /> : <Pause />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Edit source"
              aria-label={`Edit ${source.label}`}
              onClick={() => setSourceEditing(source)}
            >
              <Pencil />
            </Button>
          </div>
        </Card>
      ))}
      {sources.data?.length === 0 && (
        <div className="panel grid place-items-center gap-3 px-5 py-14 text-center">
          <Globe2 className="size-8 text-brand" />
          <h3 className="font-semibold">No sources yet</h3>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            Add an ATS board or a public job URL. Surface will inspect what can
            be collected.
          </p>
        </div>
      )}
    </div>
  );
  return (
    <div
      className={sourcesOnly ? "space-y-5" : "mx-auto max-w-7xl space-y-4 pb-4"}
    >
      {!sourcesOnly && (
        <>
          <h1 className="sr-only">Companies</h1>
          <Tabs defaultValue="companies">
            <div className="section-toolbar">
              <TabsList>
                <TabsTrigger value="companies" className="gap-2">
                  <Building2 className="size-4" />
                  Watchlist{" "}
                  <span className="ml-1 text-muted-foreground">
                    {companies.data?.filter((c) => !c.archived).length ?? 0}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="sources" className="gap-2">
                  <Globe2 className="size-4" />
                  Sources{" "}
                  <span className="ml-1 text-muted-foreground">
                    {sources.data?.length ?? 0}
                  </span>
                </TabsTrigger>
              </TabsList>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setCompanyOpen(true);
                }}
              >
                <Plus />
                Watch a company
              </Button>
            </div>
            <TabsContent value="companies">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-label">
                  {showArchived
                    ? "Archived companies"
                    : "Companies you're watching"}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive />
                  {showArchived ? "Show watchlist" : "View archived"}
                </Button>
              </div>
              {companies.error && (
                <p role="alert" className="text-destructive">
                  {companies.error.message}
                </p>
              )}
              {companies.isPending && (
                <LoadingCards label="Loading companies" />
              )}
              <div className="company-grid">
                {companies.data
                  ?.filter((c) => c.archived === showArchived)
                  .map((company) => (
                    <Card
                      key={company.id}
                      className="company-card panel flex flex-col p-5"
                    >
                      <div className="flex items-start gap-3">
                        <CompanyMark name={company.name} />
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-base font-bold">
                            {company.name}
                          </h3>
                          {company.website && (
                            <a
                              className="mt-1 inline-flex items-center gap-1 text-xs text-brand"
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {new URL(company.website).hostname}
                              <ArrowUpRight className="size-3" />
                            </a>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${company.name}`}
                          onClick={() => {
                            setEditing(company);
                            setCompanyOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                      </div>
                      <p className="my-5 flex-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {company.watchReason ||
                          "Add a reason for watching this company."}
                      </p>
                      {company.notes && (
                        <Collapsible className="mb-4 text-xs text-muted-foreground">
                          <CollapsibleTrigger>Notes</CollapsibleTrigger>
                          <CollapsibleContent>
                            <p className="mt-2 whitespace-pre-wrap leading-6">
                              {company.notes}
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      <div className="flex items-center gap-2 border-t pt-4">
                        <span className="status-pill tone-blue">
                          <Link2 className="size-3" />
                          {sources.data?.filter(
                            (src) => src.companyId === company.id,
                          ).length ?? 0}{" "}
                          sources
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => {
                            setOwner(company.id);
                            setSourceOpen(true);
                          }}
                        >
                          <Plus />
                          Source
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={mutate.isPending}
                          title={
                            company.archived
                              ? "Restore company"
                              : "Archive company"
                          }
                          aria-label={`${company.archived ? "Restore" : "Archive"} ${company.name}`}
                          onClick={() =>
                            mutate.mutate({
                              path: `/api/companies/${company.id}`,
                              method: "PUT",
                              body: { ...company, archived: !company.archived },
                            })
                          }
                        >
                          <Archive />
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
              {companies.data?.filter((c) => c.archived === showArchived)
                .length === 0 && (
                <div className="panel flex flex-col items-center px-6 py-16 text-center">
                  <div className="mb-5 grid size-16 place-items-center rounded-lg bg-secondary">
                    <Building2 className="size-7 text-brand" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {showArchived
                      ? "No archived companies"
                      : "Build your watchlist"}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    {showArchived
                      ? "Companies you archive remain available here."
                      : "Save a company, note what draws you to it, and connect its job board to start monitoring."}
                  </p>
                  {!showArchived && (
                    <Button
                      className="mt-5"
                      onClick={() => {
                        setEditing(null);
                        setCompanyOpen(true);
                      }}
                    >
                      <Plus />
                      Add your first company
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="sources">{sourceList}</TabsContent>
          </Tabs>
        </>
      )}
      {sourcesOnly && sourceList}
      <Dialog open={companyOpen} onOpenChange={setCompanyOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit company" : "Watch a company"}
            </DialogTitle>
            <DialogDescription>
              Add a company and keep your research in one place.
            </DialogDescription>
          </DialogHeader>
          <form
            key={editing?.id ?? "new"}
            className="mt-2 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              try {
                await mutate.mutateAsync({
                  path: editing
                    ? `/api/companies/${editing.id}`
                    : "/api/companies",
                  method: editing ? "PUT" : "POST",
                  body: {
                    name: data.get("name"),
                    website: data.get("website"),
                    notes: data.get("notes"),
                    watchReason: data.get("watchReason"),
                    archived: editing?.archived ?? false,
                  },
                });
                setEditing(null);
                setCompanyOpen(false);
              } catch {
                /* Toast reports mutation failure. */
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-medium">
                Company name
                <Input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={editing?.name}
                  placeholder="e.g. Linear"
                />
              </label>
              <label className="grid gap-2 text-xs font-medium">
                Official website
                <Input
                  name="website"
                  type="url"
                  defaultValue={editing?.website}
                  placeholder="https://company.com"
                />
              </label>
            </div>
            <label className="grid gap-2 text-xs font-medium">
              What draws you to this company?
              <Textarea
                name="watchReason"
                defaultValue={editing?.watchReason}
                placeholder="The product, the team, the problem they're solving…"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium">
              Notes
              <Textarea
                name="notes"
                defaultValue={editing?.notes}
                placeholder="Anything you want to remember"
              />
            </label>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCompanyOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={mutate.isPending}>
                {mutate.isPending ? "Saving…" : "Save company"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect a job source</DialogTitle>
            <DialogDescription>
              Paste a public board or posting. We'll show what Surface can
              collect before you save.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <label className="grid gap-2 text-xs font-medium">
              Job URLs · one per line
              <Textarea
                rows={4}
                value={urls}
                onChange={(e) => {
                  setUrls(e.target.value);
                  setInspected([]);
                }}
                placeholder="https://boards.greenhouse.io/company"
              />
            </label>
            <label className="grid gap-2 text-xs font-medium">
              Link to a company
              <Select
                value={owner || "independent"}
                onValueChange={(value) =>
                  setOwner(value === "independent" ? "" : value)
                }
              >
                <SelectTrigger aria-label="Link to a company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">
                    Independent source / cross-company feed
                  </SelectItem>
                  {companies.data
                    ?.filter((c) => !c.archived)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              disabled={inspect.isPending || !urls.trim()}
              onClick={() => inspect.mutate()}
            >
              <Link2 />
              {inspect.isPending ? "Checking URLs…" : "Inspect sources"}
            </Button>
            {inspected.map((item, i) => (
              <div
                key={item.url}
                className="rounded-xl border bg-secondary/40 p-4"
              >
                <p className="mb-2 break-all text-xs text-brand">{item.url}</p>
                <span
                  className={`status-pill ${item.support === "unsupported" ? "tone-amber" : "tone-mint"}`}
                >
                  {item.provider} · {item.support}
                </span>
                <p className="my-3 text-xs leading-5 text-muted-foreground">
                  {item.reason}
                </p>
                <Button
                  size="sm"
                  disabled={mutate.isPending}
                  onClick={async () => {
                    try {
                      await mutate.mutateAsync({
                        path: "/api/sources",
                        method: "POST",
                        body: { url: item.url, companyId: owner || null },
                      });
                      setInspected((rows) => rows.filter((_, j) => i !== j));
                    } catch {
                      /* Toast reports mutation failure. */
                    }
                  }}
                >
                  <Check />
                  Save source
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(sourceEditing)}
        onOpenChange={(open) => !open && setSourceEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit source</DialogTitle>
            <DialogDescription>
              Update its label, public endpoint, or company.
            </DialogDescription>
          </DialogHeader>
          {sourceEditing && (
            <form
              key={sourceEditing.id}
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                try {
                  await mutate.mutateAsync({
                    path: `/api/sources/${sourceEditing.id}`,
                    method: "PUT",
                    body: {
                      ...sourceEditing,
                      label: data.get("label"),
                      url: data.get("url"),
                      companyId:
                        data.get("companyId") === "independent"
                          ? null
                          : data.get("companyId") || null,
                    },
                  });
                  setSourceEditing(null);
                } catch {
                  /* Toast reports mutation failure. */
                }
              }}
            >
              <label className="grid gap-2 text-xs">
                Label
                <Input name="label" defaultValue={sourceEditing.label} />
              </label>
              <label className="grid gap-2 text-xs">
                URL
                <Input
                  type="url"
                  name="url"
                  required
                  defaultValue={sourceEditing.url}
                />
              </label>
              <label className="grid gap-2 text-xs">
                Company
                <Select
                  name="companyId"
                  defaultValue={sourceEditing.companyId ?? "independent"}
                >
                  <SelectTrigger aria-label="Company">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="independent">
                      Independent source
                    </SelectItem>
                    {companies.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button disabled={mutate.isPending}>Save changes</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
