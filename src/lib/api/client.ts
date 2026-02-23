import { supabaseClient } from "@/lib/supabase/client";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options: { status: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

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
  const hasBody = init.body != null;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (hasBody && !isFormData) {
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
    const errorFromEnvelope =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as ApiEnvelope<T>).error
        : undefined;
    const message =
      errorFromEnvelope?.message ??
      (rawText.length === 0 ? `Request failed with status ${response.status}` : `Request failed (${response.status})`);
    throw new ApiRequestError(message, {
      status: response.status,
      code: errorFromEnvelope?.code,
    });
  }

  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new ApiRequestError(envelope.error?.message ?? `Request failed with status ${response.status}`, {
        status: response.status,
        code: envelope.error?.code,
      });
    }
    return envelope.data as T;
  }

  if (payload === null) {
    // Successful response with no body (e.g., 204 No Content or empty 200)
    return null as T;
  }

  return payload as T;
}
