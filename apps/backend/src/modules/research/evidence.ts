import type { ResearchSource } from "@surface/contracts";
export function normalizedName(name: string) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function companyDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function inputUrl(value: string) {
  try {
    const url = new URL(
      /^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/.test(value)
        ? `https://${value}`
        : value,
    );
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function evidenceForQuestion(
  sources: ResearchSource[],
  question: string,
) {
  const terms = new Set(
    normalizedName(question)
      .split(" ")
      .filter((t) => t.length > 2),
  );
  const score = (text: string) =>
    [...terms].reduce(
      (n, term) => n + (text.toLowerCase().includes(term) ? 1 : 0),
      0,
    );
  const latest = new Map<string, ResearchSource>();
  for (const source of sources.toSorted((a, b) =>
    b.retrievedAt.localeCompare(a.retrievedAt),
  ))
    if (!latest.has(`${source.kind}:${source.url}`))
      latest.set(`${source.kind}:${source.url}`, source);
  return [...latest.values()]
    .toSorted((a, b) => score(b.title + b.text) - score(a.title + a.text))
    .slice(0, 24)
    .map((source) => {
      if (source.text.length <= 20000) return source;
      const paragraphs = source.text.match(/[\s\S]{1,4000}/g) ?? [];
      const chosen = paragraphs
        .map((text, index) => ({ text, index }))
        .toSorted((a, b) => score(b.text) - score(a.text))
        .slice(0, 4)
        .toSorted((a, b) => a.index - b.index);
      return {
        ...source,
        text: `[Selected passages from stored page; other passages are not included.]\n${source.text.slice(0, 4000)}\n${chosen.map((p) => p.text).join("\n…\n")}`,
      };
    });
}
export function citeMarkdown(markdown: string, sources: ResearchSource[]) {
  const known = new Map(sources.map((s) => [s.id, s]));
  const cited = new Set<string>();
  const text = markdown.replace(/\[S:([^\]]+)\]/g, (_, group: string) => {
    return group
      .split(/[,;]\s*/)
      .map((raw) => {
        const id = raw.trim().replace(/^S:/, "");
        const source = known.get(id);
        if (!source)
          throw new Error(
            "The answer cited a source outside this company's supplied evidence. Retry the request.",
          );
        cited.add(id);
        return `[${[...cited].indexOf(id) + 1}](${source.url.replaceAll("(", "%28").replaceAll(")", "%29")})`;
      })
      .join(" ");
  });
  const allowed = new Set(
    sources
      .flatMap((s) => [s.url, ...s.links.map((l) => l.url)])
      .map((url) => {
        try {
          return new URL(url).href;
        } catch {
          return url;
        }
      }),
  );
  // Include autolinks, reference definitions and bare URLs, not only inline Markdown links.
  for (const match of text.matchAll(/https?:\/\/[^\s<>\]"']+/g)) {
    let candidate = match[0].replaceAll("%28", "(").replaceAll("%29", ")");
    let valid = false;
    for (;;) {
      try {
        if (allowed.has(new URL(candidate).href)) {
          valid = true;
          break;
        }
      } catch {
        /* Reject malformed links below. */
      }
      if (!/[),.;:!?]$/.test(candidate)) break;
      candidate = candidate.slice(0, -1);
    }
    if (!valid)
      throw new Error(
        "The answer included a link absent from the supplied evidence. Retry to regenerate a sourced answer.",
      );
  }
  if (
    sources.some((s) => s.text && ["ok", "snippet"].includes(s.status)) &&
    !cited.size
  )
    throw new Error(
      "The model omitted source citations. Retry to generate a sourced answer.",
    );
  if (!text.trim()) throw new Error("The model returned an empty answer.");
  return { markdown: text, sourceIds: [...cited] };
}
