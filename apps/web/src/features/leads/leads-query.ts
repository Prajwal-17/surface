import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeDiscoveryCriteria,
  type DiscoveryCriteria,
  type RunCriteria,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";

export type LeadSettings = {
  id: string;
  searxngUrl: string;
  productContext: string;
  updatedAt: string;
};

export type SearxngDockerStatus = {
  dockerAvailable: boolean;
  dockerVersion: string | null;
  containerName: string;
  state:
    | "docker-unavailable"
    | "not-created"
    | "running"
    | "stopped"
    | "paused"
    | "restarting"
    | "exited"
    | "unknown";
  health: string | null;
  exists: boolean;
  running: boolean;
  url: string;
  image: string | null;
  error: string | null;
};

export type ResearchCriteria = {
  companyId: string;
  question: string;
};

export type { DiscoveryCriteria, SeedSource } from "@surface/contracts";

/** Criteria JSON from before the array-based shape; kept for display. */
export type LegacyDiscoveryCriteria = {
  industry: string;
  geography: string;
  companyType: string;
  signals: string;
  exclusions: string;
  limit: number;
};

export type RunKind = "discovery" | "research";
export type RunState =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export type DiscoveryRun = {
  id: string;
  kind: RunKind;
  state: RunState;
  criteria: string;
  resultCount: number;
  skippedCount: number;
  error: string | null;
  summary: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunEvent = {
  id: string;
  runId: string;
  kind: string;
  message: string;
  metadata: string | null;
  createdAt: string;
};

export type RunLead = {
  id: string;
  name: string;
  website: string;
  location: string;
  description: string;
  status: string;
  updatedAt: string;
  matchReason: string;
  sources: Array<{ url: string; title: string }>;
};

export type RunDetails = {
  run: DiscoveryRun;
  events: RunEvent[];
  leads: RunLead[];
};

export type ResearchFinding = {
  claim: string;
  sourceIds: string[];
};

export type ResearchSource = {
  id: string;
  url: string;
  title: string;
  retrievedAt: string;
  excerpt: string;
};

export type ResearchBrief = {
  id: string;
  companyId: string;
  runId: string | null;
  content: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  model: string | null;
  createdAt: string;
};

export type LeadEvidence = {
  id: string;
  companyId: string;
  runId: string | null;
  sourceId: string | null;
  sourceUrl: string;
  pageTitle: string;
  claim: string;
  excerpt: string;
  retrievedAt: string;
  createdAt: string;
};

export type CompanyOverview = {
  company: {
    id: string;
    name: string;
    website: string;
    location: string;
    description: string;
    notes: string;
    status: string;
    applicationCount: number;
    createdAt: string;
    updatedAt: string;
  };
  evidence: LeadEvidence[];
  brief: ResearchBrief | null;
  researchRun: DiscoveryRun | null;
};

export const leadSettingsKey = ["leads", "settings"] as const;
export const leadRunsKey = ["leads", "runs"] as const;

export function parseRunCriteria(
  run: DiscoveryRun,
): RunCriteria | LegacyDiscoveryCriteria | null {
  try {
    const parsed: unknown = JSON.parse(run.criteria);
    if (typeof parsed === "object" && parsed !== null && "companyId" in parsed) {
      return parsed as ResearchCriteria;
    }
    const normalized = normalizeDiscoveryCriteria(parsed);
    return normalized ?? (parsed as LegacyDiscoveryCriteria);
  } catch {
    return null;
  }
}

export function isRunActive(run: DiscoveryRun | null | undefined) {
  return run?.state === "queued" || run?.state === "running";
}

export function useLeadSettings() {
  return useQuery({
    queryKey: leadSettingsKey,
    queryFn: () => apiClient<LeadSettings>("/api/leads/settings"),
  });
}

export function useLeadRuns() {
  return useQuery({
    queryKey: leadRunsKey,
    queryFn: () => apiClient<DiscoveryRun[]>("/api/leads/runs"),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isRunActive(run)) ? 3000 : false,
  });
}

export function useRunDetails(runId: string | null) {
  return useQuery({
    queryKey: ["leads", "run", runId],
    enabled: Boolean(runId),
    queryFn: () => apiClient<RunDetails>(`/api/leads/runs/${runId}`),
    refetchInterval: (query) =>
      isRunActive(query.state.data?.run) ? 2000 : false,
  });
}

export function useCompanyOverview(companyId: string | null) {
  return useQuery({
    queryKey: ["leads", "company", companyId],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiClient<CompanyOverview>(
        `/api/leads/companies/${encodeURIComponent(companyId!)}/overview`,
      ),
    refetchInterval: (query) =>
      isRunActive(query.state.data?.researchRun) ? 2500 : false,
  });
}

export function useSaveLeadSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { searxngUrl: string; productContext: string }) =>
      apiClient<LeadSettings>("/api/leads/settings", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: leadSettingsKey });
    },
  });
}

export function useCheckSearxng() {
  return useMutation({
    mutationFn: (searxngUrl?: string) =>
      apiClient<{ ok: boolean; resultCount: number; error: string | null }>(
        "/api/leads/settings/check",
        {
          method: "POST",
          body: JSON.stringify(searxngUrl ? { searxngUrl } : {}),
        },
      ),
  });
}

export function useSearxngDockerStatus(enabled = true) {
  return useQuery({
    queryKey: ["leads", "searxng", "docker"],
    queryFn: () => apiClient<SearxngDockerStatus>("/api/leads/searxng/status"),
    enabled,
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useStartSearxngDocker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<SearxngDockerStatus>("/api/leads/searxng/start", {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["leads", "searxng", "docker"],
        }),
        queryClient.invalidateQueries({ queryKey: leadSettingsKey }),
      ]);
    },
  });
}

export function useStopSearxngDocker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<SearxngDockerStatus>("/api/leads/searxng/stop", {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["leads", "searxng", "docker"],
      });
    },
  });
}

export function useCreateDiscoveryRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (criteria: DiscoveryCriteria) =>
      apiClient<DiscoveryRun>("/api/leads/runs", {
        method: "POST",
        body: JSON.stringify(criteria),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: leadRunsKey });
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiClient<{ cancelled: boolean }>(
        `/api/leads/runs/${encodeURIComponent(runId)}/cancel`,
        { method: "POST" },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useResearchCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { companyId: string; question?: string }) =>
      apiClient<DiscoveryRun>("/api/leads/research", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: leadRunsKey }),
        queryClient.invalidateQueries({
          queryKey: ["leads", "company", input.companyId],
        }),
      ]);
    },
  });
}

export function useCompanyStatus(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      apiClient(`/api/tracker/companies/${encodeURIComponent(companyId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracker"] }),
        queryClient.invalidateQueries({
          queryKey: ["leads", "company", companyId],
        }),
      ]);
    },
  });
}
