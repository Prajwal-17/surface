import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, ArrowRight } from "lucide-react";
import { AiLoadingState } from "@/components/ai/loading-state";
import {
  resumeImportResponseSchema,
  type ResumeDraft,
} from "@surface/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LocationLabel } from "./profile-controls";
import type { EditorProfile } from "./profile-sections";
const fields = [
  "name",
  "residence",
  "experience",
  "education",
  "skills",
  "projects",
  "unmatched",
] as const;
type ImportField = (typeof fields)[number];
const titles: Record<ImportField, string> = {
  name: "Display name",
  residence: "Current location",
  experience: "Work experience",
  education: "Education",
  skills: "Demonstrated skills",
  projects: "Projects",
  unmatched: "Additional details to review",
};
const display = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? v
          .map((x) =>
            typeof x === "string"
              ? x
              : Object.entries(x as Record<string, string>)
                  .filter(([, value]) => value)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join("\n"),
          )
          .join("\n\n")
      : String(v ?? "");
export function ResumeImport({
  open,
  onOpenChange,
  form,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: EditorProfile;
  onApply: (v: EditorProfile) => void;
}) {
  const [text, setText] = useState("");
  const [paste, setPaste] = useState(false);
  const [selected, setSelected] = useState<ImportField[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const existing = (key: ImportField) =>
    ({
      name: form.context.details.name,
      residence: form.context.details.residence,
      experience: form.context.experience,
      education: form.context.details.education,
      skills: form.context.details.skills,
      projects: form.context.projects,
      unmatched: form.context.details.additionalContext,
    })[key];
  const mutation = useMutation({
    mutationFn: async (input: File | string) => {
      let body: FormData | string;
      if (typeof input === "string") body = JSON.stringify({ text: input });
      else {
        if (input.size > 10 * 1024 * 1024)
          throw new Error(
            "Choose a PDF smaller than 10 MB, or paste the text.",
          );
        const data = new FormData();
        data.append("file", input);
        body = data;
      }
      const result = resumeImportResponseSchema.parse(
        await apiClient("/api/profile/resume", { method: "POST", body }),
      );
      if ("needsText" in result) {
        setPaste(true);
        setText(result.sourceText);
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (data) =>
      setSelected(
        fields.filter(
          (key) => display(data.draft[key]) && !display(existing(key)),
        ),
      ),
    onSettled: () =>
      void client.invalidateQueries({ queryKey: ["analysis-settings"] }),
  });
  function apply(draft: ResumeDraft) {
    const next = structuredClone(form);
    for (const key of selected) {
      if (key === "residence") next.context.details.residence = draft.residence;
      if (key === "name") next.context.details.name = draft.name;
      if (key === "experience") next.context.experience = draft.experience;
      if (key === "education") next.context.details.education = draft.education;
      if (key === "skills") next.context.details.skills = draft.skills;
      if (key === "projects") next.context.projects = draft.projects;
      if (key === "unmatched")
        next.context.details.additionalContext = draft.unmatched.join("\n\n");
    }
    onApply(next);
    onOpenChange(false);
    mutation.reset();
    setText("");
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!mutation.isPending) onOpenChange(value);
      }}
    >
      <DialogContent
        className={`max-h-[90svh] overflow-y-auto ${mutation.data ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <DialogHeader className="pr-9 text-left">
          <DialogTitle>
            {mutation.data
              ? "Review your resume details"
              : "Import your resume"}
          </DialogTitle>
          <DialogDescription>
            {mutation.data
              ? "Choose which details to use. Existing answers stay unless you select their replacements. You can edit everything in the form before saving."
              : "Prefill your profile with AI, then review and edit the details."}
          </DialogDescription>
        </DialogHeader>
        {!mutation.data && !mutation.isPending && (
          <>
            <div
              className={`resume-drop ${mutation.isPending ? "opacity-60" : ""}`}
            >
              <span className="method-icon" aria-hidden="true">
                <FileText />
              </span>
              <span className="text-sm font-medium">Upload a résumé</span>
              <span className="text-xs text-muted-foreground">
                Text-based PDF · up to 10 MB · 30 pages max
              </span>
              <Button
                type="button"
                className="mt-2"
                disabled={mutation.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Upload /> Choose PDF
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                aria-label="Upload PDF résumé"
                disabled={mutation.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) mutation.mutate(file);
                  e.target.value = "";
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="justify-self-center"
              onClick={() => setPaste(!paste)}
              aria-expanded={paste}
              disabled={mutation.isPending}
            >
              <FileText />
              {paste ? "Hide text entry" : "Paste résumé text instead"}
            </Button>
            {paste && (
              <div className="space-y-3">
                <Textarea
                  aria-label="Résumé text"
                  rows={8}
                  minLength={40}
                  maxLength={100000}
                  value={text}
                  disabled={mutation.isPending}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the text of your résumé…"
                />
                <Button
                  type="button"
                  disabled={text.trim().length < 40 || mutation.isPending}
                  onClick={() => mutation.mutate(text)}
                >
                  Prefill from text
                  <ArrowRight />
                </Button>
              </div>
            )}
            <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
              Only extracted text is sent to your AI provider, using one request
              through OpenCode Go. Surface processes the PDF in memory.
            </p>
          </>
        )}
        {mutation.isPending && (
          <div className="flex flex-col items-center rounded-lg border bg-card px-6 py-10 text-center">
            <AiLoadingState label="Preparing your profile draft" />
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Your AI provider is arranging the résumé details. This can take a
              moment. You’ll review everything before saving.
            </p>
          </div>
        )}
        {mutation.error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive"
          >
            {mutation.error.message}
          </p>
        )}
        {mutation.data && (
          <>
            <div className="space-y-3">
              {fields
                .filter((key) => display(mutation.data!.draft[key]))
                .map((key) => (
                  <div key={key} className="rounded-lg border p-4">
                    <label className="flex items-center gap-3 font-medium">
                      <Checkbox
                        checked={selected.includes(key)}
                        onCheckedChange={(checked) =>
                          setSelected(
                            checked
                              ? [...selected, key]
                              : selected.filter((k) => k !== key),
                          )
                        }
                      />
                      {titles[key]}
                      {display(existing(key)) && (
                        <span className="ml-auto text-xs font-normal text-warning">
                          Replaces existing
                        </span>
                      )}
                    </label>
                    {display(existing(key)) && (
                      <details className="mt-3 text-xs text-muted-foreground">
                        <summary>Current answer</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">
                          {key === "residence" &&
                          form.context.details.residence ? (
                            <LocationLabel
                              value={form.context.details.residence}
                            />
                          ) : (
                            display(existing(key))
                          )}
                        </p>
                      </details>
                    )}
                    <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                      {key === "residence" && mutation.data!.draft.residence ? (
                        <LocationLabel value={mutation.data!.draft.residence} />
                      ) : (
                        display(mutation.data!.draft[key])
                      )}
                    </p>
                    {key === "skills" &&
                      Boolean(mutation.data?.skillEvidence?.length) && (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            Skill excerpts from your résumé
                          </summary>
                          <ul className="mt-2 list-disc space-y-1 pl-4">
                            {mutation.data?.skillEvidence?.map(
                              ({ skill, evidence }, index) => (
                                <li key={index}>
                                  <span className="font-medium">{skill}</span> ·{" "}
                                  {evidence}
                                </li>
                              ),
                            )}
                          </ul>
                        </details>
                      )}
                  </div>
                ))}
            </div>
            <details className="rounded-md border p-3 text-xs text-muted-foreground">
              <summary>View extracted document text</summary>
              <p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words leading-6">
                {mutation.data.sourceText}
              </p>
            </details>
            <div className="flex justify-between gap-3 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => mutation.reset()}
              >
                Choose another résumé
              </Button>
              <Button
                type="button"
                disabled={!selected.length}
                onClick={() => apply(mutation.data!.draft)}
              >
                Use selected details
                <ArrowRight />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
