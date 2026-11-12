import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  companySearchInputSchema,
  type CompanyDiscoverySearch,
} from "@surface/contracts";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { Pause, Play, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { displayDate } from "../company-ui";
export function CompanySearches({
  searches,
  onRun,
}: {
  searches: CompanyDiscoverySearch[];
  onRun: (id: string) => void;
}) {
  const client = useQueryClient(),
    [editing, setEditing] = useState<CompanyDiscoverySearch | "new" | null>(
      null,
    ),
    [source, setSource] = useState<"funding" | "yc">("funding");
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) =>
      apiClient(`/api/company-discovery/searches${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(companySearchInputSchema.parse(body)),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["company-searches"] });
      setEditing(null);
      toast.success("Company search saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const existing = editing && editing !== "new" ? editing : null;
  const list = (s: string) =>
    s
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Saved company searches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your rules once. New companies arrive in Discover.
          </p>
        </div>
        <Button
          onClick={() => {
            setSource("funding");
            setEditing("new");
          }}
        >
          <Plus />
          New search
        </Button>
      </div>
      {!searches.length ? (
        <div className="company-empty">
          <Search />
          <h2>Create your first company search</h2>
          <p>
            Monitor funding news or selected YC batches. Job saved searches stay
            in Activity.
          </p>
        </div>
      ) : (
        <div className="divide-y border-y">
          {searches.map((s) => (
            <article key={s.id} className="company-search-row">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{s.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.source === "yc"
                    ? `YC · ${s.batches.join(", ")}`
                    : `Funding news · ${s.stages.join(", ") || "All stages"} · ${s.recencyDays} days`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.keywords.join(", ") || "All industries"}
                  {s.geography.length ? ` · ${s.geography.join(", ")}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {s.schedule === "daily"
                    ? `Daily at ${s.timeOfDay} · ${s.timezone}`
                    : "Manual runs"}{" "}
                  · {s.paused ? "Paused" : `Next ${displayDate(s.nextRunAt)}`}
                  <br />
                  Last run {displayDate(s.lastRunAt)}
                  {s.latestCounts
                    ? ` · ${s.latestCounts.new} new · ${s.latestCounts.updated} updated · ${s.latestCounts.unresolved} unresolved · ${s.latestCounts.failed} failed`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className={`status-pill ${s.paused ? "tone-muted" : "tone-mint"}`}
                >
                  {s.paused ? "Paused" : "Active"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={s.paused}
                  onClick={() => onRun(s.id)}
                >
                  <Play />
                  Run now
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${s.paused ? "Resume" : "Pause"} ${s.name}`}
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({ id: s.id, body: { ...s, paused: !s.paused } })
                  }
                >
                  {s.paused ? <Play /> : <Pause />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${s.name}`}
                  onClick={() => {
                    setSource(s.source);
                    setEditing(s);
                  }}
                >
                  <Pencil />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Editing a rule affects future runs. Discovered companies and your
        decisions remain available.
      </p>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {existing ? "Edit company search" : "New company search"}
            </DialogTitle>
            <DialogDescription>
              Daily at 9:00 am in Asia/Kolkata by default.
            </DialogDescription>
          </DialogHeader>
          <form
            key={existing?.id ?? "new"}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              save.mutate({
                id: existing?.id,
                body: {
                  name: d.get("name"),
                  source,
                  keywords: list(String(d.get("keywords") || "")),
                  geography: list(String(d.get("geography") || "")),
                  stages: d.getAll("stage"),
                  recencyDays: Number(d.get("recencyDays") || 30),
                  batches: list(String(d.get("batches") || "")),
                  fundingSources:
                    source === "funding"
                      ? d.getAll("fundingSource")
                      : ["techcrunch"],
                  timeOfDay: d.get("timeOfDay"),
                  timezone: d.get("timezone"),
                  schedule: d.get("schedule"),
                  paused: existing?.paused ?? false,
                },
              });
            }}
          >
            <label className="company-field">
              Name
              <Input
                required
                name="name"
                maxLength={200}
                defaultValue={existing?.name}
                placeholder="Early-stage developer tools"
              />
            </label>
            <label className="company-field">
              Discovery source
              <Select
                value={source}
                onValueChange={(value) => setSource(value as typeof source)}
              >
                <SelectTrigger aria-label="Discovery source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="funding">Funding news</SelectItem>
                  <SelectItem value="yc">Y Combinator</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="company-field">
              Industries or keywords
              <Input
                name="keywords"
                defaultValue={existing?.keywords.join(", ")}
                placeholder="Developer tools, infrastructure"
              />
              <span>
                Separate with commas. Matches any keyword in page evidence.
              </span>
            </label>
            {source === "yc" ? (
              <label className="company-field">
                YC batches
                <Input
                  name="batches"
                  required
                  defaultValue={existing?.batches.join(", ")}
                  placeholder="Fall 2026, Summer 2026"
                />
                <span>Use full batch names, separated by commas.</span>
              </label>
            ) : (
              <>
                <fieldset className="company-field">
                  <legend>Funding stages</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {[
                      "pre-seed",
                      "seed",
                      "series-a",
                      "series-b",
                      "series-c",
                      "growth",
                    ].map((stage) => (
                      <label
                        key={stage}
                        className="flex min-h-11 items-center gap-2 font-normal capitalize md:min-h-8"
                      >
                        <Checkbox
                          name="stage"
                          value={stage}
                          defaultChecked={existing?.stages.includes(
                            stage as (typeof existing.stages)[number],
                          )}
                        />
                        {stage.replaceAll("-", " ")}
                      </label>
                    ))}
                  </div>
                  <span>Leave empty for all stages.</span>
                </fieldset>
                <label className="company-field">
                  Recency window (days)
                  <Input
                    type="number"
                    name="recencyDays"
                    min={1}
                    max={365}
                    defaultValue={existing?.recencyDays ?? 30}
                  />
                </label>
                <fieldset className="company-field">
                  <legend>Publishers</legend>
                  <div className="flex flex-wrap gap-3">
                    {["techcrunch"].map((s) => (
                      <label
                        key={s}
                        className="flex min-h-11 items-center gap-2 font-normal md:min-h-8"
                      >
                        <Checkbox
                          name="fundingSource"
                          value={s}
                          defaultChecked={
                            existing
                              ? existing.fundingSources.includes(
                                  s as (typeof existing.fundingSources)[number],
                                )
                              : s === "techcrunch"
                          }
                        />
                        {
                          (
                            {
                              techcrunch: "TechCrunch",
                              venturebeat: "VentureBeat",
                              businesswire: "Business Wire",
                              prnewswire: "PR Newswire",
                            } as Record<string, string>
                          )[s]
                        }
                      </label>
                    ))}
                  </div>
                  <span>
                    More publishers can be added through company URL intake.
                  </span>
                </fieldset>
              </>
            )}
            <label className="company-field">
              Geography preferences · optional
              <Input
                name="geography"
                defaultValue={existing?.geography.join(", ")}
                placeholder="India, remote"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="company-field">
                Schedule
                <Select
                  name="schedule"
                  defaultValue={existing?.schedule ?? "daily"}
                >
                  <SelectTrigger aria-label="Schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="manual">Manual only</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="company-field">
                Local time
                <Input
                  type="time"
                  name="timeOfDay"
                  required
                  defaultValue={existing?.timeOfDay ?? "09:00"}
                />
              </label>
            </div>
            <label className="company-field">
              Timezone
              <Input
                name="timezone"
                required
                defaultValue={existing?.timezone ?? "Asia/Kolkata"}
              />
            </label>
            <Button disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save search"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
