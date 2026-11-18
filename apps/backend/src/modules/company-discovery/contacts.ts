import type { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  companyContactInputSchema,
  type CompanyContact,
  type ContactMethod,
} from "@surface/contracts";
import { transaction } from "../../infrastructure/database/client";
import { companyContacts } from "./tables";
import { normalizedName } from "./identity";
import { pageEvidence, type DiscoveryPage } from "./sources";
export function contactPriority(role: string) {
  return /CEO|chief executive/i.test(role)
    ? 0
    : /founder/i.test(role)
      ? 1
      : /CTO|chief technology/i.test(role)
        ? 2
        : /engineering|engineer/i.test(role)
          ? 3
          : /hiring|recruit/i.test(role)
            ? 4
            : 5;
}
const genericEmail = (email: string) =>
  /^(careers?|jobs?|hiring|hello|info|contact|support|team|founders?)@/i.test(
    email,
  );
const inbox = (email: string) =>
  /^(careers?|jobs?|hiring|recruit(?:ing|ment)?)@/i.test(email)
    ? "hiring_inbox"
    : "company_inbox";
export function contactsFromPage(page: DiscoveryPage) {
  const evidence = [pageEvidence(page)],
    checkedAt = page.retrievedAt;
  const method = (kind: "email" | "profile", value: string): ContactMethod => ({
    kind,
    value,
    sourceUrl: page.url,
    status: "published",
    checkedAt,
    provider: null,
    verifiedAt: null,
  });
  const people = page.metadata.people
    .filter((p) => contactPriority(p.role) < 5)
    .slice(0, 12)
    .map((p) => ({
      name: p.name,
      role: p.role,
      kind: "person" as const,
      methods: [
        ...p.profiles
          .filter((v) => /^https?:\/\//.test(v))
          .map((v) => method("profile", v)),
        ...(p.email && !genericEmail(p.email)
          ? [method("email", p.email.toLowerCase())]
          : []),
      ],
      evidence: [
        {
          ...evidence[0]!,
          excerpt: [p.name, p.role, p.email, ...p.profiles]
            .filter(Boolean)
            .join(" · "),
        },
      ],
    }));
  const contacts: Array<z.infer<typeof companyContactInputSchema>> = [
    ...people,
  ];
  const emails = [
    ...page.metadata.emails,
    ...page.metadata.people
      .filter((p) => p.email)
      .map((p) => ({
        email: p.email!.toLowerCase(),
        name: p.name,
        context: `${p.name} · ${p.role}`,
      })),
  ];
  const seenEmails = new Set<string>();
  for (const e of emails) {
    if (seenEmails.has(e.email)) continue;
    seenEmails.add(e.email);
    if (
      people.some((p) =>
        p.methods.some((m) => m.kind === "email" && m.value === e.email),
      )
    )
      continue;
    const named = e.name
      ? people.find((p) => normalizedName(p.name) === normalizedName(e.name!))
      : undefined;
    if (named && !genericEmail(e.email))
      named.methods.push(method("email", e.email));
    else
      contacts.push({
        name: "",
        role:
          inbox(e.email) === "hiring_inbox" ? "Hiring inbox" : "Company inbox",
        kind: inbox(e.email),
        methods: [method("email", e.email)],
        evidence: [{ ...evidence[0]!, excerpt: e.context }],
      });
  }
  return contacts
    .map((v) => companyContactInputSchema.safeParse(v))
    .filter((v) => v.success)
    .map((v) => v.data!)
    .toSorted((a, b) => contactPriority(a.role) - contactPriority(b.role))
    .slice(0, 8);
}
export async function saveContact(
  companyId: string,
  input: unknown,
  manual = false,
  id?: string,
) {
  const data = companyContactInputSchema.parse(input),
    now = new Date().toISOString();
  const identity =
    data.kind === "person"
      ? `person:${normalizedName(data.name)}`
      : `inbox:${data.methods.find((m) => m.kind === "email")?.value.toLowerCase() ?? normalizedName(data.role)}`;
  return transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(companyContacts)
      .where(
        and(
          eq(companyContacts.companyId, companyId),
          id
            ? eq(companyContacts.id, id)
            : eq(companyContacts.identity, identity),
        ),
      );
    if (existing?.manual && !manual) return existing;
    const methods = manual ? data.methods : [...(existing?.methods ?? [])];
    if (!manual)
      for (const m of data.methods) {
        const at = methods.findIndex(
          (v) => v.kind === m.kind && v.value === m.value,
        );
        if (at < 0) methods.push(m);
        else if (methods[at]!.status !== "mailbox_verified") methods[at] = m;
      }
    const evidence = manual
      ? data.evidence
      : [
          ...(existing?.evidence ?? []).filter(
            (e) => !data.evidence.some((v) => v.url === e.url),
          ),
          ...data.evidence,
        ].slice(-30);
    const values = {
      ...data,
      methods: methods.slice(0, 15),
      evidence,
      identity,
      manual: manual || existing?.manual || false,
      checkedAt: manual
        ? now
        : (data.evidence
            .map((e) => e.retrievedAt)
            .toSorted()
            .at(-1) ?? now),
      updatedAt: now,
    };
    if (existing) {
      const [row] = await tx
        .update(companyContacts)
        .set(values)
        .where(eq(companyContacts.id, existing.id))
        .returning();
      return row!;
    }
    const [row] = await tx
      .insert(companyContacts)
      .values({ ...values, id: crypto.randomUUID(), companyId, createdAt: now })
      .returning();
    return row!;
  });
}
export function orderContacts(contacts: CompanyContact[]) {
  return contacts.toSorted(
    (a, b) => contactPriority(a.role) - contactPriority(b.role),
  );
}
