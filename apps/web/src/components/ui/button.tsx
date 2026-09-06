import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium outline-none transition-[background-color,color,border-color,filter] focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "primary-button text-primary-foreground",
        secondary:
          "border border-input bg-secondary text-secondary-foreground hover:border-border-strong hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        outline:
          "border border-input bg-transparent text-foreground hover:border-border-strong hover:bg-muted",
        destructive: "bg-[#741b1d] text-white hover:bg-[#882529]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-md px-2.5 text-xs",
        lg: "h-10 px-4 text-sm",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
