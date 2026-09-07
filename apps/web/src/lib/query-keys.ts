import type { JobsListQuery } from "backend/contracts";

export const queryKeys = {
  jobs: {
    all: ["jobs"] as const,
    list: (input: JobsListQuery) => ["jobs", "list", input] as const,
  },
};
