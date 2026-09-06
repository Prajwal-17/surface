import type { JobsListQuery } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getJobs } from "../api/get-jobs";

export function useJobs(input: JobsListQuery) {
  return useQuery({
    queryKey: queryKeys.jobs.list(input),
    queryFn: () => getJobs(input),
  });
}
