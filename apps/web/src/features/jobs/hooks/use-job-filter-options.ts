import { useQuery } from "@tanstack/react-query";
import { companySchema, configuredSourceSchema } from "@surface/contracts";
import { apiClient } from "@/lib/api-client";

export function useJobFilterOptions() {
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: async () =>
      companySchema.array().parse(await apiClient("/api/companies")),
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: async () =>
      configuredSourceSchema.array().parse(await apiClient("/api/sources")),
  });
  return { companies, sources };
}
