import { SurfaceLogo } from "@/components/ui/surface-logo";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileText,
  FolderOpen,
  ListChecks,
  MapPin,
  Upload,
} from "lucide-react";
import {
  profileDetailsSchema,
  personalContextSchema,
  profileInputSchema,
  type Profile,
} from "@surface/contracts";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useDesktopChannel } from "@/lib/desktop-channel";
import { Button } from "@/components/ui/button";
import { ProfileLoading } from "@/components/feedback/loading-state";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useProfile, profileResponseSchema } from "../profile-query";
import {
  ProfileSections,
  sectionTitles,
  type EditorProfile,
  type ProfileSection,
} from "./profile-sections";
import { ProfileOverview } from "./profile-overview";
import { ResumeImport } from "./resume-import";
const sections = ["goals", "experience", "locations"] as const;
const steps = [
  "Get started",
  "Your next role",
  "Your background",
  "Work preferences",
  "Review",
];
const icons = {
  goals: BriefcaseBusiness,
  experience: FolderOpen,
  locations: MapPin,
};
function editorProfile(profile: Profile | null): EditorProfile {
  const context = personalContextSchema.parse(profile?.context ?? {});
  const details = profileDetailsSchema.parse(context.details ?? {});
  if (typeof window !== "undefined") {
    try {
      const account = JSON.parse(
        localStorage.getItem("surface-account") ?? "null",
      );
      if (!details.name && typeof account?.name === "string")
        details.name = account.name;
      if (
        !details.email &&
        profileDetailsSchema.shape.email.safeParse(account?.email).success
      )
        details.email = account?.email ?? "";
    } catch {
      /* Optional legacy account details. */
    }
  }
  return {
    targetRoles: profile?.targetRoles ?? "",
    preferredSkills: profile?.preferredSkills ?? "",
    locationPreferences: profile?.locationPreferences ?? "",
    dealBreakers: profile?.dealBreakers ?? "",
    context: { ...context, details },
  };
}
export function ProfileScreen({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const query = useProfile();
  if (query.isPending) return <ProfileLoading onboarding={onboarding} />;
  if (query.error)
    return (
      <div role="alert" className="mx-auto max-w-4xl space-y-3 p-8">
        <p>{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  return <ProfileEditor initial={query.data ?? null} onboarding={onboarding} />;
}
function ProfileEditor({
  initial,
  onboarding,
}: {
  initial: Profile | null;
  onboarding: boolean;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const desktopChannel = useDesktopChannel();
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [saved, setSaved] = useState(() => editorProfile(initial));
  const draftKey = `surface-profile-draft:${revision}`;
  const [form, setForm] = useState<EditorProfile>(() => {
    try {
      const draft = sessionStorage.getItem(draftKey);
      if (draft) {
        const parsed = profileInputSchema
          .extend({ targetRoles: z.string().max(100000) })
          .safeParse(JSON.parse(draft));
        if (parsed.success)
          return {
            ...parsed.data,
            context: {
              ...parsed.data.context,
              details: profileDetailsSchema.parse(
                parsed.data.context.details ?? {},
              ),
            },
          };
      }
    } catch {
      /* Ignore invalid or unavailable tab storage. */
    }
    return editorProfile(initial);
  });
  const [section, setSection] = useState<ProfileSection | "overview">(
    "overview",
  );
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const hasRoles =
    form.context.details.roles.length > 0 ||
    (!saved.context.details.roles.length &&
      form.targetRoles.trim().length >= 2);
  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(draftKey, JSON.stringify(form));
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* The form remains usable when tab storage is unavailable. */
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [form, dirty, draftKey]);
  function edit(next: ProfileSection) {
    setSection(next);
    if (onboarding) setStep(sections.indexOf(next) + 1);
    setReviewOpen(false);
    setError("");
    heading.current?.focus();
  }
  function go(next: number) {
    if (next > 1 && !hasRoles) {
      setError("Choose at least one target role to continue.");
      return;
    }
    setStep(next);
    setFurthestStep(Math.max(furthestStep, next));
    setError("");
    heading.current?.focus();
  }
  const save = useMutation({
    mutationFn: async () => {
      if (!hasRoles)
        throw new Error("Choose at least one target role before saving.");
      const targetRoles = form.context.details.roles.length
        ? form.context.details.roles.join(", ")
        : form.targetRoles;
      const parsed = profileInputSchema.safeParse({ ...form, targetRoles });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(" · ")}: ${i.message}`)
            .join("\n"),
        );
      return profileResponseSchema.parse(
        await apiClient("/api/profile/context", {
          method: "PUT",
          body: JSON.stringify({ ...parsed.data, expectedRevision: revision }),
        }),
      ).profile;
    },
    onSuccess: (profile) => {
      if (!profile) return;
      const next = editorProfile(profile);
      try {
        sessionStorage.removeItem(draftKey);
        localStorage.removeItem("surface-onboarding-skipped");
      } catch {
        /* Saved profile is authoritative. */
      }
      setForm(next);
      setSaved(next);
      setRevision(profile.revision);
      setReviewOpen(false);
      setError("");
      client.setQueryData(["profile-context"], profile);
      void client.invalidateQueries({ queryKey: ["jobs"], refetchType: "all" });
      void client.invalidateQueries({ queryKey: ["analysis-settings"] });
      toast.success("Profile saved");
      if (onboarding) void navigate("/");
    },
    onError: (e) => setError(e.message),
  });
  function skip() {
    try {
      localStorage.setItem("surface-onboarding-skipped", "true");
    } catch {
      /* Browsing remains available. */
    }
    void navigate("/");
  }
  const pageTitle = onboarding
    ? [
        "Make your search personal.",
        "What would you like to do next?",
        "Give your experience some context.",
        "Where does work fit into your life?",
        "Your profile, in your words.",
      ][step]
    : section === "overview"
      ? "Your search, your priorities."
      : sectionTitles[section];
  const description = onboarding
    ? [
        "Start with your résumé or add your details yourself. You’ll review everything before saving.",
        "Choose the roles and opportunities you want to explore.",
        "Add the work, skills, and projects that show what you can do.",
        "Set your preferences and make any non-negotiables explicit.",
        "Check your answers below. You can update them anytime from My profile.",
      ][step]
    : section === "overview"
      ? "The background and preferences used to assess opportunities for you."
      : "Keep your answers specific. Changes apply only after you review and save.";
  return (
    <div className={onboarding ? "onboarding-page" : "profile-page"}>
      {onboarding && (
        <header className="onboarding-top">
          <Link
            to="/"
            onClick={() => {
              try {
                localStorage.setItem("surface-onboarding-skipped", "true");
              } catch {
                /* Browsing remains available. */
              }
            }}
            className="flex items-center gap-2.5 font-semibold"
          >
            <SurfaceLogo className="size-5 text-foreground" />
            {desktopChannel === "development" ? "Surface Dev" : "Surface"}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button type="button" variant="ghost" size="sm" onClick={skip}>
              Skip for now
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
          <div className="desktop-caption-spacer" aria-hidden="true" />
        </header>
      )}
      <div className={onboarding ? "onboarding-layout" : "profile-layout"}>
        <aside
          className={
            onboarding ? "onboarding-navigation" : "profile-navigation"
          }
        >
          {onboarding ? (
            <>
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Your profile
              </p>
              <ol className="onboarding-steps">
                {steps.map((label, i) => (
                  <li
                    key={label}
                    aria-current={i === step ? "step" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (i <= furthestStep) go(i);
                      }}
                      aria-label={label}
                      disabled={i > furthestStep}
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="step-number">
                        {i < step ? (
                          <Check className="size-3.5" />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      <span>{label}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="onboarding-aside-note">
                A little context helps you make better decisions.
                <br />
                <br />
                Only your target roles are required.
              </p>
            </>
          ) : (
            <nav aria-label="Profile sections">
              <button
                type="button"
                className="profile-nav-item"
                aria-current={section === "overview" ? "page" : undefined}
                onClick={() => {
                  setSection("overview");
                  setError("");
                }}
              >
                <ListChecks />
                Overview
              </button>
              {sections.map((s) => {
                const Icon = icons[s];
                return (
                  <button
                    type="button"
                    key={s}
                    className="profile-nav-item"
                    aria-current={section === s ? "page" : undefined}
                    onClick={() => edit(s)}
                  >
                    <Icon />
                    {sectionTitles[s]}
                  </button>
                );
              })}
            </nav>
          )}
        </aside>
        <main className="profile-main">
          <div className="profile-page-heading">
            <div>
              {onboarding && (
                <p className="mb-3 text-xs text-brand">
                  Step {step + 1} of {steps.length}
                </p>
              )}
              <h1 ref={heading} tabIndex={-1}>
                {pageTitle}
              </h1>
              <p>{description}</p>
            </div>
            {!onboarding && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload />
                Import resume
              </Button>
            )}
          </div>
          {onboarding && step === 0 ? (
            <div className="onboarding-start">
              <button
                type="button"
                className="onboarding-method"
                onClick={() => setImportOpen(true)}
              >
                <span className="method-icon">
                  <Upload />
                </span>
                <span className="flex-1">
                  <strong>Start with your résumé</strong>
                  <span>Upload a PDF and review the prefilled details.</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="onboarding-method"
                onClick={() => go(1)}
              >
                <span className="method-icon">
                  <FileText />
                </span>
                <span className="flex-1">
                  <strong>Fill in your details</strong>
                  <span>A few focused questions. Go at your own pace.</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
              <p className="mt-6 text-xs leading-6 text-muted-foreground">
                Your answers stay editable. Résumé import suggests details; you
                decide what to keep.
              </p>
            </div>
          ) : (
            <>
              {!onboarding && !initial && section === "overview" && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">
                    Start with a few focused questions.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void navigate("/onboarding")}
                  >
                    Set up your profile
                    <ArrowRight />
                  </Button>
                </div>
              )}
              {onboarding ? (
                step === 4 ? (
                  <ProfileOverview form={form} onEdit={edit} />
                ) : (
                  <ProfileSections
                    section={sections[step - 1]!}
                    form={form}
                    onChange={setForm}
                  />
                )
              ) : section === "overview" ? (
                <ProfileOverview form={form} onEdit={edit} />
              ) : (
                <ProfileSections
                  section={section}
                  form={form}
                  onChange={setForm}
                />
              )}
            </>
          )}
          {error && (
            <p
              role="alert"
              className="mt-5 whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {(onboarding ? step > 0 : dirty || section !== "overview") && (
            <footer className="profile-editor-footer">
              {onboarding ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => go(step - 1)}
                    disabled={save.isPending}
                  >
                    <ArrowLeft />
                    Back
                  </Button>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Nothing is saved until you finish.
                  </span>
                  {step < 4 ? (
                    <Button type="button" onClick={() => go(step + 1)}>
                      Continue
                      <ArrowRight />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={!hasRoles || save.isPending}
                      onClick={() => save.mutate()}
                    >
                      {save.isPending ? "Saving…" : "Save profile"}
                      <Check />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground" role="status">
                    {dirty
                      ? "Unsaved changes"
                      : revision
                        ? "All changes saved"
                        : "Profile not saved yet"}
                  </span>
                  <div className="flex gap-2">
                    {dirty && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setForm(structuredClone(saved));
                          setError("");
                        }}
                      >
                        Discard changes
                      </Button>
                    )}
                    <Button
                      type="button"
                      disabled={
                        !hasRoles || (!dirty && !!revision) || save.isPending
                      }
                      onClick={() => setReviewOpen(true)}
                    >
                      Review changes
                      <ArrowRight />
                    </Button>
                  </div>
                </>
              )}
            </footer>
          )}
        </main>
      </div>
      <ResumeImport
        open={importOpen}
        onOpenChange={setImportOpen}
        form={form}
        onApply={(next) => {
          setForm(next);
          if (onboarding) go(1);
          else setSection("experience");
        }}
      />
      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-4xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            heading.current?.focus();
          }}
        >
          <SheetHeader className="shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3 pr-14 text-left sm:px-6 sm:pr-16">
            <SheetTitle className="sr-only text-base sm:not-sr-only">
              Review your profile
            </SheetTitle>
            <SheetDescription className="sr-only">
              Review your answers before saving. You can edit any section.
            </SheetDescription>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setReviewOpen(false)}
              >
                Back to editing
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Saving…" : "Save changes"}
                <Check />
              </Button>
            </div>
          </SheetHeader>
          {error && (
            <p
              role="alert"
              className="max-h-32 shrink-0 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm text-destructive sm:px-6"
            >
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <ProfileOverview form={form} onEdit={edit} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
