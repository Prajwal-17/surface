import { describe, expect, test } from "bun:test";
import type { z } from "zod";
import { resumeDraftSchema } from "@surface/contracts";
import { resumeExtractionSchema, validateResumeExtraction } from "./resume";

function extraction(urls: string[]): z.infer<typeof resumeExtractionSchema> {
  return {
    name: "Sample Developer",
    location: null,
    experience: [],
    education: [],
    skills: [],
    projects: urls.map((url, i) => ({
      title: `Project ${i + 1}`,
      url,
      technologies: "TypeScript",
      contribution: "Built the application",
      results: "",
    })),
    unmatched: [],
  };
}

function document(raw: ReturnType<typeof extraction>) {
  return [raw.name, ...raw.projects.flatMap((p) => Object.values(p))].join(
    "\n",
  );
}

describe("résumé project links", () => {
  test("imports multiple scheme-less links as HTTPS URLs", () => {
    const raw = extraction([
      "github.com/example/project",
      "www.example.com/demo?view=full#results",
      "//demo.example.com/project",
    ]);
    const draft = validateResumeExtraction(raw, document(raw));

    expect(draft.projects.map((p) => p.url)).toEqual([
      "https://github.com/example/project",
      "https://www.example.com/demo?view=full#results",
      "https://demo.example.com/project",
    ]);
    expect(draft.projects[0]).toEqual({
      ...raw.projects[0]!,
      url: "https://github.com/example/project",
    });
    expect(draft.unmatched).toEqual([]);
    expect(resumeDraftSchema.safeParse(draft).success).toBe(true);
  });

  test("preserves existing HTTP(S) links and allows blank links", () => {
    const raw = extraction([
      "http://example.com/project",
      " https://example.com/project?key=value#demo ",
      "",
      "   ",
    ]);
    const draft = validateResumeExtraction(raw, document(raw));

    expect(draft.projects.map((p) => p.url)).toEqual([
      "http://example.com/project",
      "https://example.com/project?key=value#demo",
      "",
      "",
    ]);
    expect(draft.unmatched).toEqual([]);
  });

  test("keeps projects and retains unusable links for review", () => {
    const urls = [
      "N/A",
      "View project",
      "/projects/demo",
      "javascript:alert(1)",
      "ftp://example.com/project",
      "https://user:password@example.com/project",
      "user:password@example.com/project",
      "example.com/has a space",
      "not a domain.com",
      "https://",
    ];
    const raw = extraction(urls);
    const draft = validateResumeExtraction(raw, document(raw));

    expect(draft.projects).toEqual(
      raw.projects.map((project) => ({ ...project, url: "" })),
    );
    expect(draft.unmatched).toEqual(urls);
    expect(resumeDraftSchema.safeParse(draft).success).toBe(true);
  });

  test("does not duplicate unusable link text already marked for review", () => {
    const raw = {
      ...extraction(["View project"]),
      unmatched: ["View project"],
    };

    expect(validateResumeExtraction(raw, document(raw)).unmatched).toEqual([
      "View project",
    ]);
  });

  test("still rejects links invented by the model before normalization", () => {
    const raw = extraction(["github.com/example/project"]);
    const source = document(raw);
    raw.projects[0]!.url = "github.com/example/invented";

    expect(() => validateResumeExtraction(raw, source)).toThrow(
      "not found in the document",
    );
  });
});
