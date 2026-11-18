import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import {
  type WritingExample,
  writingContextKey,
  useWritingContext,
} from "./writing-query";

const emptyExample = { label: "", content: "", notes: "" };
type ExampleInput = typeof emptyExample;

export function WritingProfileScreen() {
  const query = useWritingContext();
  const client = useQueryClient();
  const [guide, setGuide] = useState<string | null>(null);
  const [editing, setEditing] = useState<WritingExample | null>(null);
  const [form, setForm] = useState<ExampleInput>(emptyExample);
  const [formOpen, setFormOpen] = useState(false);

  const guideValue = guide ?? query.data?.guide ?? "";
  const saveGuide = useMutation({
    mutationFn: (value: string) =>
      apiClient<{ guide: string; updatedAt: string }>("/api/writing/guide", {
        method: "PUT",
        body: JSON.stringify({ guide: value }),
      }),
    onSuccess: async (result) => {
      setGuide(result.guide);
      await client.invalidateQueries({ queryKey: writingContextKey });
      toast.success("Writing guide saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const saveExample = useMutation({
    mutationFn: (input: ExampleInput) =>
      apiClient<WritingExample>(
        editing
          ? `/api/writing/examples/${editing.id}`
          : "/api/writing/examples",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingContextKey });
      resetExampleForm();
      toast.success(editing ? "Example updated" : "Example added");
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteExample = useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/writing/examples/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingContextKey });
      toast.success("Example removed");
    },
    onError: (error) => toast.error(error.message),
  });
  const reorderExamples = useMutation({
    mutationFn: (ids: string[]) =>
      apiClient<{ reordered: boolean }>("/api/writing/examples/order", {
        method: "PUT",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: writingContextKey });
    },
    onError: (error) => toast.error(error.message),
  });

  function resetExampleForm() {
    setForm(emptyExample);
    setEditing(null);
    setFormOpen(false);
  }
  function startEdit(example: WritingExample) {
    setEditing(example);
    setForm({
      label: example.label,
      content: example.content,
      notes: example.notes,
    });
    setFormOpen(true);
  }
  function submitExample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveExample.mutate(form);
  }
  function moveExample(id: string, direction: -1 | 1) {
    const examples = query.data?.examples ?? [];
    const index = examples.findIndex((example) => example.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= examples.length) return;
    const ids = examples.map((example) => example.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
    reorderExamples.mutate(ids);
  }
  function confirmDelete(example: WritingExample) {
    if (
      window.confirm(`Remove “${example.label}” from your writing examples?`)
    ) {
      deleteExample.mutate(example.id);
    }
  }

  if (query.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-2 py-20 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Loading your writing
        profile…
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 py-16" role="alert">
        <p className="text-sm">{query.error.message}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-7 pb-12">
      <div>
        <Link
          to="/writing"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Writing assistant
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-brand">
              <Sparkles className="size-3.5" /> PERSONAL CONTEXT
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Your writing profile
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Set the voice you want to sound like. This guide and your examples
              are available in every opportunity workspace.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <BookOpenText className="size-4 text-brand" />
            {query.data.examples.length} saved examples
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquareText className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Writing guide</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Describe your tone, structure, preferred length, and any claims or
              phrases the assistant should avoid.
            </p>
          </div>
        </div>
        <div className="p-5">
          <Textarea
            value={guideValue}
            onChange={(event) => setGuide(event.target.value)}
            maxLength={10000}
            placeholder={`For example:\n• Keep outreach warm, direct, and specific.\n• Aim for 120–160 words.\n• Avoid buzzwords and exaggerated claims.\n• Use short paragraphs and a simple sign-off.`}
            className="min-h-48 resize-y text-sm leading-6"
            aria-label="Writing guide instructions"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              {guideValue.length.toLocaleString()} / 10,000 characters
              {query.data.updatedAt
                ? " · Saved to this workspace"
                : " · Not saved yet"}
            </span>
            <Button
              onClick={() => saveGuide.mutate(guideValue)}
              disabled={saveGuide.isPending || guideValue === query.data.guide}
            >
              {saveGuide.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Save />
              )}
              Save writing guide
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-brand" />
              <h2 className="text-base font-semibold">Writing examples</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Add real writing you like. Labels help you remember when each
              example is useful.
            </p>
          </div>
          {!formOpen ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setForm(emptyExample);
                setFormOpen(true);
              }}
            >
              <Plus /> Add an example
            </Button>
          ) : null}
        </div>

        {formOpen ? (
          <form
            onSubmit={submitExample}
            className="space-y-4 rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {editing ? "Edit example" : "Add a writing example"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste an email or passage that reflects your voice.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={resetExampleForm}
                aria-label="Close example editor"
              >
                <X />
              </Button>
            </div>
            <label className="block space-y-1.5 text-xs font-medium">
              Label
              <Input
                required
                maxLength={120}
                value={form.label}
                onChange={(event) =>
                  setForm({ ...form, label: event.target.value })
                }
                placeholder="e.g. Cold email that got a reply"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Example text
              <Textarea
                required
                maxLength={20000}
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                placeholder="Paste your writing here…"
                className="min-h-40 text-sm leading-6"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Notes{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
              <Input
                maxLength={2000}
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder="What should the assistant learn from this?"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetExampleForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveExample.isPending}>
                {saveExample.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : editing ? (
                  <Check />
                ) : (
                  <Plus />
                )}
                {editing ? "Save changes" : "Save example"}
              </Button>
            </div>
          </form>
        ) : null}

        {query.data.examples.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {query.data.examples.map((example, index) => (
              <article
                key={example.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">
                      {example.label}
                    </h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Updated {new Date(example.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === 0 || reorderExamples.isPending}
                      onClick={() => moveExample(example.id, -1)}
                      aria-label={`Move ${example.label} up`}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={
                        index === query.data.examples.length - 1 ||
                        reorderExamples.isPending
                      }
                      onClick={() => moveExample(example.id, 1)}
                      aria-label={`Move ${example.label} down`}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(example)}
                      aria-label={`Edit ${example.label}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deleteExample.isPending}
                      onClick={() => confirmDelete(example)}
                      aria-label={`Delete ${example.label}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                  {example.content}
                </p>
                {example.notes ? (
                  <p className="mt-3 border-t border-border pt-2 text-[11px] leading-5">
                    <span className="font-medium">Note: </span>
                    <span className="text-muted-foreground">
                      {example.notes}
                    </span>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : !formOpen ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <span className="mx-auto flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <FileText className="size-4" />
            </span>
            <h3 className="mt-3 text-sm font-medium">No examples yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              Add a few emails you’ve written and liked. Your assistant can use
              them as style references.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => setFormOpen(true)}
            >
              <Plus /> Add your first example
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
