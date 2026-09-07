import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null): string {
  if (!value) return "Date not listed";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not listed";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatCompensation(
  value: import("backend/contracts").Compensation | null,
): string {
  if (!value) return "Unknown";
  if (value.min === null && value.max === null) return value.original;
  return `${value.currency ?? "Currency unknown"} ${value.min?.toLocaleString() ?? "?"}–${value.max?.toLocaleString() ?? "?"} / ${value.period ?? "period unknown"}`;
}
