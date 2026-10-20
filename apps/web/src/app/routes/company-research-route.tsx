import { Navigate, useParams } from "react-router";
import { CompanyResearch } from "@/features/research/company-research";

export function Component() {
  const { companyId } = useParams();
  if (!companyId) return <Navigate to="/research" replace />;
  return <CompanyResearch key={companyId} companyId={companyId} />;
}
