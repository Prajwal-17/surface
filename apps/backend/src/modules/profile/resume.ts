import { z } from "zod";
import { matchResumeLocation } from "./locations";
import { getDocumentProxy, extractText } from "unpdf";
import {
  skillOptions,
  publicUrlSchema,
  resumeDraftSchema,
  type ResumeDraft,
} from "@surface/contracts";
import { HttpError } from "../../shared/errors/http-error";
const excerpt = z.string().max(100000);
function normalizeProjectUrl(raw: string): string {
  const value = raw.trim();
  const existing = publicUrlSchema.safeParse(value);
  if (existing.success) return existing.data;

  // Only add a scheme to recognizable domain links, never to labels or paths.
  const domainLink = value.replace(/^\/\//, "");
  if (
    !/^[^\s/:?#@\\]+\.[^\s/:?#@\\]+(?::\d+)?(?:[/?#][^\s\\]*)?$/.test(
      domainLink,
    )
  )
    return "";
  const normalized = publicUrlSchema.safeParse(`https://${domainLink}`);
  return normalized.success ? normalized.data : "";
}
// Extract exact evidence, then arrange it deterministically. The model cannot create preferences or hard requirements.
export const resumeExtractionSchema = z.object({
  name: z.string().max(200),
  location: z
    .object({
      city: excerpt,
      region: excerpt,
      country: excerpt,
      evidence: excerpt,
    })
    .nullable(),
  experience: z.array(excerpt).max(100),
  education: z.array(excerpt).max(100),
  skills: z
    .array(z.object({ skill: z.enum(skillOptions), evidence: excerpt }))
    .max(100),
  projects: z
    .array(
      z.object({
        title: excerpt,
        url: excerpt,
        technologies: excerpt,
        contribution: excerpt,
        results: excerpt,
      }),
    )
    .max(50),
  unmatched: z.array(excerpt).max(100),
});
export function validateResumeExtraction(
  raw: unknown,
  source: string,
): ResumeDraft {
  const result = resumeExtractionSchema.parse(raw);
  const quotes = [
    result.name,
    ...Object.values(result.location ?? {}),
    ...result.experience,
    ...result.education,
    ...result.unmatched,
    ...result.skills.map((s) => s.evidence),
    ...result.projects.flatMap((p) => Object.values(p)),
  ];
  if (quotes.some((quote) => quote && !source.includes(quote)))
    throw new Error(
      "The résumé prefill contained text that was not found in the document. Try again or fill the fields manually.",
    );
  if (result.skills.some((s) => !s.evidence.trim()))
    throw new Error("A suggested skill has no résumé evidence.");
  const residence = result.location
    ? matchResumeLocation(
        result.location.city,
        result.location.region,
        result.location.country,
      )
    : null;
  if (result.location && !residence && result.location.evidence)
    result.unmatched.push(result.location.evidence);
  // Verify excerpts above before normalizing links, so added schemes cannot
  // bypass the requirement that extracted content comes from the document.
  const projects = result.projects.map((project) => {
    const url = normalizeProjectUrl(project.url);
    if (!url && project.url.trim() && !result.unmatched.includes(project.url))
      result.unmatched.push(project.url);
    return { ...project, url };
  });
  return resumeDraftSchema.parse({
    name: result.name,
    residence,
    experience: result.experience.join("\n\n"),
    education: result.education.join("\n\n"),
    skills: [...new Set(result.skills.map((s) => s.skill))],
    projects,
    unmatched: result.unmatched,
  });
}
export async function pdfText(file: File) {
  if (file.size > 10 * 1024 * 1024)
    throw new HttpError(
      400,
      "Choose a PDF smaller than 10 MB, or paste its text.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new HttpError(
      400,
      "This file is not a PDF. Choose a text-based PDF or paste your résumé text.",
    );
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(bytes, {
      maxImageSize: 0,
      disableFontFace: true,
    });
    if (pdf.numPages > 30) throw new Error("Too many pages");
    const { text } = await extractText(pdf, { mergePages: true });
    if (text.length > 100000) throw new Error("Too much text");
    return text;
  } catch {
    throw new HttpError(
      400,
      "Could not read this PDF. Use a text-based, unlocked résumé of up to 30 pages, or paste the text below. Scanned PDFs need text extraction first.",
    );
  } finally {
    await pdf?.loadingTask.destroy();
  }
}
export async function prefillResume(sourceText: string) {
  const source = z.string().min(40).max(100000).safeParse(sourceText);
  if (!source.success)
    throw new HttpError(
      400,
      "Provide between 40 and 100,000 characters of résumé text.",
    );
  return {
    draft: {
      name: "",
      residence: null,
      experience: source.data,
      education: "",
      skills: [],
      projects: [],
      unmatched: [],
    },
    sourceText: source.data,
    model: "manual",
  };
}
