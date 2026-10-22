import { useState } from "react";
import type { Job } from "@surface/contracts";
import {
  ArrowLeftRight,
  Building2,
  Globe2,
  Laptop,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function JobLocation({
  job,
  showLabel = false,
}: {
  job: Pick<Job, "location" | "workMode">;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remote =
    job.workMode === "remote" || /^remote(?:\s|$)/i.test(job.location.trim());
  const worldwide = /^(anywhere(?: in the world)?|worldwide|global)$/i.test(
    job.location.trim(),
  );
  const mode = remote ? "remote" : job.workMode;
  const Icon =
    mode === "remote"
      ? Laptop
      : mode === "hybrid"
        ? ArrowLeftRight
        : mode === "onsite"
          ? Building2
          : worldwide
            ? Globe2
            : MapPin;
  const arrangement = {
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "On-site",
    unknown: "Work arrangement not specified",
  }[mode];
  const label =
    job.location.toLowerCase() === arrangement.toLowerCase()
      ? arrangement
      : `${job.location} · ${arrangement}`;
  const location = job.location.trim();
  const hasLocation =
    Boolean(location) &&
    !/^(location not listed|not specified|unknown|n\/a)$/i.test(location);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        {showLabel ? (
          <span
            className={`inline-flex items-center gap-1.5 ${remote || worldwide ? "text-brand" : "text-muted-foreground"}`}
          >
            <Icon className="size-3.5 shrink-0" />
            <span>{hasLocation ? location : "Not listed"}</span>
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`size-7 shrink-0 ${remote || worldwide ? "text-brand" : "text-muted-foreground"}`}
            aria-label={label}
            onClick={(event) => {
              event.preventDefault();
              setOpen(!open);
            }}
          >
            <Icon className="size-3.5" />
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-64 border border-border bg-popover text-popover-foreground leading-relaxed">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
