import { z } from "zod";
import { publicUrlSchema } from "./workspace-contracts";
export const companyEvidenceSchema = z.object({
  url: publicUrlSchema,
  title: z.string().max(500).default(""),
  excerpt: z.string().max(4000).default(""),
  retrievedAt: z.iso.datetime(),
  snapshotId: z.string().optional(),
});
export const contactMethodSchema = z
  .object({
    kind: z.enum(["email", "profile"]),
    value: z.string().max(2048),
    sourceUrl: publicUrlSchema,
    status: z
      .enum(["published", "manual", "mailbox_verified"])
      .default("published"),
    checkedAt: z.iso.datetime(),
    provider: z.string().max(100).nullable().default(null),
    verifiedAt: z.iso.datetime().nullable().default(null),
  })
  .superRefine((m, c) => {
    if (m.kind === "email" && !z.email().safeParse(m.value).success)
      c.addIssue({ code: "custom", message: "Enter a valid email address." });
    if (m.kind === "profile" && !publicUrlSchema.safeParse(m.value).success)
      c.addIssue({ code: "custom", message: "Enter a public profile URL." });
    if (m.status === "mailbox_verified" && (!m.provider || !m.verifiedAt))
      c.addIssue({
        code: "custom",
        message:
          "Mailbox verification requires a provider and verification date.",
      });
    if (m.status !== "mailbox_verified" && m.verifiedAt)
      c.addIssue({
        code: "custom",
        message:
          "Published or manual methods cannot have a mailbox verification date.",
      });
  });
export const companyContactInputSchema = z
  .object({
    name: z.string().trim().max(200).default(""),
    role: z.string().trim().min(1).max(200),
    kind: z.enum(["person", "hiring_inbox", "company_inbox"]),
    methods: z.array(contactMethodSchema).max(15).default([]),
    evidence: z.array(companyEvidenceSchema).max(30).default([]),
  })
  .superRefine((v, c) => {
    if (v.kind === "person" && !v.name)
      c.addIssue({ code: "custom", message: "A person needs a name." });
    if (
      v.kind === "person" &&
      v.methods.some(
        (m) =>
          m.kind === "email" &&
          /^(careers?|jobs?|hiring|hello|info|contact|support|team|founders?)@/i.test(
            m.value,
          ),
      )
    )
      c.addIssue({
        code: "custom",
        message:
          "Generic addresses must be saved as company or hiring inboxes.",
      });
  });
export const companyContactSchema = companyContactInputSchema.safeExtend({
  id: z.string(),
  companyId: z.string(),
  identity: z.string(),
  manual: z.boolean(),
  checkedAt: z.iso.datetime(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CompanyContact = z.infer<typeof companyContactSchema>;
export type CompanyEvidence = z.infer<typeof companyEvidenceSchema>;
export type ContactMethod = z.infer<typeof contactMethodSchema>;
export const crawlMetadataSchema = z
  .object({
    description: z.string().default(""),
    siteName: z.string().default(""),
    emails: z
      .array(
        z.object({
          email: z.string(),
          context: z.string(),
          name: z.string().optional(),
          role: z.string().optional(),
        }),
      )
      .default([]),
    people: z
      .array(
        z.object({
          name: z.string(),
          role: z.string(),
          email: z.string().optional(),
          profiles: z.array(z.string()).default([]),
        }),
      )
      .default([]),
    images: z
      .array(
        z.object({
          url: z.string(),
          kind: z.enum(["logo", "favicon"]),
          source: z.string(),
        }),
      )
      .default([]),
    structuredData: z.array(z.unknown()).default([]),
    publishedAt: z.string().nullable().default(null),
    directoryCompany: z
      .record(z.string(), z.unknown())
      .nullable()
      .default(null),
  })
  .default({
    description: "",
    siteName: "",
    emails: [],
    people: [],
    images: [],
    structuredData: [],
    publishedAt: null,
    directoryCompany: null,
  });
export type CrawlMetadata = z.infer<typeof crawlMetadataSchema>;
