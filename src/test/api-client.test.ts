import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabaseClient: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

import { ApiRequestError, apiFetch } from "@/lib/api/client";

describe("apiFetch", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {
        session: null,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send JSON content-type for bodyless requests", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await apiFetch<{ ok: boolean }>("/api/health");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers((init as RequestInit | undefined)?.headers);

    expect(headers.has("Content-Type")).toBe(false);
    expect((init as RequestInit | undefined)?.credentials).toBe("include");
  });

  it("adds auth and content-type headers when sending JSON", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "token-123",
        },
      },
    });

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: "abc" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await apiFetch<{ id: string }>("/api/example", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers((init as RequestInit | undefined)?.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("throws ApiRequestError with status and code from API envelopes", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: "Forbidden", code: "FORBIDDEN" } }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    let caught: unknown;
    try {
      await apiFetch("/api/protected");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiRequestError);
    expect(caught).toMatchObject({
      message: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("returns null for successful empty responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiFetch<null>("/api/no-content");

    expect(result).toBeNull();
  });
});
