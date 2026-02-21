import { supabaseClient } from "@/lib/supabase/client";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    const error = payload?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(error);
  }

  return payload.data as T;
}
