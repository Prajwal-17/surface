import { useSearchParams } from "react-router";
import { CompaniesScreen } from "@/features/companies/components/companies-screen";
import { TrackedCompanies } from "@/features/companies/components/tracked-companies";

export function Component() {
  const [params] = useSearchParams();
  const compatibilityView =
    params.has("tab") ||
    params.has("reader") ||
    params.has("expanded") ||
    params.has("hasResearch");
  return compatibilityView ? <CompaniesScreen /> : <TrackedCompanies />;
}
