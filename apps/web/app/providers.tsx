"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { getQueryClient } from "@/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        expand
        gap={8}
        visibleToasts={3}
        offset={20}
        mobileOffset={16}
        toastOptions={{
          duration: 4000,
          style: {
            background: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
            boxShadow: "0 18px 48px rgb(0 0 0 / 45%)",
          },
          classNames: {
            toast: "!rounded-lg !px-4 !py-3.5",
            title: "!text-sm !font-medium !tracking-[-0.01em]",
            description: "!text-[13px] !leading-5 !text-muted-foreground",
            success: "!border-[#355d58]",
            error: "!border-[#6d3639]",
            closeButton:
              "!border-border !bg-secondary !text-muted-foreground hover:!bg-muted hover:!text-foreground",
          },
        }}
      />
    </QueryClientProvider>
  );
}
