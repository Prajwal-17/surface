import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChoiceOption = { value: string; label: string };

export function ChoiceGroup({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 text-xs font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              className="peer sr-only focus-visible:outline-none"
            />
            <span className="ui-choice inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2 text-sm font-medium text-muted-foreground transition-colors duration-120 hover:bg-hover hover:text-foreground peer-checked:border-link/50 peer-checked:bg-info-background peer-checked:font-semibold peer-checked:text-link peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
              <Check
                aria-hidden="true"
                className={cn(
                  "size-3 shrink-0",
                  value !== option.value && "invisible",
                )}
              />
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
