import { QueryClient } from "@tanstack/react-query";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createAppQueryClient() {
  return createQueryClient();
}
