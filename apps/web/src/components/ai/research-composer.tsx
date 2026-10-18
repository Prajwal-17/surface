"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Globe2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// Compact adaptation of Beautiful UI's Prompt Bar. MIT: ./LICENSE.md.
export function ResearchComposer({
  onSend,
  busy,
  onStop,
  placeholder,
  searchOption = false,
  initialValue = "",
}: {
  onSend: (text: string, webSearch: boolean) => Promise<void>;
  busy: boolean;
  onStop?: () => void;
  placeholder: string;
  searchOption?: boolean;
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);
  const [webSearch, setWebSearch] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "36px";
    input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
  }, [text]);
  async function submit() {
    if (!text.trim() || busy) return;
    try {
      await onSend(text.trim(), webSearch);
      setText("");
      setWebSearch(false);
    } catch {
      /* Caller displays the error; retain the draft. */
    }
  }
  return (
    <form
      className="flex items-end gap-1 rounded-lg border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring/30"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Textarea
        ref={input}
        aria-label={placeholder}
        placeholder={placeholder}
        maxLength={searchOption ? 12000 : 2048}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-9 flex-1 resize-none rounded-none border-0 bg-transparent px-2 py-1.5 leading-6 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {searchOption && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={webSearch ? "secondary" : "ghost"}
              size="icon"
              aria-label="Search web"
              aria-pressed={webSearch}
              disabled={busy}
              onClick={() => setWebSearch(!webSearch)}
              className={`size-9 shrink-0 ${webSearch ? "text-brand" : "text-muted-foreground"}`}
            >
              <Globe2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {webSearch
              ? "Search web for this question · On"
              : "Search web for this question"}
          </TooltipContent>
        </Tooltip>
      )}
      {busy && onStop ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0"
          aria-label="Stop research"
          onClick={onStop}
        >
          <Square className="size-3.5" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          className="size-9 shrink-0"
          disabled={busy || !text.trim()}
          aria-label={searchOption ? "Ask about company" : "Find company"}
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </form>
  );
}
