import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { configuredSourceSchema, savedSearchSchema } from "@surface/contracts";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Bookmark } from "lucide-react";
export function SavedSearches({
  parameters,
  onSelectSearch,
}: {
  parameters: string;
  onSelectSearch: (filters: Record<string, string>) => void;
}) {
  const client = useQueryClient(),
    [name, setName] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () =>
      configuredSourceSchema.array().parse(await apiClient("/api/sources")),
  });
  const searches = useQuery({
    queryKey: ["saved-searches"],
    queryFn: async () =>
      savedSearchSchema.array().parse(await apiClient("/api/saved-searches")),
  });
  const save = useMutation({
    mutationFn: () =>
      apiClient("/api/saved-searches", {
        method: "POST",
        body: JSON.stringify({
          name,
          query: new URLSearchParams(parameters).get("search") ?? "",
          sourceIds: selected,
          filters: Object.fromEntries(
            [...new URLSearchParams(parameters)].filter(
              ([key]) => !["page", "job"].includes(key),
            ),
          ),
        }),
      }),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["saved-searches"] });
      toast.success("Search saved");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
        >
          <Bookmark className="size-4" />
          <span className="max-sm:sr-only">
            Saved searches
            {searches.data?.length ? ` · ${searches.data.length}` : ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[75svh] w-[min(420px,calc(100vw-2rem))] overflow-y-auto">
        <div className="space-y-4">
          {searches.data?.map((search) => (
            <div key={search.id} className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const params = new URLSearchParams(search.filters);
                  params.set("search", search.query);
                  params.set("sourceIds", search.sourceIds.join(","));
                  onSelectSearch(Object.fromEntries(params.entries()));
                }}
              >
                {search.name}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await apiClient(
                      `/api/saved-searches/${search.id}/refresh`,
                      {
                        method: "POST",
                        body: "{}",
                      },
                    );
                    void client.invalidateQueries({ queryKey: ["runs"] });
                    toast.success(
                      "Collection queued; inspect Activity for progress",
                    );
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Refresh failed",
                    );
                  }
                }}
              >
                Refresh sources
              </Button>
              <Collapsible className="w-full">
                <CollapsibleTrigger className="cursor-pointer text-sm text-muted-foreground">
                  Edit saved search
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <form
                    className="mt-3 space-y-3 rounded-md border p-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      try {
                        const replace = data.get("replaceFilters") === "on";
                        await apiClient(`/api/saved-searches/${search.id}`, {
                          method: "PUT",
                          body: JSON.stringify({
                            ...search,
                            name: data.get("name"),
                            sourceIds: data.getAll("sourceIds"),
                            ...(replace
                              ? {
                                  query:
                                    new URLSearchParams(parameters).get(
                                      "search",
                                    ) ?? "",
                                  filters: Object.fromEntries(
                                    [...new URLSearchParams(parameters)].filter(
                                      ([key]) => !["page", "job"].includes(key),
                                    ),
                                  ),
                                }
                              : {}),
                          }),
                        });
                        await client.invalidateQueries({
                          queryKey: ["saved-searches"],
                        });
                        toast.success("Search updated");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Update failed",
                        );
                      }
                    }}
                  >
                    <label className="grid gap-2 text-sm">
                      Name
                      <Input name="name" required defaultValue={search.name} />
                    </label>
                    <fieldset>
                      <legend className="text-sm">Selected sources</legend>
                      <div className="flex flex-wrap gap-3">
                        {sources.data?.map((source) => (
                          <label
                            key={source.id}
                            className="flex min-h-10 items-center gap-2 text-sm"
                          >
                            <Checkbox
                              name="sourceIds"
                              value={source.id}
                              defaultChecked={search.sourceIds.includes(
                                source.id,
                              )}
                            />
                            {source.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <Checkbox name="replaceFilters" />
                      Replace this search with the current filters
                    </label>
                    <Button>Save search changes</Button>
                  </form>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
          <form
            className="space-y-3 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <label className="grid gap-2 text-sm">
              Save current filters as
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Search name"
              />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm">Sources to monitor</legend>
              <div className="flex flex-wrap gap-4">
                {sources.data?.map((source) => (
                  <label
                    key={source.id}
                    className="flex min-h-10 items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selected.includes(source.id)}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked === true
                            ? [...selected, source.id]
                            : selected.filter((id) => id !== source.id),
                        )
                      }
                    />
                    {source.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button disabled={save.isPending || !selected.length}>
              Save search
            </Button>
            <p className="text-xs text-muted-foreground">
              Default: every 12 hours. Manage schedules in Activity.
            </p>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
