import Markdown from "react-markdown";
import type { ResearchSource } from "@surface/contracts";

function urlHref(value: string): string[] {
  try {
    return [new URL(value).href];
  } catch {
    return [];
  }
}

function normalizeMarkdownUrl(value: string): string {
  return value.replaceAll("%28", "(").replaceAll("%29", ")");
}

export function ResearchMarkdown({
  text,
  sources,
}: {
  text: string;
  sources: ResearchSource[];
}) {
  const known = new Map(sources.map((s) => [s.id, s]));
  const allowed = new Set(
    sources
      .flatMap((s) => [s.url, ...s.links.map((l) => l.url)])
      .flatMap(urlHref)
      .map(normalizeMarkdownUrl),
  );
  const content = text.replace(/\[S:([^\]]+)\]/g, (_, group: string) =>
    group
      .split(/[,;]\s*/)
      .map((raw) => {
        const id = raw.trim().replace(/^S:/, "");
        const source = known.get(id);
        const url = source ? urlHref(source.url)[0] : undefined;
        return url
          ? `[source](${url.replaceAll("(", "%28").replaceAll(")", "%29")})`
          : "[source]";
      })
      .join(" "),
  );
  return (
    <div className="research-markdown min-w-0 break-words text-prose leading-[1.65]">
      <Markdown
        skipHtml
        components={{
          a: ({ href, children }) => {
            const value = href ? urlHref(href)[0] : undefined;
            return value && allowed.has(normalizeMarkdownUrl(value)) ? (
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
          img: ({ alt }) => <span>{alt}</span>,
          h1: ({ children }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-base font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-brand/40 pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
