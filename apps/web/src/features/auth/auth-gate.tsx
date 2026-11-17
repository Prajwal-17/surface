import { SurfaceLogo } from "@/components/ui/surface-logo";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { useDesktopChannel } from "@/lib/desktop-channel";
import { AuthContext, type AuthSession } from "./auth-context";

const authQueryKey = ["auth", "session"] as const;

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: () => apiClient<AuthSession>("/api/auth/session"),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  async function signOut() {
    try {
      await apiClient<AuthSession>("/api/auth/logout", { method: "POST" });
    } catch {
      // Hide cached workspace data even if the backend is currently unavailable.
    } finally {
      await clearPrivateQueries(queryClient);
    }
  }

  useEffect(() => {
    const expireSession = () => {
      void clearPrivateQueries(queryClient);
    };
    window.addEventListener("surface-auth-expired", expireSession);
    return () =>
      window.removeEventListener("surface-auth-expired", expireSession);
  }, [queryClient]);

  const contextValue = { email: sessionQuery.data?.email ?? "", signOut };

  if (sessionQuery.isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Checking your session…
        </div>
      </main>
    );
  }

  if (sessionQuery.isError) {
    return (
      <LoginScreen
        error="Surface could not reach the backend. Check that the backend is running, then try again."
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }

  if (!sessionQuery.data?.authenticated) {
    return (
      <LoginScreen
        onAuthenticated={(session) => {
          queryClient.setQueryData(authQueryKey, session);
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

function LoginScreen({
  error,
  onRetry,
  onAuthenticated,
}: {
  error?: string;
  onRetry?: () => void;
  onAuthenticated?: (session: AuthSession) => void;
}) {
  const desktopChannel = useDesktopChannel();
  const [email, setEmail] = useState("");
  const loginMutation = useMutation({
    mutationFn: (value: string) =>
      apiClient<AuthSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: value }),
      }),
    onSuccess: (session) => onAuthenticated?.(session),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate(email.trim().toLowerCase());
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid size-10 place-items-center text-foreground">
            <SurfaceLogo className="size-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold tracking-tight">
            {desktopChannel === "development" ? "Surface Dev" : "Surface"}
          </p>
          <h1 className="mt-2 text-lg font-semibold tracking-tight">
            Sign in to your workspace
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Enter the email authorized for this workspace to continue.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-card p-4"
        >
          {import.meta.env.DEV ? (
            <p className="mb-4 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Development mode · isolated data; any valid email works unless
              AUTH_EMAIL is configured
            </p>
          ) : null}
          <label
            htmlFor="login-email"
            className="mb-2 block text-sm font-medium"
          >
            Email address
          </label>
          <Input
            id="login-email"
            autoComplete="email"
            type="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(loginMutation.error || error)}
            aria-describedby={
              loginMutation.error || error ? "login-error" : undefined
            }
          />

          {loginMutation.error || error ? (
            <p
              id="login-error"
              role="alert"
              className="mt-3 text-sm leading-5 text-destructive"
            >
              {loginMutation.error instanceof Error
                ? loginMutation.error.message
                : error}
            </p>
          ) : null}

          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              className="mt-5 w-full"
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : (
            <Button
              type="submit"
              className="mt-5 w-full"
              disabled={loginMutation.isPending || !email.trim()}
            >
              {loginMutation.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <>
                  Continue <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
          )}
        </form>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Email-only access · no password required
        </p>
      </section>
    </main>
  );
}

async function clearPrivateQueries(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== "auth",
  });
  queryClient.setQueryData<AuthSession>(authQueryKey, { authenticated: false });
}
