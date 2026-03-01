import { describe, expect, it } from "vitest";
import { normalizeEmail, resolveAccessState, resolvePostAuthPath } from "@/lib/auth";

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

  it("treats missing approval flag as approved for backward compatibility", () => {
    expect(resolveAccessState({ is_admin: false })).toEqual({ isAdmin: false, isApproved: true });
  });

  it("respects explicit pending approval flag", () => {
    expect(resolveAccessState({ is_admin: false, is_approved: false })).toEqual({ isAdmin: false, isApproved: false });
  });
});
