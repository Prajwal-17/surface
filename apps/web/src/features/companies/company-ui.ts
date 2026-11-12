import type { CompanySignal } from "@surface/contracts";
export const companyQueues = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "will_apply", label: "Will apply" },
  { id: "later", label: "Later" },
  { id: "done", label: "Done" },
  { id: "skipped", label: "Skipped" },
] as const;
export function signalLabel(s: CompanySignal) {
  if (s.kind === "yc") return `YC · ${s.batch ?? "Batch unknown"}`;
  if (s.kind === "manual") return "Added manually";
  const n = Number(s.amount),
    amount = s.amount
      ? `${s.currency ?? ""} ${n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n.toLocaleString()}`
      : null;
  return [amount, s.stage?.replaceAll("-", " ") || "Funding announcement"]
    .filter(Boolean)
    .join(" · ");
}
export function displayDate(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Unknown";
}
export function contactStatus(value: string) {
  return value === "mailbox_verified"
    ? "Mailbox verified"
    : value === "manual"
      ? "Manual correction"
      : "Published";
}
