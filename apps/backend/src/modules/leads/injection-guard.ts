/**
 * Lightweight prompt-injection screening for page text, ported from
 * firecrawl's promptInjectionGuard idea (theirs is model-backed; this is a
 * deterministic subset). Extracted page text is untrusted data. Lines that
 * look like imperative instructions aimed at an assistant are flagged and
 * stripped from the excerpt before it is stored, shown, or handed to a model.
 * Legitimate marketing copy rarely matches these patterns; when a line is
 * removed it is counted so the run log can say so.
 */

const injectionPatterns: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|earlier|above|other)\s+(instructions?|prompts?|rules?|messages?)/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|earlier|above|other|your)\b/i,
  /forget\s+(everything|all|your)\s+(previous|prior|instructions?|training)/i,
  /\byou\s+are\s+now\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bsystem\s+prompt\b/i,
  /\bignore\s+the\s+above\b/i,
  /\bact\s+as\s+(an?|your)\b.*\b(instructions?|assistant|system)\b/i,
  /\b(reveal|repeat|print|show)\s+(your\s+|the\s+)?(system\s+|initial\s+|hidden\s+)?(instructions?|prompt|rules)/i,
  /\b(call|use|hit|visit)\s+(this|the)\s+(api|url|link|endpoint)\b/i,
  /\bsend\s+(your|an|the)\s+(api\s+key|secret|token|credentials)/i,
  /\bprovide\s+your\s+(api\s+key|password|credentials)\b/i,
];

export type ScreenedText = {
  text: string;
  flagged: number;
};

export function stripInjectionLines(input: string, maxLength = 7000): ScreenedText {
  if (!input) return { text: input, flagged: 0 };
  let flagged = 0;
  const kept = input.split("\n").filter((line) => {
    if (injectionPatterns.some((pattern) => pattern.test(line))) {
      flagged += 1;
      return false;
    }
    return true;
  });
  return {
    text: kept.join("\n").slice(0, maxLength),
    flagged,
  };
}
