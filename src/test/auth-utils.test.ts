import { describe, expect, it } from "vitest";
import { normalizeEmail, resolvePostAuthPath } from "@/lib/auth";

describe("auth utils", () => {
  it("normalizes email casing and trims whitespace", () => {
    expect(normalizeEmail("  USER@Example.COM  ")).toBe("user@example.com");
  });

  it("blocks non-admin users from admin return paths", () => {
    expect(resolvePostAuthPath("/admin/users", { isAdmin: false, isApproved: true })).toBe("/dashboard");
  });

  it("routes admins to admin dashboard by default", () => {
    expect(resolvePostAuthPath(undefined, { isAdmin: true, isApproved: true })).toBe("/admin");
  });

  it("routes approved regular users to user dashboard by default", () => {
    expect(resolvePostAuthPath(undefined, { isAdmin: false, isApproved: true })).toBe("/dashboard");
  });

  it("routes pending regular users to approval page by default", () => {
    expect(resolvePostAuthPath(undefined, { isAdmin: false, isApproved: false })).toBe("/approval-pending");
  });
});
