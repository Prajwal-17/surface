import {
  discoverySearchResponseSchema,
  type DiscoverySearchInput,
} from "@repo/contracts";
import { apiClient } from "@/lib/api-client";

export async function runDiscovery(input: DiscoverySearchInput) {
  const response = await apiClient<unknown>("/api/discovery/search", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return discoverySearchResponseSchema.parse(response);
}
