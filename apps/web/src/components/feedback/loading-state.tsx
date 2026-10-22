import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      />
      {children}
    </span>
  );
}

function Frame({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function LoadingRows({
  label,
  count = 4,
}: {
  label: string;
  count?: number;
}) {
  return (
    <Frame label={label} className="overflow-hidden rounded-lg border bg-card">
      <div className="divide-y divide-border">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <Skeleton className="size-7 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className={i % 2 ? "h-4 w-1/2" : "h-4 w-2/3"} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-7 w-20 sm:block" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function LoadingCards({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <div className="company-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="panel space-y-3 p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-7" />
              <Skeleton className="h-5 w-1/2" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <div className="flex gap-2 pt-4">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function ProfileLoading({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  return (
    <Frame
      label="Loading your profile"
      className={onboarding ? "onboarding-page" : "profile-page"}
    >
      {onboarding && (
        <div className="onboarding-top">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-32" />
        </div>
      )}
      <div className={onboarding ? "onboarding-layout" : "profile-layout"}>
        <div className="profile-navigation">
          <nav>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="my-1 h-8 w-full" />
            ))}
          </nav>
        </div>
        <div className="min-w-0">
          <div className="mb-8 space-y-4">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="profile-review-card mb-5 space-y-7">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-8 w-20" />
              </div>
              {[0, 1, 2].map((j) => (
                <div key={j} className="grid gap-3 sm:grid-cols-[170px_1fr]">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function SettingsLoading() {
  return (
    <Frame
      label="Loading analysis settings"
      className="mx-auto mt-4 max-w-5xl space-y-6"
    >
      <Skeleton className="h-6 w-52" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="panel space-y-3 p-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-48" />
    </Frame>
  );
}

export function ReaderLoadingContent() {
  return (
    <Frame
      label="Loading job details"
      className="min-h-0 flex-1 overflow-hidden p-3"
    >
      <div className="grid grid-cols-2 gap-6 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
      <div className="my-6 flex gap-4 border-b pb-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="mb-6 h-5 w-40" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-7 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </Frame>
  );
}
