import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);

    // Guard against the bmv.vin SSR catch-all (or any future misrouting)
    // returning the SPA's HTML shell with a 200 in place of real JSON.
    // Without this check the call chain looked perfectly healthy: status
    // 200, no thrown error from throwIfResNotOk, but `res.json()` would
    // throw a SyntaxError that React Query swallowed into the query's
    // error state — and the component, having `data: x = []` as a
    // destructuring default, rendered an empty list instead of failing.
    // That's exactly what made every car detail page show "No parts
    // groups" on bmv.vin (Task #97). Surfacing the mismatch as a real
    // error keeps that whole class of bug loud rather than silent.
    const contentType = res.headers.get("content-type") || "";
    if (url.startsWith("/api/") && !contentType.includes("application/json")) {
      const preview = (await res.text()).slice(0, 120);
      throw new Error(
        `Expected JSON from ${url} but got ${contentType || "unknown"}: ${preview}`,
      );
    }

    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
