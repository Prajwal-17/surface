import { useState } from "react";
import type { ResearchSource } from "@surface/contracts";
import { ResearchMarkdown } from "./research-markdown";

// Older saved reports remain intact. Show their opening block per section until expanded.
export function ReportContent({
  text,
  sources,
}: {
  text: string;
  sources: ResearchSource[];
}) {
  const [expanded, setExpanded] = useState(false);
  const sections = text
    .split(/\n(?=#{1,3}\s)/)
    .filter(
      (section) =>
        !/^#{1,3}\s+(Useful links|Sources|References)\b/i.test(section.trim()),
    );
  const cleaned = sections.join("\n").replace(/^#\s+[^\n]+\n+/, "");
  const long = cleaned.split(/\s+/).length > 380;
  const preview = sections
    .map((section) => {
      const blocks = section.trim().split(/\n\s*\n/);
      if (/^#\s/.test(blocks[0] ?? "")) blocks.shift();
      const heading = /^#{2,3}\s/.test(blocks[0] ?? "")
        ? blocks.shift()
        : undefined;
      const firstList = blocks.find((block) => /^[-*+]\s/m.test(block));
      const body = firstList
        ? firstList
            .split(/\n(?=[-*+]\s)/)
            .slice(0, 2)
            .join("\n")
        : blocks[0];
      return [heading, body].filter(Boolean).join("\n\n");
    })
    .join("\n\n");
  return (
    <>
      <ResearchMarkdown
        text={long && !expanded ? preview : cleaned}
        sources={sources}
      />
      {long && (
        <button
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-4 text-xs font-medium text-brand hover:underline"
        >
          {expanded ? "Show brief view" : "Read full saved report"}
        </button>
      )}
    </>
  );
}
