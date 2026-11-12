export interface CrawlMetadata {
  description: string;
  siteName: string;
  emails: Array<{
    email: string;
    context: string;
    name?: string;
    role?: string;
  }>;
  people: Array<{
    name: string;
    role: string;
    email?: string;
    profiles: string[];
  }>;
  images: Array<{ url: string; kind: "logo" | "favicon"; source: string }>;
  structuredData: unknown[];
  publishedAt: string | null;
  directoryCompany: Record<string, unknown> | null;
}

export interface CrawlInput {
  id: string;
  url: string;
  render?: boolean;
}

export interface CrawlResult {
  url: string;
  title: string;
  text: string;
  links: Array<{ url: string; title: string; context?: string }>;
  metadata?: CrawlMetadata;
  status: string;
  retrievedAt: string;
}

export type CrawlPage = (
  input: CrawlInput,
  signal: AbortSignal,
) => Promise<CrawlResult>;
