import type { Eligibility, PersonalContext } from "../../shared/contracts";
import type { jobs } from "../jobs/jobs.tables";
const aliases: Record<string, string> = {
  india: "IN",
  in: "IN",
  usa: "US",
  us: "US",
  unitedstates: "US",
  unitedstatesofamerica: "US",
  uk: "GB",
  gb: "GB",
  unitedkingdom: "GB",
  canada: "CA",
  ca: "CA",
  australia: "AU",
  au: "AU",
  germany: "DE",
  de: "DE",
  france: "FR",
  fr: "FR",
  singapore: "SG",
  sg: "SG",
};
export function country(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (aliases[normalized]) return aliases[normalized]!;
  if (/^[a-z]{2}$/.test(normalized)) {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(
      normalized.toUpperCase(),
    );
    if (name && name !== normalized.toUpperCase() && name !== "Unknown Region")
      return normalized.toUpperCase();
  }
  return null;
}
export function checkEligibility(
  job: Pick<
    typeof jobs.$inferSelect,
    "workMode" | "countries" | "compensation" | "employmentType"
  >,
  context: PersonalContext | null,
): Eligibility {
  if (!context)
    return {
      state: "clarify",
      reasons: ["Save your profile to check stated constraints."],
    };
  const c = context.constraints,
    conflicts: string[] = [],
    unknown: string[] = [],
    meets: string[] = [];
  if (c.workMode !== "any") {
    if (job.workMode === "unknown") unknown.push("Work mode is not stated.");
    else if (job.workMode !== c.workMode)
      conflicts.push(
        `Stated work mode (${job.workMode}) conflicts with required ${c.workMode}.`,
      );
    else meets.push(`Work mode matches ${c.workMode}.`);
  }
  if (c.countries.length && job.countries.includes("*"))
    meets.push("The listing explicitly permits worldwide applicants.");
  else if (c.countries.length) {
    const allowed = c.countries.map(country),
      required = job.countries.map(country);
    if (!required.length || required.includes(null) || allowed.includes(null))
      unknown.push(
        "Country eligibility is missing or cannot be compared reliably.",
      );
    else if (!required.some((v) => allowed.includes(v)))
      conflicts.push(
        `Stated eligible countries (${job.countries.join(", ")}) do not include your eligible countries.`,
      );
    else meets.push("At least one stated eligible country matches.");
  }
  if (c.minimumSalary !== null) {
    const salary = job.compensation;
    if (
      !salary ||
      salary.currency !== c.currency ||
      salary.period !== c.salaryPeriod ||
      salary.max === null
    )
      unknown.push(
        "Compensation is missing or not comparable in the same currency and period.",
      );
    else if (salary.max < c.minimumSalary)
      conflicts.push(
        `Stated maximum ${salary.max} ${salary.currency}/${salary.period} is below your minimum ${c.minimumSalary}.`,
      );
    else if (salary.min === null || salary.min < c.minimumSalary)
      unknown.push(
        "The stated compensation range overlaps your minimum; confirm the offer.",
      );
    else meets.push("The stated compensation range meets your minimum.");
  }
  if (c.employmentTypes.length) {
    if (
      !job.employmentType ||
      ![
        "full-time",
        "part-time",
        "contract",
        "internship",
        "temporary",
      ].includes(job.employmentType)
    )
      unknown.push("Employment type is not stated comparably.");
    else if (
      !c.employmentTypes.includes(
        job.employmentType as (typeof c.employmentTypes)[number],
      )
    )
      conflicts.push(
        `Stated employment type (${job.employmentType}) conflicts with your requirements.`,
      );
    else meets.push("Employment type matches.");
  }
  return {
    state: conflicts.length
      ? "conflicts"
      : unknown.length
        ? "clarify"
        : "meets",
    reasons: [
      ...conflicts,
      ...unknown,
      ...meets,
      ...(!conflicts.length && !unknown.length && !meets.length
        ? [
            "No hard constraints specified. This does not establish unstated eligibility.",
          ]
        : []),
    ],
  };
}
