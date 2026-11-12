import { useState } from "react";
import { ArrowUpRight, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

const sites: Record<string, { label: string; icon: string }> = {
  "github.com": { label: "GitHub", icon: "/site-icons/github.ico" },
  "linkedin.com": { label: "LinkedIn", icon: "/site-icons/linkedin.ico" },
  "x.com": { label: "X", icon: "/site-icons/x.png" },
  "twitter.com": { label: "X", icon: "/site-icons/x.png" },
};

export function SiteLink({
  href,
  children,
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "");
  const site = sites[host];
  const icon = site?.icon ?? `${url.origin}/favicon.ico`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex min-h-11 max-w-full items-center gap-2 text-xs text-brand md:min-h-8",
        className,
      )}
    >
      {failed === icon ? (
        <Globe2
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <img
          src={icon}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            "size-4 shrink-0 object-contain",
            host === "github.com" && "dark:invert",
          )}
          onError={() => setFailed(icon)}
        />
      )}
      <span className="truncate">{children ?? site?.label ?? host}</span>
      <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}
