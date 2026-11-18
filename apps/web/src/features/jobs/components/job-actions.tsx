import { OutreachComposer } from "@/features/outreach/outreach-composer";
import type { Job } from "@surface/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, ListPlus, X } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  applicationLabels,
  getJobApplication,
  jobApplicationKey,
  useTrackJob,
} from "@/features/applications/application-api";

export function JobActions({ job }: { job: Job }) {
  const mutation = useTrackJob();
  const query = useQuery({
    queryKey: jobApplicationKey(job.id),
    queryFn: () => getJobApplication(job.id),
  });
  const linked = query.data;
  const pending = mutation.isPending || query.isPending;
  function track(status: "queued" | "applied" | "ignored") {
    mutation.mutate({ id: job.id, status });
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
      {linked && (
        <Button size="sm" variant="secondary" asChild>
          <Link
            to={`/applications?application=${encodeURIComponent(linked.id)}`}
          >
            {applicationLabels[linked.status]}
            {linked.archivedAt && " · Archived"} <ArrowUpRight />
          </Link>
        </Button>
      )}
      {(!linked || linked.status === "ignored") && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => track("queued")}
        >
          <ListPlus /> Add to queue
        </Button>
      )}
      {(!linked || ["queued", "ignored"].includes(linked.status)) && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => track("applied")}
        >
          <Check /> Mark as applied
        </Button>
      )}
      {(!linked || linked.status === "queued") && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => track("ignored")}
        >
          <X /> Ignore
        </Button>
      )}
      <OutreachComposer target="job" id={job.id} />
      {query.error && (
        <p className="text-xs text-destructive" role="alert">
          {query.error.message}
        </p>
      )}
    </div>
  );
}
