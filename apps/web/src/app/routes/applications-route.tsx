import { ApplicationsScreen } from "@/features/applications/applications-screen";
import { Opportunities } from "@/features/applications/opportunities";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function Component() {
  const [params] = useSearchParams();
  const legacyStatus = params.get("status");
  const tracking =
    params.get("section") === "tracker" ||
    ["application", "company", "new", "archive", "q"].some((key) =>
      params.has(key),
    ) ||
    Boolean(legacyStatus && legacyStatus !== "inbox");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1
            className="text-xl font-semibold"
            tabIndex={-1}
            data-job-list-heading
          >
            Applications
          </h1>
          <nav
            aria-label="Application views"
            className="flex items-center gap-1"
          >
            <Button
              variant={tracking ? "ghost" : "secondary"}
              size="sm"
              asChild
            >
              <Link
                to="/applications"
                aria-current={tracking ? undefined : "page"}
              >
                Opportunities
              </Link>
            </Button>
            <Button
              variant={tracking ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link
                to="/applications?section=tracker"
                aria-current={tracking ? "page" : undefined}
              >
                Tracker
              </Link>
            </Button>
          </nav>
        </div>
        <Button size="sm" asChild>
          <Link to="/applications?section=tracker&new=1">
            <Plus /> Add application
          </Link>
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        {tracking ? <ApplicationsScreen /> : <Opportunities />}
      </div>
    </div>
  );
}
