import type { JobsListQuery } from "backend/contracts";

export const queryKeys = {
  profile: ["profile"] as const,
  jobs: {
    all: ["jobs"] as const,
    list: (input: JobsListQuery) => ["jobs", "list", input] as const,
    detail: (id: string) => ["jobs", "detail", id] as const,
  },
};
