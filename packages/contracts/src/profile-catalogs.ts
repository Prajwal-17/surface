import { z } from "zod";

export const roleOptions = [
  "Frontend engineer",
  "Backend engineer",
  "Full-stack engineer",
  "Software engineer",
  "Mobile engineer",
  "Platform engineer",
  "DevOps engineer",
  "Site reliability engineer",
  "Cloud engineer",
  "Security engineer",
  "QA engineer",
  "Data engineer",
  "Data analyst",
  "Data scientist",
  "Machine learning engineer",
  "AI engineer",
  "Embedded engineer",
  "Engineering manager",
  "Technical lead",
  "Solutions architect",
  "Solutions engineer",
  "Developer advocate",
  "Technical writer",
  "Product manager",
  "Project manager",
  "Program manager",
  "Product designer",
  "UX designer",
  "UI designer",
  "UX researcher",
  "Graphic designer",
  "Business analyst",
  "Marketing specialist",
  "Content writer",
  "Sales representative",
  "Account executive",
  "Customer success manager",
  "Customer support specialist",
  "Operations manager",
  "Recruiter",
  "HR specialist",
  "Finance analyst",
  "Accountant",
  "Consultant",
  "Researcher",
  "Teacher",
  "Healthcare professional",
  "Administrative assistant",
  "Not listed",
] as const;
export const skillOptions = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Svelte",
  "HTML",
  "CSS",
  "Tailwind CSS",
  "Accessibility",
  "Design systems",
  "Node.js",
  "Bun",
  "Hono",
  "Express",
  "Python",
  "Django",
  "FastAPI",
  "Go",
  "Rust",
  "Java",
  "Spring",
  "C",
  "C++",
  "C#",
  ".NET",
  "PHP",
  "Laravel",
  "Ruby",
  "Rails",
  "Swift",
  "Kotlin",
  "Flutter",
  "React Native",
  "SQL",
  "PostgreSQL",
  "MySQL",
  "SQLite",
  "MongoDB",
  "Redis",
  "GraphQL",
  "REST APIs",
  "Git",
  "Linux",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "Google Cloud",
  "Cloudflare",
  "Terraform",
  "CI/CD",
  "Testing",
  "System design",
  "Distributed systems",
  "Security",
  "Machine learning",
  "PyTorch",
  "TensorFlow",
  "LLM applications",
  "Data analysis",
  "Data visualization",
  "Excel",
  "Power BI",
  "Tableau",
  "Figma",
  "User research",
  "Prototyping",
  "Product strategy",
  "Project management",
  "Agile",
  "Technical writing",
  "Copywriting",
  "SEO",
  "Digital marketing",
  "Sales",
  "Customer support",
  "Communication",
  "Leadership",
  "Recruiting",
  "Financial analysis",
  "Not listed",
] as const;
export const industryOptions = [
  "Technology",
  "Developer tools",
  "AI and machine learning",
  "Finance",
  "Healthcare",
  "Education",
  "E-commerce",
  "Media and entertainment",
  "Climate and energy",
  "Manufacturing",
  "Logistics",
  "Travel and hospitality",
  "Telecommunications",
  "Government",
  "Nonprofit",
  "Professional services",
  "Real estate",
  "Agriculture",
  "Not listed",
] as const;
export const levelOptions = [
  "Intern / trainee",
  "Entry level",
  "Mid level",
  "Senior",
  "Staff / principal",
  "Lead",
  "Manager",
  "Director / executive",
  "Open to discussion",
] as const;
export const priorityOptions = [
  "Compensation",
  "Learning and mentorship",
  "Ownership",
  "Stability",
  "Flexibility",
  "Work-life balance",
  "Technical challenges",
  "Career progression",
  "Meaningful product",
] as const;
export const relocationOptions = [
  "Not specified",
  "Yes",
  "No",
  "Open to discussion",
] as const;
export const sponsorshipOptions = [
  "Not specified",
  "Needed",
  "Not needed",
  "Unsure",
] as const;
const selected = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .refine((v) => new Set(v).size === v.length, "Remove duplicate selections.")
    .default([]);
const note = z.string().max(100000).default("");
export const profileLocationSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  cityId: z.number().int().positive().nullable().default(null),
});
export type ProfileLocation = z.infer<typeof profileLocationSchema>;
export const profileDetailsSchema = z.object({
  name: z.string().max(200).default(""),
  email: z.union([z.email().max(254), z.literal("")]).default(""),
  roles: selected(roleOptions),
  employmentTypes: z
    .array(
      z.enum(["full-time", "part-time", "contract", "internship", "temporary"]),
    )
    .max(5)
    .default([]),
  level: z.union([z.enum(levelOptions), z.literal("")]).default(""),
  skills: selected(skillOptions),
  learningSkills: selected(skillOptions),
  industries: selected(industryOptions),
  priorities: selected(priorityOptions),
  education: note,
  workToAvoid: note,
  additionalContext: note,
  residence: profileLocationSchema.nullable().default(null),
  preferredLocations: z.array(profileLocationSchema).max(50).default([]),
  remoteScope: z
    .enum(["unspecified", "worldwide", "selected-countries"])
    .default("unspecified"),
  remoteCountries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(250)
    .default([]),
  relocation: z.enum(relocationOptions).default("Not specified"),
  sponsorship: z.enum(sponsorshipOptions).default("Not specified"),
  timezone: z
    .string()
    .refine(
      (v) =>
        !v ||
        (() => {
          try {
            return Boolean(
              new Intl.DateTimeFormat("en", { timeZone: v }).resolvedOptions()
                .timeZone,
            );
          } catch {
            return false;
          }
        })(),
      "Choose a valid timezone.",
    )
    .default(""),
  workingHours: note,
  availability: z
    .enum([
      "Not specified",
      "Immediately",
      "Within 2 weeks",
      "Within 1 month",
      "Within 3 months",
      "Open to discussion",
    ])
    .default("Not specified"),
});
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export const locationOptionSchema = z.object({
  countryCode: z.string(),
  cityId: z.number().nullable(),
  label: z.string(),
});
export type LocationOption = z.infer<typeof locationOptionSchema>;
