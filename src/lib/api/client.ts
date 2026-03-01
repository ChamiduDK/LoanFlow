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
    let errorMessage = `Request failed with status ${response.status}`;
    let errorCode: string | undefined;

    if (payload && typeof payload === "object") {
      if ("error" in payload) {
        const err = (payload as ApiEnvelope<T>).error;
        errorMessage = err?.message ?? errorMessage;
        errorCode = err?.code;
      } else if ("message" in payload && typeof payload.message === "string") {
        errorMessage = payload.message;
      }
    }

    throw new ApiRequestError(errorMessage, {
      status: response.status,
      code: errorCode,
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

export type UploadProgressHandler = (progress: number) => void;

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress?: UploadProgressHandler,
): Promise<T> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", resolveApiUrl(path));

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") ?? "";
      let payload: ApiEnvelope<T> | T | string | null = null;

      if (xhr.responseText) {
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = xhr.responseText;
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (payload && typeof payload === "object" && "success" in payload) {
          if (payload.success) {
            resolve(payload.data as T);
          } else {
            reject(new ApiRequestError(payload.error?.message ?? "Upload failed", {
              status: xhr.status,
              code: payload.error?.code,
            }));
          }
        } else {
          resolve(payload as T);
        }
      } else {
        let message = `Upload failed with status ${xhr.status}`;
        let code: string | undefined;

        if (payload && typeof payload === "object" && "error" in payload) {
          const env = payload as ApiEnvelope<T>;
          message = env.error?.message ?? message;
          code = env.error?.code;
        }

        reject(new ApiRequestError(message, { status: xhr.status, code }));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    xhr.send(formData);
  });
}
