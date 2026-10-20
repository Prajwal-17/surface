// Adapted from shadcn/ui (MIT). See components/ui/LICENSE.md.
import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
const Collapsible = CollapsiblePrimitive.Root;
function CollapsibleTrigger({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn("w-full text-left", className)}
      {...props}
    />
  );
}
function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      className={cn("overflow-hidden", className)}
      {...props}
    />
  );
}
export { Collapsible, CollapsibleTrigger, CollapsibleContent };
