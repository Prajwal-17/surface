import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { profileSchema } from "backend/contracts";
import { apiClient } from "@/lib/api-client";
export const profileResponseSchema = z.object({
  profile: profileSchema.nullable(),
});
export function useProfile() {
  return useQuery({
    queryKey: ["profile-context"],
    queryFn: async () =>
      profileResponseSchema.parse(await apiClient("/api/profile/context"))
        .profile,
  });
}
