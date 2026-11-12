import { Navigate, useParams } from "react-router";

export function Component() {
  const { companyId } = useParams();
  const destination = new URLSearchParams({
    company: companyId ?? "",
    reader: "research",
    expanded: "1",
    queue: "all",
  });
  return <Navigate to={`/companies?${destination}`} replace />;
}
