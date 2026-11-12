import { Navigate, useSearchParams } from "react-router";

export function Component() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q");
  const destination = new URLSearchParams(
    query ? { q: query, queue: "all" } : { hasResearch: "true", queue: "all" },
  );
  return <Navigate to={`/companies?${destination}`} replace />;
}
