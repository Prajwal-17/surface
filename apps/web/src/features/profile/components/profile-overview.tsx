import { type ReactNode } from "react";
import { ProfileMarkdown } from "@/components/ui/profile-markdown";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationLabel, optionLabel } from "./profile-controls";
import { type EditorProfile, type ProfileSection } from "./profile-sections";
import {
  personalContextSchema,
  profileDetailsSchema,
} from "@surface/contracts";
function Entry({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="profile-review-entry">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Values({ values }: { values: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {values.map((value) => (
        <li
          key={value}
          className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {optionLabel(value)}
        </li>
      ))}
    </ul>
  );
}
function empty(text: string) {
  return <p className="text-xs leading-6 text-muted-foreground">{text}</p>;
}
export function ProfileOverview({
  form,
  onEdit,
}: {
  form: EditorProfile;
  onEdit: (s: ProfileSection) => void;
}) {
  const c = personalContextSchema.parse(form.context);
  const d = profileDetailsSchema.parse(c.details ?? {}),
    req = c.constraints;
  const hasBackground = !!(
    d.name ||
    c.experience ||
    c.yearsExperience !== null ||
    d.skills.length ||
    d.education ||
    c.projects.length ||
    d.additionalContext
  );
  const hasLocation = !!(
    d.residence ||
    d.preferredLocations.length ||
    c.workMode !== "any" ||
    d.remoteScope !== "unspecified" ||
    d.relocation !== "Not specified" ||
    req.countries.length ||
    d.sponsorship !== "Not specified" ||
    c.eligibilityNotes ||
    d.availability !== "Not specified" ||
    d.timezone ||
    d.workingHours ||
    req.workMode !== "any" ||
    req.employmentTypes.length ||
    req.minimumSalary !== null
  );
  function heading(title: string, section: ProfileSection) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onEdit(section)}
          aria-label={`Edit ${title.toLowerCase()}`}
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <section className="profile-review-card">
        {heading("Career goals", "goals")}
        <dl>
          {d.roles.length || form.targetRoles ? (
            <Entry label="Target roles">
              {d.roles.length ? <Values values={d.roles} /> : form.targetRoles}
            </Entry>
          ) : null}
          {d.level && <Entry label="Desired level">{d.level}</Entry>}
          {d.employmentTypes.length > 0 && (
            <Entry label="Employment preference">
              <Values values={d.employmentTypes} />
            </Entry>
          )}
          {d.priorities.length > 0 && (
            <Entry label="Priorities">
              <Values values={d.priorities} />
            </Entry>
          )}
          {d.industries.length > 0 && (
            <Entry label="Industries">
              <Values values={d.industries} />
            </Entry>
          )}
          {d.learningSkills.length > 0 && (
            <Entry label="Skills to develop">
              <Values values={d.learningSkills} />
            </Entry>
          )}
          {c.growthInterests && (
            <Entry label="Growth interests">
              <ProfileMarkdown>{c.growthInterests}</ProfileMarkdown>
            </Entry>
          )}
          {d.workToAvoid && (
            <Entry label="Work to avoid">
              <ProfileMarkdown>{d.workToAvoid}</ProfileMarkdown>
            </Entry>
          )}
        </dl>
        {!d.roles.length &&
          !form.targetRoles &&
          empty("Choose target roles to start assessing opportunities.")}
      </section>
      <section className="profile-review-card">
        {heading("Experience & projects", "experience")}
        <dl>
          {d.name && <Entry label="Display name">{d.name}</Entry>}
          {d.email && <Entry label="Email">{d.email}</Entry>}
          {c.experience && (
            <Entry label="Experience">
              <ProfileMarkdown>{c.experience}</ProfileMarkdown>
            </Entry>
          )}
          {c.yearsExperience !== null && (
            <Entry label="Years of experience">{c.yearsExperience}</Entry>
          )}
          {d.skills.length > 0 && (
            <Entry label="Demonstrated skills">
              <Values values={d.skills} />
            </Entry>
          )}
          {d.education && (
            <Entry label="Education">
              <ProfileMarkdown>{d.education}</ProfileMarkdown>
            </Entry>
          )}
          {c.projects.map((p, i) => (
            <Entry key={i} label={p.title || `Project ${i + 1}`}>
              <div className="space-y-2">
                {p.technologies && (
                  <ProfileMarkdown>{p.technologies}</ProfileMarkdown>
                )}
                {p.contribution && (
                  <ProfileMarkdown>{p.contribution}</ProfileMarkdown>
                )}
                {p.results && <ProfileMarkdown>{p.results}</ProfileMarkdown>}
                {p.url && (
                  <a
                    className="break-all text-brand underline underline-offset-4"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.url}
                  </a>
                )}
              </div>
            </Entry>
          ))}
          {d.additionalContext && (
            <Entry label="Additional context">
              <ProfileMarkdown>{d.additionalContext}</ProfileMarkdown>
            </Entry>
          )}
        </dl>
        {!hasBackground &&
          empty(
            "Add experience, skills, or a project to give assessments useful evidence.",
          )}
      </section>
      <section className="profile-review-card">
        {heading("Locations & requirements", "locations")}
        <dl>
          {d.residence && (
            <Entry label="Current location">
              <LocationLabel value={d.residence} />
            </Entry>
          )}
          {d.preferredLocations.length > 0 && (
            <Entry label="Preferred locations">
              {d.preferredLocations.map((v, i) => (
                <p key={i}>
                  <LocationLabel value={v} />
                </p>
              ))}
            </Entry>
          )}
          {c.workMode !== "any" && (
            <Entry label="Preferred arrangement">
              {optionLabel(c.workMode)}
            </Entry>
          )}
          {d.remoteScope !== "unspecified" && (
            <Entry label="Remote preference">
              {d.remoteScope === "selected-countries"
                ? d.remoteCountries.map((code) => (
                    <p key={code}>
                      <LocationLabel
                        value={{ countryCode: code, cityId: null }}
                      />
                    </p>
                  ))
                : "Worldwide"}
            </Entry>
          )}
          {d.relocation !== "Not specified" && (
            <Entry label="Relocation">{d.relocation}</Entry>
          )}
          {req.countries.length > 0 && (
            <Entry label="Eligible countries">
              {req.countries.map((code) => (
                <p key={code}>
                  <LocationLabel value={{ countryCode: code, cityId: null }} />
                </p>
              ))}
            </Entry>
          )}
          {d.sponsorship !== "Not specified" && (
            <Entry label="Sponsorship">{d.sponsorship}</Entry>
          )}
          {c.eligibilityNotes && (
            <Entry label="Eligibility notes">
              <ProfileMarkdown>{c.eligibilityNotes}</ProfileMarkdown>
            </Entry>
          )}
          {d.availability !== "Not specified" && (
            <Entry label="Availability">{d.availability}</Entry>
          )}
          {d.timezone && <Entry label="Timezone">{d.timezone}</Entry>}
          {d.workingHours && (
            <Entry label="Working hours">
              <ProfileMarkdown>{d.workingHours}</ProfileMarkdown>
            </Entry>
          )}
          {req.workMode !== "any" && (
            <Entry label="Required arrangement">
              {optionLabel(req.workMode)}
            </Entry>
          )}
          {req.employmentTypes.length > 0 && (
            <Entry label="Required employment">
              <Values values={req.employmentTypes} />
            </Entry>
          )}
          {req.minimumSalary !== null && (
            <Entry label="Minimum compensation">{`${req.minimumSalary.toLocaleString()} ${req.currency} / ${req.salaryPeriod}`}</Entry>
          )}
        </dl>
        {!hasLocation &&
          empty(
            "Add your location preferences or any non-negotiable requirements.",
          )}
      </section>
      {(form.preferredSkills ||
        form.locationPreferences ||
        form.dealBreakers ||
        c.industries ||
        c.compensationExpectations) && (
        <section className="profile-review-card">
          {heading("Previous profile notes", "experience")}
          <dl>
            {form.preferredSkills && (
              <Entry label="Skills">
                <ProfileMarkdown>{form.preferredSkills}</ProfileMarkdown>
              </Entry>
            )}
            {form.locationPreferences && (
              <Entry label="Location preferences">
                <ProfileMarkdown>{form.locationPreferences}</ProfileMarkdown>
              </Entry>
            )}
            {form.dealBreakers && (
              <Entry label="Advisory deal-breakers">
                <ProfileMarkdown>{form.dealBreakers}</ProfileMarkdown>
              </Entry>
            )}
            {c.industries && (
              <Entry label="Industries">
                <ProfileMarkdown>{c.industries}</ProfileMarkdown>
              </Entry>
            )}
            {c.compensationExpectations && (
              <Entry label="Compensation notes">
                <ProfileMarkdown>{c.compensationExpectations}</ProfileMarkdown>
              </Entry>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
