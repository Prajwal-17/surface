export interface CrawlInput {
  id: string;
  url: string;
  render?: boolean;
}

export interface CrawlResult {
  url: string;
  title: string;
  text: string;
  links: Array<{ url: string; title: string }>;
  status: string;
  retrievedAt: string;
}

export type CrawlPage = (
  input: CrawlInput,
  signal: AbortSignal,
) => Promise<CrawlResult>;
