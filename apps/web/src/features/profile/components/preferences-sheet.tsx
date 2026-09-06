"use client";

import {
  jobPreferencesInputSchema,
  type JobPreferences,
  type JobPreferencesInput,
} from "backend/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUpdateJobPreferences } from "../hooks/use-job-preferences";

const emptyPreferences: JobPreferencesInput = {
  targetRoles: "",
  preferredSkills: "",
  locationPreferences: "",
  dealBreakers: "",
};

const fields: Array<{
  name: keyof JobPreferencesInput;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    name: "targetRoles",
    label: "Target roles",
    hint: "Required",
    placeholder: "Frontend engineer, full-stack engineer",
  },
  {
    name: "preferredSkills",
    label: "Skills and technologies",
    hint: "What you want to use or strengthen",
    placeholder: "TypeScript, React, Node.js, product engineering",
  },
  {
    name: "locationPreferences",
    label: "Location and work mode",
    hint: "Remote, hybrid, on-site, regions, or time zones",
    placeholder: "Remote in India or roles with IST-friendly hours",
  },
  {
    name: "dealBreakers",
    label: "Deal-breakers",
    hint: "Constraints the assistant should take seriously",
    placeholder: "No unpaid roles, no relocation, avoid night shifts",
  },
];

interface PreferencesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: JobPreferences | null | undefined;
}

export function PreferencesSheet({
  open,
  onOpenChange,
  preferences,
}: PreferencesSheetProps) {
  const update = useUpdateJobPreferences();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JobPreferencesInput>({
    resolver: zodResolver(jobPreferencesInputSchema),
    defaultValues: preferences ?? emptyPreferences,
  });

  useEffect(() => {
    if (open) reset(preferences ?? emptyPreferences);
  }, [open, preferences, reset]);

  function save(input: JobPreferencesInput) {
    update.mutate(input, {
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Your preferences</SheetTitle>
          <SheetDescription>
            Stored in your local database and sent through OmniRoute only when
            you run an analysis.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(save)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
            {fields.map((field) => {
              const error = errors[field.name];
              const errorId = `${field.name}-error`;

              return (
                <label key={field.name} className="block">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {field.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {field.hint}
                    </span>
                  </span>
                  <textarea
                    {...register(field.name)}
                    rows={4}
                    placeholder={field.placeholder}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    className="mt-2 min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 hover:border-border-strong focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
                  />
                  {error?.message ? (
                    <span
                      id={errorId}
                      role="alert"
                      className="mt-1.5 block text-xs text-[#ffd2ca]"
                    >
                      {error.message}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving" : "Save preferences"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
