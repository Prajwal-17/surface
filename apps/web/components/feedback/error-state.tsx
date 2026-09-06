import { AlertTriangle } from "lucide-react";

export function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex min-h-40 items-center justify-center gap-3 rounded-md border border-[#7d3638] bg-[#2b1516] px-6 text-sm text-[#ffb9b5]"
    >
      <AlertTriangle className="size-5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
