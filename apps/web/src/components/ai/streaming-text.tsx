import { ProfileMarkdown } from "@/components/ui/profile-markdown";

// Beautiful UI's text reveal and cursor, driven by received text, without demo timers.
export function StreamingText({
  text,
  streaming = false,
  markdown = false,
}: {
  text: string;
  streaming?: boolean;
  markdown?: boolean;
}) {
  if (markdown) {
    return (
      <div
        className="max-w-[76ch] text-prose leading-[1.65] [&_h4]:mt-6 [&_h4]:text-base [&_h4]:tracking-tight"
        aria-busy={streaming}
      >
        <ProfileMarkdown>{text}</ProfileMarkdown>
        {streaming && (
          <span
            aria-hidden="true"
            className="ai-stream-cursor inline-block h-3.5 w-0.5 rounded-full bg-foreground"
          />
        )}
      </div>
    );
  }
  return (
    <p
      className="whitespace-pre-wrap break-words max-w-[76ch] text-prose leading-[1.65]"
      aria-busy={streaming}
    >
      {streaming
        ? text.split(/(\s+)/).map((word, index) => (
            <span
              key={index}
              className={word.trim() ? "ai-stream-word" : undefined}
            >
              {word}
            </span>
          ))
        : text}
      {streaming && (
        <span
          aria-hidden="true"
          className="ai-stream-cursor ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-foreground"
        />
      )}
    </p>
  );
}
