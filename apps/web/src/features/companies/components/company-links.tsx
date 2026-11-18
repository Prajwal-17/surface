import { useMemo, useState } from "react";
import {
  Activity,
  AtSign,
  BookOpen,
  Briefcase,
  Code2,
  CreditCard,
  Globe,
  Link as LinkIcon,
  LoaderCircle,
  Newspaper,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CompanyDetail,
  CompanyLink,
  CompanyLinkCategory,
} from "@surface/contracts";
import { Button } from "@/components/ui/button";
import { displayDate } from "../company-ui";
import type { CompanyMutation } from "./company-reader";

const icons: Record<CompanyLinkCategory, typeof Globe> = {
  website: Globe,
  docs: BookOpen,
  github: Code2,
  linkedin: UserRound,
  x: AtSign,
  careers: Briefcase,
  blog: Newspaper,
  pricing: CreditCard,
  status: Activity,
  community: Users,
  other: LinkIcon,
};

const CATEGORY_ORDER: CompanyLinkCategory[] = [
  "careers",
  "github",
  "docs",
  "linkedin",
  "x",
  "blog",
  "pricing",
  "status",
  "community",
  "website",
  "other",
];
const categoryRank = (category: CompanyLinkCategory) =>
  CATEGORY_ORDER.indexOf(category);

export function CompanyLinks({
  company,
  mutate,
  pending,
}: {
  company: CompanyDetail;
  mutate: CompanyMutation;
  pending: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const links = useMemo(
    () =>
      company.links.toSorted(
        (a, b) =>
          categoryRank(a.category) - categoryRank(b.category) ||
          a.label.localeCompare(b.label),
      ),
    [company.links],
  );

  const verify = async () => {
    setBusy(true);
    try {
      const result = (await mutate({
        path: `/api/company-discovery/companies/${company.id}/links/verify`,
        body: {},
      })) as { emails?: string[] } | undefined;
      const added = result?.emails?.length ?? 0;
      toast.success(
        added
          ? `Links verified · ${added} email${added === 1 ? "" : "s"} added to Contacts`
          : "Links verified",
      );
    } catch {
      /* The reader mutation reports the failure. */
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || pending || !company.website;

  return (
    <section className="company-links" aria-label="Useful company links">
      <div className="company-links-bar">
        {links.length ? (
          <ul className="company-links-list">
            {links.map((link: CompanyLink) => {
              const Icon = icons[link.category] ?? LinkIcon;
              return (
                <li key={link.id}>
                  <a
                    className="company-link"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.url}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    <span>{link.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="company-links-empty">
            {company.website
              ? "No curated links yet."
              : "Add the official website to verify links."}
          </p>
        )}
        <div className="company-links-actions">
          {links.length ? (
            <span className="company-links-checked">
              Checked {displayDate(company.linksCheckedAt)}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={disabled}
            onClick={() => void verify()}
            aria-label={
              links.length ? "Recheck company links" : "Verify company links"
            }
          >
            {disabled && busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {busy ? "Verifying…" : links.length ? "Recheck" : "Verify links"}
          </Button>
        </div>
      </div>
    </section>
  );
}
