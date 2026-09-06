import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "./lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.05em]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        success: "border-[#356c67] bg-[#173532] text-[#bce5df]",
        danger: "border-[#7d3638] bg-[#3a1718] text-[#ffb9b5]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
