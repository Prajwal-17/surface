import { AppShell } from "@/components/layout/app-shell";
import { CompanyResearch } from "@/features/research/company-research";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return (
    <AppShell fullBleed>
      <CompanyResearch key={companyId} companyId={companyId} />
    </AppShell>
  );
}
