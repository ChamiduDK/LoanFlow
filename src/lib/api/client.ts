import { supabaseClient } from "@/lib/supabase/client";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
  if (!base) {
    return path;
  }

  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const rawText = await response.text();

  let payload: ApiEnvelope<T> | T | null = null;
  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<T> | T;
    } catch {
      payload = null;
    }
  } else if (contentType.includes("application/json")) {
    payload = null;
  }

  if (!response.ok) {
    const messageFromEnvelope =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as ApiEnvelope<T>).error?.message
        : undefined;
    const message =
      messageFromEnvelope ??
      (rawText.length === 0 ? `Request failed with status ${response.status}` : `Request failed (${response.status})`);
    throw new Error(message);
  }

  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new Error(envelope.error?.message ?? `Request failed with status ${response.status}`);
    }
    return envelope.data as T;
  }

  if (payload === null) {
    throw new Error("API returned an empty response body");
  }

  return payload as T;
}
