import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { Plus, X } from "lucide-react";
import type { CatalogOption } from "@surface/contracts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Searchable multi-select over a preset catalog. Selected values render as
 * removable chips in the row; "+ Add" opens a type-to-filter dropdown, with an
 * "Other…" entry for values the catalog does not cover. Presets are the
 * default path; typing is still available.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = "Add",
  maxValues = 8,
  align = "start",
}: {
  options: readonly CatalogOption[];
  value: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
  maxValues?: number;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [addingCustom, setAddingCustom] = useState(false);
  const atLimit = value.length >= maxValues;
  // Radix moves focus to the popover container on open; move it onto the
  // filter input (or the custom field) so typing works immediately without
  // the autofocus attribute.
  const inputRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const target = addingCustom ? customRef.current : inputRef.current;
    target?.focus();
  }, [open, addingCustom]);

  function toggle(optionId: string) {
    onChange(
      value.includes(optionId)
        ? value.filter((entry) => entry !== optionId)
        : [...value, optionId],
    );
  }

  function remove(entry: string) {
    onChange(value.filter((item) => item !== entry));
  }

  function addCustom(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || value.includes(trimmed) || atLimit) return;
    onChange([...value, trimmed]);
    setAddingCustom(false);
  }

  function optionLabel(entry: string) {
    return options.find((option) => option.id === entry)?.label ?? entry;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={ariaLabel}
    >
      {value.map((entry) => (
        <span
          key={entry}
          className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border border-input bg-background py-0.5 pr-1 pl-2 text-xs text-foreground"
        >
          <span className="truncate">{optionLabel(entry)}</span>
          <button
            type="button"
            onClick={() => remove(entry)}
            aria-label={`Remove ${optionLabel(entry)}`}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setAddingCustom(false);
        }}
      >
        <PopoverTrigger
          disabled={atLimit}
          aria-label={`${ariaLabel} — add from list`}
          title={atLimit ? `Up to ${maxValues} selected` : undefined}
          className={cn(
            "inline-flex min-h-7 items-center gap-1 rounded-md border border-dashed border-input px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            atLimit && "cursor-not-allowed opacity-50 hover:bg-transparent",
          )}
        >
          <Plus className="size-3" />
          {placeholder}
        </PopoverTrigger>
        <PopoverContent align={align} className="w-72 p-0">
          {addingCustom ? (
            <form
              className="flex items-center gap-2 p-2"
              onSubmit={(event) => {
                // This popover renders in a portal: without stopping
                // propagation the submit bubbles through the React tree into
                // the surrounding discovery form and starts a run.
                event.stopPropagation();
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem(
                  "custom",
                ) as HTMLInputElement | null;
                if (input) addCustom(input.value);
              }}
            >
              <input
                name="custom"
                ref={customRef}
                maxLength={120}
                placeholder="Type a value…"
                className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
              <button
                type="submit"
                className="rounded-md px-2 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-hover"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingCustom(false)}
                aria-label="Back to the option list"
                className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                Cancel
              </button>
            </form>
          ) : (
            <Command shouldFilter loop className="outline-none">
              <div className="border-b px-2.5 py-2">
                <Command.Input
                  ref={inputRef}
                  maxLength={120}
                  placeholder="Filter or type to search…"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1">
                <Command.Empty className="px-2 py-2 text-xs text-muted-foreground">
                  Nothing in the list matches.
                </Command.Empty>
                {options
                  .filter((option) => !value.includes(option.id))
                  .map((option) => (
                    <Command.Item
                      key={option.id}
                      value={`${option.label} ${option.id}`}
                      onSelect={() => {
                        // Keep the dropdown open: a multi-select picks several
                        // entries in one pass and closes on outside click or Esc.
                        toggle(option.id);
                      }}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs text-foreground data-[selected=true]:bg-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                            {option.hint}
                          </span>
                        ) : null}
                      </span>
                    </Command.Item>
                  ))}
                <Command.Item
                  value="other custom value"
                  onSelect={() => setAddingCustom(true)}
                  className="flex cursor-pointer items-center gap-2 rounded-md border-t px-2 py-1.5 text-xs text-muted-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
                >
                  Other…
                </Command.Item>
              </Command.List>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
