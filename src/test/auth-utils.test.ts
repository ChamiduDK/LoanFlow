import { describe, expect, it } from "vitest";
import { normalizeEmail, resolveAccessState, resolvePostAuthPath } from "@/lib/auth";
import { hasFeatureAccess, normalizeFeatureAccess } from "@/lib/feature-access";

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

  it("blocks pending regular users from all protected user routes", () => {
    expect(resolvePostAuthPath("/chat", { isAdmin: false, isApproved: false })).toBe("/approval-pending");
    expect(resolvePostAuthPath("/profile", { isAdmin: false, isApproved: false })).toBe("/approval-pending");
    expect(resolvePostAuthPath("/notifications", { isAdmin: false, isApproved: false })).toBe("/approval-pending");
  });

  it("keeps protected user route for approved users", () => {
    expect(resolvePostAuthPath("/chat", { isAdmin: false, isApproved: true })).toBe("/chat");
    expect(resolvePostAuthPath("/profile", { isAdmin: false, isApproved: true })).toBe("/profile");
    expect(resolvePostAuthPath("/notifications", { isAdmin: false, isApproved: true })).toBe("/notifications");
  });

  it("treats missing approval flag as approved for backward compatibility", () => {
    expect(resolveAccessState({ is_admin: false })).toEqual({ isAdmin: false, isApproved: true });
  });

  it("respects explicit pending approval flag", () => {
    expect(resolveAccessState({ is_admin: false, is_approved: false })).toEqual({ isAdmin: false, isApproved: false });
  });

  it("defaults feature access flags to false when missing", () => {
    expect(normalizeFeatureAccess(undefined)).toEqual({
      ai_chat: false,
      new_application: false,
      upload_documents: false,
      track_application: false,
      emi_calculator: false,
    });
  });

  it("grants all feature access to admins", () => {
    expect(hasFeatureAccess({ is_admin: true, feature_access: {} }, "ai_chat")).toBe(true);
  });

  it("respects explicit per-feature access for regular users", () => {
    expect(hasFeatureAccess({ is_admin: false, feature_access: { track_application: true } }, "track_application")).toBe(true);
    expect(hasFeatureAccess({ is_admin: false, feature_access: { track_application: true } }, "ai_chat")).toBe(false);
  });
});
