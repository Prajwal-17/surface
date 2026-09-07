"use client";
// shadcn/ui Sonner wrapper, adapted to Surface's fixed dark theme.
import { Toaster as Sonner, type ToasterProps } from "sonner";
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-right"
      offset={80}
      mobileOffset={{ top: 76, right: 16, left: 16 }}
      gap={10}
      visibleToasts={3}
      toastOptions={{
        duration: 4000,
        style: {
          background: "var(--popover)",
          color: "var(--foreground)",
          border: "1px solid var(--border-strong)",
          fontFamily: "var(--font-manrope), sans-serif",
        },
        classNames: {
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-secondary !text-secondary-foreground",
        },
      }}
      {...props}
    />
  );
}
