import { useSearchParams } from "react-router";
import { jobsListQuerySchema } from "@surface/contracts";
import { useProfile } from "@/features/profile/profile-query";
import { DiscoveryScreen } from "@/features/discovery/components/discovery-screen";

export function Component() {
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useProfile();
  const search = Object.fromEntries(searchParams);
  if (!search.view && (!search.status || search.status === "inbox")) {
    search.view =
      profile.data && !search.companyId && !search.search && !search.sourceIds
        ? "matches"
        : "all";
  }
  const parsedFilters = jobsListQuerySchema.safeParse(search);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : jobsListQuerySchema.parse({});

  function change(patch: Record<string, string | undefined>) {
    // History updates before React commits navigation. Merge against the live
    // URL so rapid choices cannot overwrite the previous selection.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <DiscoveryScreen
      filters={filters}
      parameters={searchParams.toString()}
      selectedId={searchParams.get("job")}
      change={change}
    />
  );
}
