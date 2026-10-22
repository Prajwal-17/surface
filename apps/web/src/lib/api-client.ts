interface ApiErrorBody {
  error?: unknown;
}

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    if (
      response.status === 401 &&
      !path.startsWith("/api/auth/") &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event("surface-auth-expired"));
    }
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Check the submitted fields and try again.",
    );
  }

  return response.json() as Promise<T>;
}
