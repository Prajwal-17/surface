import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-[0.02em]",
  {
    variants: {
      variant: {
        outline: "border-border bg-transparent text-muted-foreground",
        success: "border-emerald-400/20 bg-emerald-400/10 text-success",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
