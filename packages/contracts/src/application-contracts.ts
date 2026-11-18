import { z } from "zod";

export const applicationStatusSchema = z.enum([
  "queued",
  "applied",
  "contacted",
  "in_conversation",
  "closed",
  "ignored",
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
