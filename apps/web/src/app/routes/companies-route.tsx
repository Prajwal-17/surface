import { useSearchParams } from "react-router";
import { CompaniesScreen } from "@/features/companies/components/companies-screen";
import { TrackedCompanies } from "@/features/companies/components/tracked-companies";

export function Component() {
  const [params] = useSearchParams();
  const compatibilityView = params.has("tab");
  return compatibilityView ? <CompaniesScreen /> : <TrackedCompanies />;
}
