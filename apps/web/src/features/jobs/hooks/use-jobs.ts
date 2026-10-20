import type { JobsListQuery } from "@surface/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getJobs } from "../api/get-jobs";

export function useJobs(input: JobsListQuery) {
  return useQuery({
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryKey: queryKeys.jobs.list(input),
    queryFn: () => getJobs(input),
  });
}
