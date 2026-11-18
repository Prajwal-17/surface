import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

interface RefreshStatus {
  lastSuccessAt: string | null;
  active: boolean;
  available: boolean;
}

export function useRefreshStatus() {
  return useQuery({
    queryKey: ["refresh"],
    queryFn: () => apiClient<RefreshStatus>("/api/refresh"),
    refetchInterval: (query) => (query.state.data?.active ? 2000 : 15000),
  });
}

export function useRefreshPortals() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ runId: string }>("/api/refresh", { method: "POST" }),
    onSuccess: async () => {
      await Promise.all(
        ["refresh", "runs"].map((queryKey) =>
          client.invalidateQueries({ queryKey: [queryKey] }),
        ),
      );
    },
    onError: (error) => toast.error(error.message),
  });
}
