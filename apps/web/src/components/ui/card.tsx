import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"article">
>(({ className, ...props }, ref) => (
  <article
    ref={ref}
    className={cn(
      "card-surface rounded-xl border border-border text-card-foreground",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardContent };
