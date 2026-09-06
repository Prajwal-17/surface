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

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
