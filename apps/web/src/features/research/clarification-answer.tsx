import { useState } from "react";
import type { ResearchSource } from "@surface/contracts";
import { ResearchMarkdown } from "./research-markdown";
import { Button } from "@/components/ui/button";

export function ClarificationAnswer({
  text,
  sources,
}: {
  text: string;
  sources: ResearchSource[];
}) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = text.trim().split(/\n\s*\n/);
  const opening = paragraphs.find((part) => !/^#{1,6}\s/.test(part)) ?? text;
  const long = text.split(/\s+/).length > 140 && opening !== text;
  return (
    <>
      <ResearchMarkdown
        text={long && !expanded ? opening : text}
        sources={sources}
      />
      {long && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 px-0 text-brand hover:bg-transparent hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Less detail" : "More detail"}
        </Button>
      )}
    </>
  );
}
