import type { JobsListQuery } from "@surface/contracts";

export const queryKeys = {
  jobs: {
    all: ["jobs"] as const,
    list: (input: JobsListQuery) => ["jobs", "list", input] as const,
  },
};
