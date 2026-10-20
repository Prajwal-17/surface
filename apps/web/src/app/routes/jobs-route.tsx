import { useSearchParams } from "react-router";
import { jobsListQuerySchema } from "@surface/contracts";
import { DiscoveryScreen } from "@/features/discovery/components/discovery-screen";

export function Component() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = Object.fromEntries(searchParams);
  const parsedFilters = jobsListQuerySchema.safeParse(search);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : jobsListQuerySchema.parse({});

  function change(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
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
