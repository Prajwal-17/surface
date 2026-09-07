"use client";
import { type ReactNode, useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  roleOptions,
  skillOptions,
  industryOptions,
  levelOptions,
  priorityOptions,
  relocationOptions,
  sponsorshipOptions,
  type ProfileInput,
  type ProfileDetails,
} from "backend/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProfileMarkdown } from "@/components/ui/profile-markdown";
import {
  Choice,
  SearchChoices,
  LocationPicker,
  useLocationCatalogs,
} from "./profile-controls";
export type EditorProfile = ProfileInput & {
  context: ProfileInput["context"] & { details: ProfileDetails };
};
export type ProfileSection = "goals" | "experience" | "locations";
export const sectionTitles = {
  goals: "Career goals",
  experience: "Experience & projects",
  locations: "Locations & requirements",
};
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="profile-field">
      <span>{label}</span>
      {hint && <p>{hint}</p>}
      {children}
    </label>
  );
}
function Note({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Field label={label} hint={hint}>
        <Textarea
          rows={4}
          maxLength={100000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${placeholder ?? "Add your details here."}\nMarkdown supported: ## headings, **bold**, - lists, and [links](https://…).`}
        />
      </Field>
      <details className="text-xs text-muted-foreground">
        <summary className="w-fit rounded-sm py-1">Preview Markdown</summary>
        <div className="mt-2 rounded-md border bg-card p-4 text-sm text-foreground">
          {value.trim() ? (
            <ProfileMarkdown>{value}</ProfileMarkdown>
          ) : (
            "Write something above to preview the formatting."
          )}
        </div>
      </details>
    </div>
  );
}
function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="profile-group" aria-labelledby={id}>
      <div>
        <h3 id={id}>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
const employmentTypes = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
] as const;
const workModes = ["any", "remote", "hybrid", "onsite"] as const;
export function ProfileSections({
  section,
  form,
  onChange,
}: {
  section: ProfileSection;
  form: EditorProfile;
  onChange: (v: EditorProfile) => void;
}) {
  const d = form.context.details,
    c = form.context,
    constraints = c.constraints;
  const catalogs = useLocationCatalogs();
  const countries =
    catalogs.data?.countries.map((c) => ({ value: c.code, label: c.name })) ??
    [];
  const details = (patch: Partial<ProfileDetails>) =>
    onChange({ ...form, context: { ...c, details: { ...d, ...patch } } });
  const context = (patch: Partial<ProfileInput["context"]>) =>
    onChange({ ...form, context: { ...c, ...patch, details: d } });
  const required = (patch: Partial<typeof constraints>) =>
    context({ constraints: { ...constraints, ...patch } });
  if (section === "goals")
    return (
      <>
        <Group
          title="Roles & responsibilities"
          description="Choose the work you want to find. Only target roles are required."
        >
          <SearchChoices
            label="Target roles"
            hint="Choose one or more. Use Not listed and describe the role below if needed."
            options={roleOptions}
            value={d.roles}
            onChange={(roles) => details({ roles })}
          />
          {d.roles.includes("Not listed") && (
            <Note
              label="Describe your target role"
              value={d.additionalContext}
              onChange={(additionalContext) => details({ additionalContext })}
            />
          )}
          <Choice
            label="Desired level"
            value={d.level}
            options={["", ...levelOptions]}
            onChange={(level) => details({ level })}
          />
          <SearchChoices
            label="Preferred employment types"
            hint="Leave empty if you are open to any type."
            options={employmentTypes}
            value={d.employmentTypes}
            onChange={(employmentTypes) => details({ employmentTypes })}
          />
        </Group>
        <Group
          title="What matters to you?"
          description="These guide the assessment; they do not exclude jobs."
        >
          <SearchChoices
            label="Job priorities"
            options={priorityOptions}
            value={d.priorities}
            onChange={(priorities) => details({ priorities })}
          />
          <SearchChoices
            label="Industries"
            options={industryOptions}
            value={d.industries}
            onChange={(industries) => details({ industries })}
          />
          <SearchChoices
            label="Skills to develop"
            options={skillOptions}
            value={d.learningSkills}
            onChange={(learningSkills) => details({ learningSkills })}
          />
          <Note
            label="Growth interests"
            value={c.growthInterests}
            onChange={(growthInterests) => context({ growthInterests })}
            placeholder="What would you like to learn or take ownership of?"
          />
          <Note
            label="Work you would prefer to avoid"
            value={d.workToAvoid}
            onChange={(workToAvoid) => details({ workToAvoid })}
          />
        </Group>
      </>
    );
  if (section === "experience")
    return (
      <>
        <Group
          title="Your background"
          description="Give the assessment specific evidence of the work you have done."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Display name"
              hint="Optional. Used in your workspace."
            >
              <Input
                autoComplete="name"
                maxLength={200}
                value={d.name}
                onChange={(e) => details({ name: e.target.value })}
              />
            </Field>
            <Field label="Years of experience">
              <Input
                type="number"
                min={0}
                max={80}
                step={0.5}
                value={c.yearsExperience ?? ""}
                onChange={(e) =>
                  context({
                    yearsExperience:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Note
            label="Work experience"
            hint="Include roles, dates, responsibilities, and achievements. Keep the details that matter."
            value={c.experience}
            onChange={(experience) => context({ experience })}
            placeholder="Where have you worked, and what did you contribute?"
          />
          <SearchChoices
            label="Demonstrated skills"
            hint="Skills you have used in work, projects, or study."
            options={skillOptions}
            value={d.skills}
            onChange={(skills) => details({ skills })}
          />
          <Note
            label="Education and training"
            value={d.education}
            onChange={(education) => details({ education })}
            placeholder="Qualifications, courses, or relevant self-directed study."
          />
        </Group>
        <Group
          title="Projects"
          description="Your contribution matters more than the project title."
        >
          {!c.projects.length && (
            <div className="profile-empty">
              No projects added. Add one that shows what you can do.
            </div>
          )}
          {c.projects.map((p, i) => (
            <fieldset key={i} className="profile-project">
              <legend className="px-1 text-xs text-muted-foreground">
                Project {i + 1}
              </legend>
              <div className="space-y-4">
                {(
                  [
                    "title",
                    "url",
                    "technologies",
                    "contribution",
                    "results",
                  ] as const
                ).map((key) => {
                  const label = {
                    title: "Project name",
                    url: "Project link",
                    technologies: "Technologies used",
                    contribution: "What did you personally contribute?",
                    results: "What was the result?",
                  }[key];
                  const update = (value: string) =>
                    context({
                      projects: c.projects.map((project, index) =>
                        index === i ? { ...project, [key]: value } : project,
                      ),
                    });
                  return key === "contribution" || key === "results" ? (
                    <Note
                      key={key}
                      label={label}
                      value={p[key]}
                      onChange={update}
                      hint={
                        key === "results"
                          ? "Qualitative outcomes are welcome. Leave blank if unknown."
                          : undefined
                      }
                    />
                  ) : (
                    <Field key={key} label={label}>
                      <Input
                        type={key === "url" ? "url" : "text"}
                        value={p[key]}
                        onChange={(e) => update(e.target.value)}
                        required={key === "title"}
                      />
                    </Field>
                  );
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    context({
                      projects: c.projects.filter((_, index) => index !== i),
                    })
                  }
                >
                  <Trash2 />
                  Remove project
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={c.projects.length >= 50}
            onClick={() =>
              context({
                projects: [
                  ...c.projects,
                  {
                    title: "",
                    url: "",
                    technologies: "",
                    contribution: "",
                    results: "",
                  },
                ],
              })
            }
          >
            <Plus />
            Add project
          </Button>
        </Group>
        <Group
          title="Anything else we should understand?"
          description="Career changes, exceptions, and details not covered by the options above."
        >
          <Note
            label="Additional context"
            value={d.additionalContext}
            onChange={(additionalContext) => details({ additionalContext })}
          />
        </Group>
        {(form.preferredSkills ||
          form.locationPreferences ||
          form.dealBreakers ||
          c.industries ||
          c.compensationExpectations ||
          (form.targetRoles && !d.roles.length)) && (
          <Group
            title="Previous profile notes"
            description="Your existing answers are preserved. Review or update them as you move to the structured fields."
          >
            {!d.roles.length && (
              <Note
                label="Previous target roles"
                value={form.targetRoles}
                onChange={(targetRoles) => onChange({ ...form, targetRoles })}
              />
            )}
            {(
              [
                "preferredSkills",
                "locationPreferences",
                "dealBreakers",
              ] as const
            )
              .filter((key) => form[key])
              .map((key) => (
                <Note
                  key={key}
                  label={
                    {
                      preferredSkills: "Previous skills",
                      locationPreferences: "Previous location preferences",
                      dealBreakers: "Advisory deal-breakers",
                    }[key]
                  }
                  value={form[key]}
                  onChange={(value) => onChange({ ...form, [key]: value })}
                />
              ))}
            {c.industries && (
              <Note
                label="Previous industry notes"
                value={c.industries}
                onChange={(industries) => context({ industries })}
              />
            )}
            {c.compensationExpectations && (
              <Note
                label="Previous compensation notes"
                value={c.compensationExpectations}
                onChange={(compensationExpectations) =>
                  context({ compensationExpectations })
                }
              />
            )}
          </Group>
        )}
      </>
    );
  return (
    <>
      {catalogs.error && (
        <p role="alert">
          Location options could not load.{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void catalogs.refetch()}
          >
            Retry
          </Button>
        </p>
      )}
      <Group
        title="Where would you like to work?"
        description="Your current location and preferred job locations are separate."
      >
        <LocationPicker
          label="Current location"
          value={d.residence ? [d.residence] : []}
          onChange={(values) => details({ residence: values[0] ?? null })}
        />
        <Choice
          label="Preferred work arrangement"
          value={c.workMode}
          options={workModes}
          onChange={(workMode) => context({ workMode })}
          hint="Any means no preference."
        />
        <LocationPicker
          label="Preferred job locations"
          multiple
          value={d.preferredLocations}
          onChange={(preferredLocations) => details({ preferredLocations })}
        />
        {(c.workMode === "remote" || c.workMode === "any") && (
          <>
            <Choice
              label="Remote location preference"
              value={d.remoteScope}
              options={["unspecified", "worldwide", "selected-countries"]}
              onChange={(remoteScope) =>
                details({
                  remoteScope,
                  remoteCountries:
                    remoteScope === "selected-countries"
                      ? d.remoteCountries
                      : [],
                })
              }
            />
            {d.remoteScope === "selected-countries" && (
              <SearchChoices
                label="Remote countries"
                options={countries}
                value={d.remoteCountries}
                onChange={(remoteCountries) => details({ remoteCountries })}
              />
            )}
          </>
        )}
        <Choice
          label="Open to relocation?"
          value={d.relocation}
          options={relocationOptions}
          onChange={(relocation) => details({ relocation })}
        />
      </Group>
      <Group
        title="Work authorization & availability"
        description="A location preference does not establish permission to work there."
      >
        <SearchChoices
          label="Countries where you can work"
          hint="Select only confirmed eligibility. Leave unknown countries unselected."
          options={countries}
          value={constraints.countries}
          onChange={(countries) => required({ countries })}
        />
        <Choice
          label="Do you need sponsorship?"
          value={d.sponsorship}
          options={sponsorshipOptions}
          onChange={(sponsorship) => details({ sponsorship })}
        />
        <Note
          label="Work eligibility notes"
          value={c.eligibilityNotes}
          onChange={(eligibilityNotes) => context({ eligibilityNotes })}
        />
        <Choice
          label="When could you start?"
          value={d.availability}
          options={[
            "Not specified",
            "Immediately",
            "Within 2 weeks",
            "Within 1 month",
            "Within 3 months",
            "Open to discussion",
          ]}
          onChange={(availability) => details({ availability })}
        />
        <SearchChoices
          label="Timezone"
          single
          options={catalogs.data?.timezones ?? []}
          value={d.timezone ? [d.timezone] : []}
          onChange={(v) => details({ timezone: v[0] ?? "" })}
        />
        <Note
          label="Working-hour preferences"
          value={d.workingHours}
          onChange={(workingHours) => details({ workingHours })}
          placeholder="For example, available for meetings from 9 am to 6 pm in the selected timezone."
        />
      </Group>
      <Group
        title="Non-negotiable requirements"
        description="Only explicit requirements can flag a job as a conflict. Missing job information stays unknown."
      >
        <Choice
          label="Required work arrangement"
          value={constraints.workMode}
          options={workModes}
          onChange={(workMode) => required({ workMode })}
          hint="Any means no requirement."
        />
        <SearchChoices
          label="Required employment types"
          hint="Leave empty for no requirement."
          options={employmentTypes}
          value={constraints.employmentTypes}
          onChange={(employmentTypes) => required({ employmentTypes })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum compensation">
            <Input
              type="number"
              min={0}
              value={constraints.minimumSalary ?? ""}
              onChange={(e) =>
                required({
                  minimumSalary:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <SearchChoices
            label="Currency"
            single
            options={catalogs.data?.currencies ?? [constraints.currency]}
            value={[constraints.currency]}
            onChange={(v) => {
              if (v[0]) required({ currency: v[0] });
            }}
          />
          <Choice
            label="Pay period"
            value={constraints.salaryPeriod}
            options={["year", "month", "hour"]}
            onChange={(salaryPeriod) => required({ salaryPeriod })}
          />
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          An undisclosed salary needs clarification. It is not treated as below
          your minimum.
        </p>
      </Group>
    </>
  );
}
