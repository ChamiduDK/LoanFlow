import { describe, expect, it } from "vitest";
import { normalizeEmail, resolvePostAuthPath } from "@/lib/auth";

describe("auth utils", () => {
  it("normalizes email casing and trims whitespace", () => {
    expect(normalizeEmail("  USER@Example.COM  ")).toBe("user@example.com");
  });

  it("prefers requested return path after login", () => {
    expect(resolvePostAuthPath("/admin/users", false)).toBe("/admin/users");
  });

  it("routes admins to admin dashboard by default", () => {
    expect(resolvePostAuthPath(undefined, true)).toBe("/admin");
  });

  it("routes regular users to user dashboard by default", () => {
    expect(resolvePostAuthPath(undefined, false)).toBe("/dashboard");
  });
});
