"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  personalContextSchema,
  profileSchema,
  profileInputSchema,
  type Profile,
  type ProfileInput,
} from "backend/contracts";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BriefcaseBusiness,
  ShieldCheck,
  Heart,
  FolderOpen,
  Save,
  Plus,
  LockKeyhole,
} from "lucide-react";
const responseSchema = z.object({ profile: profileSchema.nullable() });
export function ProfileScreen() {
  const query = useQuery({
    queryKey: ["profile-context"],
    queryFn: async () =>
      responseSchema.parse(await apiClient("/api/profile/context")).profile,
  });
  if (query.isPending) return <p role="status">Loading profile…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  return <ProfileForm initial={query.data ?? null} />;
}
function ProfileForm({ initial }: { initial: Profile | null }) {
  const client = useQueryClient();
  const [form, setForm] = useState<ProfileInput>(
    initial ?? {
      targetRoles: "",
      preferredSkills: "",
      locationPreferences: "",
      dealBreakers: "",
      context: personalContextSchema.parse({}),
    },
  );
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const input = profileInputSchema.safeParse({
        ...form,
        context: {
          ...form.context,
          constraints: {
            ...form.context.constraints,
            countries: form.context.constraints.countries.filter(Boolean),
          },
        },
      });
      if (!input.success)
        throw new Error(
          input.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      return responseSchema.parse(
        await apiClient("/api/profile/context", {
          method: "PUT",
          body: JSON.stringify(input.data),
        }),
      ).profile;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["profile-context"] });
      await client.invalidateQueries({ queryKey: ["analysis-settings"] });
      setError("");
      toast.success("Profile saved");
    },
    onError: (e) => setError(e.message),
  });
  const context = form.context;
  const updateContext = (patch: Partial<typeof context>) =>
    setForm({ ...form, context: { ...context, ...patch } });
  const textField = (
    label: string,
    value: string,
    change: (value: string) => void,
    hint?: string,
  ) => (
    <label className="grid gap-2">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      <Textarea
        rows={3}
        value={value}
        onChange={(e) => change(e.target.value)}
        placeholder={
          label === "Target roles"
            ? "e.g. Frontend engineer, design engineer"
            : label === "Skills and technologies"
              ? "e.g. TypeScript, React, design systems"
              : "Add a little context…"
        }
      />
    </label>
  );
  return (
    <form
      className="mx-auto max-w-5xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-kicker">The context that matters</p>
          <h1 className="page-heading">My profile</h1>
          <p className="page-description">
            What you've done. What you want. Where you want to grow.
          </p>
        </div>
        <span className="status-pill tone-mint">
          <LockKeyhole className="size-3" />
          Stored locally
        </span>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-blue-400/20 bg-blue-500/[.07] p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-400/10 text-brand">
          <BriefcaseBusiness className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">
            Make every assessment more relevant
          </p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            A clear profile helps Surface connect each opportunity to your
            skills, boundaries, and ambitions. Revision {initial?.revision ?? 0}
            .
          </p>
        </div>
      </div>
      <Tabs defaultValue="experience">
        <TabsList className="mb-5 flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            {
              value: "experience",
              label: "Experience",
              icon: BriefcaseBusiness,
            },
            { value: "constraints", label: "Constraints", icon: ShieldCheck },
            { value: "preferences", label: "Preferences", icon: Heart },
            { value: "projects", label: "Projects", icon: FolderOpen },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-10 gap-2 rounded-lg border border-transparent px-4 data-[state=active]:border-blue-400/25 data-[state=active]:bg-accent data-[state=active]:text-brand"
            >
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="experience">
          <section className="form-section space-y-5">
            <h2>
              <BriefcaseBusiness />
              Your experience
            </h2>
            <p className="text-xs leading-6 text-muted-foreground">
              Tell us about the work you know and the roles you want to explore.
            </p>
            {textField(
              "Target roles",
              form.targetRoles,
              (v) => setForm({ ...form, targetRoles: v }),
              "Required. Roles you want to review.",
            )}
            {textField("Experience", context.experience, (v) =>
              updateContext({ experience: v }),
            )}
            <label className="grid gap-2">
              Years of experience
              <Input
                type="number"
                min="0"
                max="80"
                step="0.5"
                value={context.yearsExperience ?? ""}
                onChange={(e) =>
                  updateContext({
                    yearsExperience: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
            {textField("Skills and technologies", form.preferredSkills, (v) =>
              setForm({ ...form, preferredSkills: v }),
            )}
          </section>
        </TabsContent>
        <TabsContent value="constraints">
          <section className="form-section space-y-5">
            <h2>
              <ShieldCheck />
              Your boundaries
            </h2>
            <p className="text-sm text-muted-foreground">
              Only these explicit fields are hard constraints. Missing or
              incomparable job information needs clarification.
            </p>
            <label className="grid gap-2">
              Eligible countries (comma-separated)
              <Input
                value={context.constraints.countries.join(", ")}
                onChange={(e) =>
                  updateContext({
                    constraints: {
                      ...context.constraints,
                      countries: e.target.value.split(",").map((v) => v.trim()),
                    },
                  })
                }
              />
            </label>
            {textField(
              "Work eligibility notes",
              context.eligibilityNotes,
              (v) => updateContext({ eligibilityNotes: v }),
            )}
            <label className="grid gap-2">
              Required work mode
              <Select
                value={context.constraints.workMode}
                onChange={(e) =>
                  updateContext({
                    constraints: {
                      ...context.constraints,
                      workMode: e.target
                        .value as typeof context.constraints.workMode,
                    },
                  })
                }
              >
                {["any", "remote", "hybrid", "onsite"].map((v) => (
                  <option key={v} value={v}>
                    {v === "any" ? "No requirement" : v}
                  </option>
                ))}
              </Select>
            </label>
            <fieldset>
              <legend className="mb-2">
                Required employment types (leave empty for any)
              </legend>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    "full-time",
                    "part-time",
                    "contract",
                    "internship",
                    "temporary",
                  ] as const
                ).map((type) => (
                  <label
                    key={type}
                    className="flex min-h-10 items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={context.constraints.employmentTypes.includes(
                        type,
                      )}
                      onCheckedChange={(checked) =>
                        updateContext({
                          constraints: {
                            ...context.constraints,
                            employmentTypes:
                              checked === true
                                ? [...context.constraints.employmentTypes, type]
                                : context.constraints.employmentTypes.filter(
                                    (value) => value !== type,
                                  ),
                          },
                        })
                      }
                    />
                    {type}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2">
                Minimum compensation
                <Input
                  type="number"
                  min="0"
                  value={context.constraints.minimumSalary ?? ""}
                  onChange={(e) =>
                    updateContext({
                      constraints: {
                        ...context.constraints,
                        minimumSalary: e.target.value
                          ? Number(e.target.value)
                          : null,
                      },
                    })
                  }
                />
              </label>
              <label className="grid gap-2">
                Currency (ISO code)
                <Input
                  maxLength={3}
                  value={context.constraints.currency}
                  onChange={(e) =>
                    updateContext({
                      constraints: {
                        ...context.constraints,
                        currency: e.target.value.toUpperCase(),
                      },
                    })
                  }
                />
              </label>
              <label className="grid gap-2">
                Period
                <Select
                  value={context.constraints.salaryPeriod}
                  onChange={(e) =>
                    updateContext({
                      constraints: {
                        ...context.constraints,
                        salaryPeriod: e.target.value as
                          "year" | "month" | "hour",
                      },
                    })
                  }
                >
                  {["year", "month", "hour"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </label>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="preferences">
          <section className="form-section space-y-5">
            <h2>
              <Heart />
              What you prefer
            </h2>
            <p className="text-sm text-muted-foreground">
              Preferences guide assessment. Existing free text remains advisory
              and is never converted into a hard rule.
            </p>
            {textField(
              "Location and work preferences",
              form.locationPreferences,
              (v) => setForm({ ...form, locationPreferences: v }),
            )}
            <label className="grid gap-2">
              Preferred work mode
              <Select
                value={context.workMode}
                onChange={(e) =>
                  updateContext({
                    workMode: e.target.value as typeof context.workMode,
                  })
                }
              >
                {["any", "remote", "hybrid", "onsite"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </label>
            {textField(
              "Compensation expectations",
              context.compensationExpectations,
              (v) => updateContext({ compensationExpectations: v }),
            )}
            {textField("Industries", context.industries, (v) =>
              updateContext({ industries: v }),
            )}
            {textField(
              "Deal-breakers (advisory text)",
              form.dealBreakers,
              (v) => setForm({ ...form, dealBreakers: v }),
            )}
            {textField("Growth interests", context.growthInterests, (v) =>
              updateContext({ growthInterests: v }),
            )}
          </section>
        </TabsContent>
        <TabsContent value="projects">
          <section className="form-section space-y-5">
            <h2>
              <FolderOpen />
              Work that speaks for you
            </h2>
            <p className="text-sm text-muted-foreground">
              Add evidence of your contribution and results. Links are stored;
              their pages are not collected.
            </p>
            {context.projects.map((project, i) => (
              <fieldset key={i} className="space-y-3 border-t pt-4">
                <legend className="pt-3">Project {i + 1}</legend>
                {(["title", "url", "contribution", "results"] as const).map(
                  (key) => (
                    <label key={key} className="grid gap-2 capitalize">
                      {key === "results" ? "Evidence of results" : key}
                      <Textarea
                        rows={key === "title" || key === "url" ? 1 : 3}
                        className={
                          key === "title" || key === "url" ? "min-h-10" : ""
                        }
                        value={project[key]}
                        onChange={(e) =>
                          updateContext({
                            projects: context.projects.map((p, j) =>
                              j === i ? { ...p, [key]: e.target.value } : p,
                            ),
                          })
                        }
                      />
                    </label>
                  ),
                )}
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    updateContext({
                      projects: context.projects.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remove project
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                updateContext({
                  projects: [
                    ...context.projects,
                    { title: "", url: "", contribution: "", results: "" },
                  ],
                })
              }
            >
              <Plus />
              Add project
            </Button>
          </section>
        </TabsContent>
      </Tabs>
      {error && (
        <p role="alert" className="text-red-200">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Your context stays private to this workspace.
        </p>
        <Button type="submit" disabled={save.isPending}>
          <Save />
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
