import { useSearchParams } from "react-router";
import { jobsListQuerySchema } from "@surface/contracts";
import { DiscoveryScreen } from "@/features/discovery/components/discovery-screen";

export function Opportunities() {
  const [params, setParams] = useSearchParams();
  const parsed = jobsListQuerySchema.safeParse({
    ...Object.fromEntries(params),
    status: "inbox",
    view: params.get("view") ?? "all",
  });
  const filters = parsed.success
    ? parsed.data
    : jobsListQuerySchema.parse({ view: "all" });

  function change(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <DiscoveryScreen
      filters={filters}
      parameters={params.toString()}
      selectedId={params.get("job")}
      change={change}
    />
  );
}
