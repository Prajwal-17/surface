import { useNavigate, useSearchParams } from "react-router";
import { ResearchLibrary } from "@/features/research/research-library";

export function Component() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <ResearchLibrary
      initialQuery={searchParams.get("q") ?? ""}
      navigateToCompany={(companyId) =>
        navigate(`/research/${encodeURIComponent(companyId)}`)
      }
    />
  );
}
