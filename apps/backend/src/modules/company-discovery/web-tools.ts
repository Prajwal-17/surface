import { z } from "zod";
import { HttpError } from "../../shared/errors/http-error";
import { publicUrlSchema, crawlMetadataSchema } from "@surface/contracts";

export const searchInput = z
  .object({
    query: z.string().trim().min(1).max(1000),
    page: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export const crawlInput = z
  .object({ url: publicUrlSchema, render: z.boolean().optional() })
  .strict();

const linkSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  context: z.string().optional(),
});

export const crawlOutput = z.object({
  url: z.string().url(),
  title: z.string(),
  text: z.string().max(500000),
  links: z.array(linkSchema).max(1000),
  metadata: crawlMetadataSchema,
  snapshotId: z.string().optional(),
  status: z.string(),
  retrievedAt: z.string(),
});

export async function searchWeb(
  _input: z.infer<typeof searchInput>,
  _signal?: AbortSignal,
): Promise<Array<{ url: string; title: string; content: string }>> {
  throw new HttpError(503, "Web search is disconnected for now.");
}

export async function crawlPage(
  _input: z.infer<typeof crawlInput>,
  _signal: AbortSignal,
) {
  throw new HttpError(503, "Browser research is disconnected for now.");
}
