import { sep, resolve } from "node:path";
import { env } from "../src/config/env";
import {
  closeDatabase,
  executeStatement,
  transaction,
} from "../src/infrastructure/database/client";
import { runMigrations } from "../src/infrastructure/database/migrate";

if (env.APP_ENV !== "development") {
  throw new Error(
    "Fake tracker data can only be added with APP_ENV=development.",
  );
}
const databasePath = resolve(env.SQLITE_DATABASE_FILE);
const isKnownDevelopmentDatabase =
  databasePath.includes(`${sep}Surface Dev${sep}`) ||
  databasePath === resolve(env.DATA_DIR, "surface.sqlite3");
if (!isKnownDevelopmentDatabase) {
  throw new Error(
    `Refusing to seed an unrecognized database path: ${databasePath}. Use the Surface Dev database or data/development/surface.sqlite3.`,
  );
}

await runMigrations();
const createdAt = new Date().toISOString();
const companies = [
  {
    id: "dev-example-company-aster-peak",
    name: "Aster Peak",
    website: "https://asterpeak.example",
    location: "Remote",
    status: "To research",
    notes: "Fictional developer tools company.",
  },
  {
    id: "dev-example-company-copperline",
    name: "Copperline",
    website: "https://copperline.example",
    location: "Bengaluru",
    status: "Outreach",
    notes: "Fictional infrastructure startup.",
  },
  {
    id: "dev-example-company-juniper-forge",
    name: "Juniper Forge",
    website: "https://juniperforge.example",
    location: "Remote",
    status: "Listed",
    notes: "Fictional climate software team.",
  },
  {
    id: "dev-example-company-paper-kite",
    name: "Paper Kite",
    website: "https://paperkite.example",
    location: "Mumbai",
    status: "Listed",
    notes: "Fictional collaboration product.",
  },
  {
    id: "dev-example-company-brightpath",
    name: "Brightpath Studio",
    website: "https://brightpath.example",
    location: "Pune",
    status: "Archived",
    notes: "Fictional company for tracker examples.",
  },
  {
    id: "dev-example-company-meridian-works",
    name: "Meridian Works",
    website: "https://meridianworks.example",
    location: "Remote · North America",
    status: "To research",
    notes:
      "Fictional engineering productivity company building tools for distributed teams.",
  },
  {
    id: "dev-example-company-moss-mettle",
    name: "Moss & Mettle",
    website: "https://mossandmettle.example",
    location: "Toronto, ON",
    status: "Outreach",
    notes:
      "Fictional climate analytics startup focused on building energy use.",
  },
  {
    id: "dev-example-company-circuit-harbor",
    name: "Circuit Harbor",
    website: "https://circuitharbor.example",
    location: "Singapore",
    status: "Listed",
    notes:
      "Fictional payments infrastructure company serving small businesses.",
  },
  {
    id: "dev-example-company-bloomstack-health",
    name: "Bloomstack Health",
    website: "https://bloomstack.example",
    location: "Bengaluru · Hybrid",
    status: "Listed",
    notes: "Fictional care coordination software team.",
  },
];
const applications = [
  {
    id: "dev-example-application-aster-platform",
    title: "Platform Engineer",
    companyId: companies[0]!.id,
    status: "To apply",
    type: "Job",
    sourceUrl: "https://jobs.asterpeak.example/platform",
    contactedOn: null,
    outcome: "",
    notes: "Example opportunity.",
  },
  {
    id: "dev-example-application-copper-intern",
    title: "Software Engineer Intern",
    companyId: companies[1]!.id,
    status: "Applied",
    type: "Intern",
    sourceUrl: "https://jobs.copperline.example/intern",
    contactedOn: "2026-11-12",
    outcome: "",
    notes: "Example application.",
  },
  {
    id: "dev-example-application-copper-web",
    title: "Frontend Engineer",
    companyId: companies[1]!.id,
    status: "In conversation",
    type: "Job",
    sourceUrl: "https://jobs.copperline.example/frontend",
    contactedOn: "2026-11-16",
    outcome: "",
    notes: "Example interview follow-up.",
  },
  {
    id: "dev-example-application-juniper-backend",
    title: "Backend Engineer",
    companyId: companies[2]!.id,
    status: "To apply",
    type: "Job",
    sourceUrl: "https://jobs.juniperforge.example/backend",
    contactedOn: null,
    outcome: "",
    notes: "Example opportunity.",
  },
  {
    id: "dev-example-application-paper-fullstack",
    title: "Full Stack Engineer",
    companyId: companies[3]!.id,
    status: "Closed",
    type: "Job",
    sourceUrl: "https://jobs.paperkite.example/fullstack",
    contactedOn: "2026-11-01",
    outcome: "Role filled",
    notes: "Example closed application.",
  },
  {
    id: "dev-example-application-meridian-product",
    title: "Senior Product Engineer",
    companyId: companies[5]!.id,
    status: "Applied",
    type: "Job",
    sourceUrl: "https://jobs.meridianworks.example/product-engineer",
    contactedOn: "2026-11-17",
    outcome: "",
    notes:
      "Tailored portfolio toward internal developer tooling and collaboration.",
  },
  {
    id: "dev-example-application-meridian-platform",
    title: "Staff Platform Engineer",
    companyId: companies[5]!.id,
    status: "In conversation",
    type: "Job",
    sourceUrl: "https://jobs.meridianworks.example/platform",
    contactedOn: "2026-11-18",
    outcome: "",
    notes:
      "Recruiter intro scheduled; ask about team scope and on-call rotation.",
  },
  {
    id: "dev-example-application-moss-data",
    title: "Data Platform Engineer",
    companyId: companies[6]!.id,
    status: "To apply",
    type: "Job",
    sourceUrl: "https://jobs.mossandmettle.example/data-platform",
    contactedOn: null,
    outcome: "",
    notes: "Role aligns with data infrastructure and climate interest.",
  },
  {
    id: "dev-example-application-moss-intern",
    title: "Software Engineering Intern",
    companyId: companies[6]!.id,
    status: "Closed",
    type: "Intern",
    sourceUrl: "https://jobs.mossandmettle.example/intern",
    contactedOn: "2026-10-29",
    outcome: "Position paused",
    notes: "Fictional closed opportunity for the sample view.",
  },
  {
    id: "dev-example-application-circuit-backend",
    title: "Backend Engineer, Payments",
    companyId: companies[7]!.id,
    status: "Applied",
    type: "Job",
    sourceUrl: "https://jobs.circuitharbor.example/backend",
    contactedOn: "2026-11-10",
    outcome: "",
    notes: "Emphasized API design and transaction safety in the application.",
  },
  {
    id: "dev-example-application-bloom-fullstack",
    title: "Full Stack Engineer",
    companyId: companies[8]!.id,
    status: "To apply",
    type: "Job",
    sourceUrl: "https://jobs.bloomstack.example/full-stack",
    contactedOn: null,
    outcome: "",
    notes: "Review product and data privacy approach before applying.",
  },
  {
    id: "dev-example-application-bloom-intern",
    title: "Product Engineering Intern",
    companyId: companies[8]!.id,
    status: "In conversation",
    type: "Intern",
    sourceUrl: "https://jobs.bloomstack.example/intern",
    contactedOn: "2026-11-15",
    outcome: "",
    notes: "Fictional second open application under the same company.",
  },
];
const applicationDetails: Record<
  string,
  {
    description: string;
    location: string;
    employmentType: string;
    workMode: "remote" | "hybrid" | "onsite" | "unknown";
    compensation: string;
    appliedOn: string | null;
    followUpOn: string | null;
    contactName: string;
    contactEmail: string;
  }
> = {
  "dev-example-application-aster-platform": {
    description:
      "Build and operate the internal platform used by product engineering teams. Own service reliability, deployment workflows, and observability foundations. Partner with application teams to reduce operational toil and improve release confidence.",
    location: "Remote · North America",
    employmentType: "Full-time",
    workMode: "remote",
    compensation: JSON.stringify({ original: "$145k–$185k USD / year" }),
    appliedOn: null,
    followUpOn: null,
    contactName: "",
    contactEmail: "",
  },
  "dev-example-application-copper-intern": {
    description:
      "Work with a small product team to ship customer-facing web features. The internship includes a scoped project, weekly mentoring, and opportunities to learn the team's testing and release practices.",
    location: "Bengaluru, India",
    employmentType: "Internship · 12 weeks",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "₹50k–₹75k INR / month" }),
    appliedOn: "2026-11-10",
    followUpOn: "2026-11-20",
    contactName: "Maya Shah",
    contactEmail: "maya.shah@copperline.example",
  },
  "dev-example-application-copper-web": {
    description:
      "Own accessible, fast interfaces for Copperline's payment and account tools. Collaborate with design and backend engineers, improve shared UI patterns, and help maintain quality through review and automated testing.",
    location: "Bengaluru, India",
    employmentType: "Full-time",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "₹24–₹34 LPA INR / year" }),
    appliedOn: "2026-11-14",
    followUpOn: "2026-11-24",
    contactName: "Ishan Rao",
    contactEmail: "ishan.rao@copperline.example",
  },
  "dev-example-application-juniper-backend": {
    description:
      "Design reliable APIs and data workflows for climate reporting products. Work across ingestion, storage, and customer-facing services with an emphasis on clear operational ownership.",
    location: "Remote · India",
    employmentType: "Full-time",
    workMode: "remote",
    compensation: JSON.stringify({ original: "₹30–₹42 LPA INR / year" }),
    appliedOn: null,
    followUpOn: null,
    contactName: "",
    contactEmail: "",
  },
  "dev-example-application-paper-fullstack": {
    description:
      "Build collaboration workflows across the web application and its APIs. This posting is retained as a closed opportunity for tracker history.",
    location: "Mumbai, India",
    employmentType: "Full-time",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "₹22–₹32 LPA INR / year" }),
    appliedOn: "2026-10-28",
    followUpOn: null,
    contactName: "Nina Desai",
    contactEmail: "nina.desai@paperkite.example",
  },
  "dev-example-application-meridian-product": {
    description:
      "Build product surfaces for engineering teams that coordinate work across services. Bring strong product judgment to a small team and work closely with customers to refine internal tooling workflows.",
    location: "Remote · North America",
    employmentType: "Full-time",
    workMode: "remote",
    compensation: JSON.stringify({ original: "$160k–$205k USD / year" }),
    appliedOn: "2026-11-15",
    followUpOn: "2026-11-22",
    contactName: "Lena Park",
    contactEmail: "lena.park@meridianworks.example",
  },
  "dev-example-application-meridian-platform": {
    description:
      "Lead platform projects spanning deployment, service ownership, and infrastructure automation. The role includes mentoring engineers and setting pragmatic reliability standards across several product teams.",
    location: "Remote · North America",
    employmentType: "Full-time",
    workMode: "remote",
    compensation: JSON.stringify({ original: "$185k–$230k USD / year" }),
    appliedOn: "2026-11-13",
    followUpOn: "2026-11-21",
    contactName: "Jordan Lee",
    contactEmail: "jordan.lee@meridianworks.example",
  },
  "dev-example-application-moss-data": {
    description:
      "Develop data pipelines and product APIs that turn building telemetry into useful energy insights. Work with analysts and product engineers on reliable ingestion, quality checks, and clear data contracts.",
    location: "Toronto, Canada",
    employmentType: "Full-time",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "CA$125k–CA$160k / year" }),
    appliedOn: null,
    followUpOn: null,
    contactName: "",
    contactEmail: "",
  },
  "dev-example-application-moss-intern": {
    description:
      "Join the engineering team for a mentored internship focused on data visualization and product workflows. This opportunity is closed because the position was paused.",
    location: "Toronto, Canada",
    employmentType: "Internship · 16 weeks",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "CA$28–CA$34 / hour" }),
    appliedOn: "2026-10-24",
    followUpOn: null,
    contactName: "Amara Patel",
    contactEmail: "amara.patel@mossandmettle.example",
  },
  "dev-example-application-circuit-backend": {
    description:
      "Build payment processing APIs with strong observability and predictable failure handling. Work with product and risk teams to make transaction flows safer for small businesses.",
    location: "Singapore",
    employmentType: "Full-time",
    workMode: "onsite",
    compensation: JSON.stringify({ original: "S$120k–S$155k / year" }),
    appliedOn: "2026-11-08",
    followUpOn: "2026-11-19",
    contactName: "Ethan Lim",
    contactEmail: "ethan.lim@circuitharbor.example",
  },
  "dev-example-application-bloom-fullstack": {
    description:
      "Deliver product features for a care coordination platform, from accessible web interfaces through API integrations. Partner with clinical operations to understand workflows and build privacy-conscious software.",
    location: "Bengaluru, India",
    employmentType: "Full-time",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "₹26–₹38 LPA INR / year" }),
    appliedOn: null,
    followUpOn: null,
    contactName: "",
    contactEmail: "",
  },
  "dev-example-application-bloom-intern": {
    description:
      "Support a product engineering squad with a clearly scoped feature project. The team provides code review, pairing time, and a mentor throughout the internship.",
    location: "Bengaluru, India",
    employmentType: "Internship · 6 months",
    workMode: "hybrid",
    compensation: JSON.stringify({ original: "₹45k–₹65k INR / month" }),
    appliedOn: "2026-11-09",
    followUpOn: "2026-11-21",
    contactName: "Riya Menon",
    contactEmail: "riya.menon@bloomstack.example",
  },
};

try {
  await transaction(async () => {
    for (const company of companies) {
      await executeStatement(
        `INSERT OR IGNORE INTO tracker_companies(id,name,website,location,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
        [
          company.id,
          company.name,
          company.website,
          company.location,
          company.status,
          company.notes,
          createdAt,
          createdAt,
        ],
      );
    }
    for (const application of applications) {
      const details = applicationDetails[application.id]!;
      await executeStatement(
        `INSERT OR IGNORE INTO tracker_applications(id,title,company_id,status,type,description,location,employment_type,work_mode,compensation,source_url,applied_on,contacted_on,follow_up_on,contact_name,contact_email,outcome,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          application.id,
          application.title,
          application.companyId,
          application.status,
          application.type,
          details.description,
          details.location,
          details.employmentType,
          details.workMode,
          details.compensation,
          application.sourceUrl,
          details.appliedOn,
          application.contactedOn,
          details.followUpOn,
          details.contactName,
          details.contactEmail,
          application.outcome,
          application.notes,
          createdAt,
          createdAt,
        ],
      );
      await executeStatement(
        `UPDATE tracker_applications SET
          description=CASE WHEN description='' THEN ? ELSE description END,
          location=CASE WHEN location='' THEN ? ELSE location END,
          employment_type=CASE WHEN employment_type='' THEN ? ELSE employment_type END,
          work_mode=CASE WHEN work_mode='unknown' THEN ? ELSE work_mode END,
          compensation=CASE WHEN compensation='' THEN ? ELSE compensation END,
          applied_on=COALESCE(applied_on, ?),
          follow_up_on=COALESCE(follow_up_on, ?),
          contact_name=CASE WHEN contact_name='' THEN ? ELSE contact_name END,
          contact_email=CASE WHEN contact_email='' THEN ? ELSE contact_email END
         WHERE id=?`,
        [
          details.description,
          details.location,
          details.employmentType,
          details.workMode,
          details.compensation,
          details.appliedOn,
          details.followUpOn,
          details.contactName,
          details.contactEmail,
          application.id,
        ],
      );
    }
  });
  const [companyCount] = await executeStatement<{ count: number }>(
    "SELECT COUNT(*) AS count FROM tracker_companies WHERE id LIKE 'dev-example-company-%'",
  );
  const [applicationCount] = await executeStatement<{ count: number }>(
    "SELECT COUNT(*) AS count FROM tracker_applications WHERE id LIKE 'dev-example-application-%'",
  );
  console.info(
    `Development tracker sample ready: ${companyCount?.count ?? 0} fictional companies and ${applicationCount?.count ?? 0} fictional applications in ${databasePath}.`,
  );
} finally {
  await closeDatabase();
}
