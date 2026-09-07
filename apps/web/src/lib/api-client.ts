interface ApiErrorBody {
  error?: unknown;
}

export async function apiClient<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Check the submitted fields and try again.",
    );
  }

  return response.json() as Promise<T>;
}
