import {
  ArrowUpRight,
  BriefcaseBusiness,
  Code2,
  BookOpen,
  Users,
  Globe2,
  ChevronDown,
  ListChecks,
} from "lucide-react";
import type { VerifiedCompanyLink } from "@surface/contracts";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
const categories = [
  { name: "Website", icon: Globe2 },
  { name: "Careers", icon: BriefcaseBusiness },
  { name: "Code", icon: Code2 },
  { name: "Social", icon: Users },
  { name: "Docs", icon: BookOpen },
] as const;
export function CompanyLinks({
  links,
  checkedAt,
  busy,
  onVerify,
}: {
  links: VerifiedCompanyLink[];
  checkedAt?: string;
  busy: boolean;
  onVerify: () => void;
}) {
  return (
    <nav
      aria-label="Verified company links"
      className="flex flex-wrap items-center gap-1"
    >
      {categories.map(({ name, icon: Icon }) => {
        const group = links.filter((link) => link.category === name);
        if (!group.length) return null;
        return (
          <Popover key={name}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              >
                <Icon className="size-3.5" />
                {name}
                <ChevronDown className="size-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                AI reviewed ·{" "}
                {new Date(group[0]!.checkedAt).toLocaleDateString()}
              </p>
              {group.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {link.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {link.reason}
                    </span>
                    <span className="mt-1 block truncate text-caption text-muted-foreground">
                      {link.url}
                    </span>
                  </span>
                  <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </PopoverContent>
          </Popover>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onVerify}
            className="h-7 gap-1.5 px-2 text-xs"
            aria-label={
              checkedAt ? "Recheck company links" : "Verify company links"
            }
          >
            <ListChecks className="size-3.5" />
            {!checkedAt && "Verify links"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {checkedAt
            ? `Recheck links · last reviewed ${new Date(checkedAt).toLocaleDateString()}`
            : "Let AI inspect and select useful company links"}
        </TooltipContent>
      </Tooltip>
      {checkedAt && !links.length && (
        <span className="text-caption text-muted-foreground">
          No useful links verified
        </span>
      )}
    </nav>
  );
}
