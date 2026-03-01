import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { badRequest, internalError, notFound } from "../lib/errors";
import { sendSuccess } from "../lib/response";
import { supabaseAdmin } from "../lib/supabase/client";
import {
  bankCreateSchema,
  bankUpdateSchema,
  loanProductCreateSchema,
  loanProductUpdateSchema,
  productIdParamsSchema,
  upsertBenefitsSchema,
  upsertCollateralSchema,
  upsertEligibilityRuleSchema,
  upsertLoanTermsSchema,
  upsertRequiredDocumentsSchema,
} from "../schemas/bank";
import { toSlug } from "../lib/format";
import { logAudit } from "../services/audit.service";

const idParamsSchema = z.object({ id: z.string().uuid() });
const userRoleParamsSchema = z.object({ id: z.string().uuid() });
const userRoleBodySchema = z.object({ is_admin: z.boolean() });
const userApprovalBodySchema = z.object({ is_approved: z.boolean() });
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const adminApplicationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const adminApplicationDecisionParamsSchema = z.object({ id: z.string().uuid() });
const adminApplicationDecisionBodySchema = z.object({
  status: z.enum(["under_review", "approved", "rejected"]),
  applied_date: z.string().date().optional(),
  decision_date: z.string().date().nullable().optional(),
  approved_amount: z.number().positive().max(1_000_000_000).nullable().optional(),
  approved_rate: z.number().min(0).max(100).nullable().optional(),
  approved_tenure_months: z.number().int().min(1).max(360).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.status !== "approved") {
    return;
  }

  if (value.approved_amount == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approved_amount"],
      message: "approved_amount is required when status is approved",
    });
  }

  if (value.approved_rate == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approved_rate"],
      message: "approved_rate is required when status is approved",
    });
  }

  if (value.approved_tenure_months == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["approved_tenure_months"],
      message: "approved_tenure_months is required when status is approved",
    });
  }
});

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  "/admin/overview",
  asyncHandler(async (_req, res) => {
    const [banksCount, productsCount, applicationsCount, underReviewCount, outcomesCount, auditLogsResult] = await Promise.all([
      supabaseAdmin.from("banks").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("loan_products").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("loan_applications").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("loan_applications")
        .select("*", { count: "exact", head: true })
        .eq("status", "under_review"),
      supabaseAdmin.from("outcomes").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabaseAdmin
        .from("audit_logs")
        .select("id, actor_user_id, action, entity_type, entity_id, payload_summary, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (
      banksCount.error ||
      productsCount.error ||
      applicationsCount.error ||
      underReviewCount.error ||
      outcomesCount.error ||
      auditLogsResult.error
    ) {
      throw internalError("Failed to load admin overview", {
        banksCount: banksCount.error,
        productsCount: productsCount.error,
        applicationsCount: applicationsCount.error,
        underReviewCount: underReviewCount.error,
        outcomesCount: outcomesCount.error,
        auditLogs: auditLogsResult.error,
      });
    }

    sendSuccess(res, {
      metrics: {
        total_banks: banksCount.count ?? 0,
        total_products: productsCount.count ?? 0,
        total_applications: applicationsCount.count ?? 0,
        under_review_applications: underReviewCount.count ?? 0,
        approved_outcomes: outcomesCount.count ?? 0,
      },
      recent_activity: auditLogsResult.data ?? [],
    });
  }),
);

adminRouter.get(
  "/admin/banks",
  asyncHandler(async (_req, res) => {
    const banksResult = await supabaseAdmin.from("banks").select("*").order("name", { ascending: true });

    if (banksResult.error) {
      throw internalError("Failed to load banks", banksResult.error);
    }

    sendSuccess(res, banksResult.data ?? []);
  }),
);

adminRouter.get(
  "/admin/loan-products",
  asyncHandler(async (_req, res) => {
    const productsResult = await supabaseAdmin
      .from("loan_products")
      .select("*, banks(name, code)")
      .order("created_at", { ascending: false });

    if (productsResult.error) {
      throw internalError("Failed to load loan products", productsResult.error);
    }

    sendSuccess(res, productsResult.data ?? []);
  }),
);

adminRouter.get(
  "/admin/users",
  asyncHandler(async (_req, res) => {
    const [profilesResult, applicationsResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, phone, is_admin, is_approved, created_at, updated_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("loan_applications")
        .select("id, user_id, status"),
    ]);

    if (profilesResult.error || applicationsResult.error) {
      throw internalError("Failed to load users", {
        profiles: profilesResult.error,
        applications: applicationsResult.error,
      });
    }

    const applicationRows = applicationsResult.data ?? [];
    const countsByUser = new Map<string, { total: number; active: number }>();
    for (const row of applicationRows) {
      const key = String(row.user_id);
      const current = countsByUser.get(key) ?? { total: 0, active: 0 };
      current.total += 1;
      if (!["approved", "rejected", "withdrawn"].includes(String(row.status))) {
        current.active += 1;
      }
      countsByUser.set(key, current);
    }

    const users = (profilesResult.data ?? []).map((profile) => ({
      ...profile,
      applications_total: countsByUser.get(String(profile.id))?.total ?? 0,
      applications_active: countsByUser.get(String(profile.id))?.active ?? 0,
    }));

    sendSuccess(res, users);
  }),
);

adminRouter.put(
  "/admin/users/:id/role",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(userRoleParamsSchema, req.params);
    const payload = parseWithSchema(userRoleBodySchema, req.body);
    const actorUserId = req.auth?.user.id;

    const profileResult = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, is_admin, is_approved, updated_at")
      .eq("id", params.id)
      .maybeSingle();

    if (profileResult.error) {
      throw internalError("Failed to load user profile", profileResult.error);
    }

    if (!profileResult.data) {
      throw notFound("User profile not found");
    }

    if (profileResult.data.is_admin === payload.is_admin) {
      sendSuccess(res, profileResult.data);
      return;
    }

    if (profileResult.data.is_admin && !payload.is_admin) {
      if (actorUserId && actorUserId === params.id) {
        throw badRequest("You cannot remove your own admin role");
      }

      const adminCountResult = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_admin", true);

      if (adminCountResult.error) {
        throw internalError("Failed to validate admin role constraints", adminCountResult.error);
      }

      if ((adminCountResult.count ?? 0) <= 1) {
        throw badRequest("At least one admin account must remain");
      }
    }

    const updateResult = await supabaseAdmin
      .from("profiles")
      .update({ is_admin: payload.is_admin })
      .eq("id", params.id)
      .select("id, email, full_name, is_admin, is_approved, updated_at")
      .maybeSingle();

    if (updateResult.error) {
      throw internalError("Failed to update user role", updateResult.error);
    }

    if (!updateResult.data) {
      throw notFound("User profile not found");
    }

    await logAudit({
      actorUserId,
      action: "admin.user_role.update",
      entityType: "profiles",
      entityId: params.id,
      payloadSummary: { is_admin: payload.is_admin },
      ipAddress: req.ip,
    });

    sendSuccess(res, updateResult.data);
  }),
);

adminRouter.put(
  "/admin/users/:id/approval",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(userRoleParamsSchema, req.params);
    const payload = parseWithSchema(userApprovalBodySchema, req.body);

    const updateResult = await supabaseAdmin
      .from("profiles")
      .update({ is_approved: payload.is_approved })
      .eq("id", params.id)
      .select("id, email, full_name, is_admin, is_approved, updated_at")
      .maybeSingle();

    if (updateResult.error) {
      throw internalError("Failed to update user approval", updateResult.error);
    }

    if (!updateResult.data) {
      throw notFound("User profile not found");
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.user_approval.update",
      entityType: "profiles",
      entityId: params.id,
      payloadSummary: { is_approved: payload.is_approved },
      ipAddress: req.ip,
    });

    sendSuccess(res, updateResult.data);
  }),
);

adminRouter.get(
  "/admin/applications",
  asyncHandler(async (req, res) => {
    const query = parseWithSchema(adminApplicationsQuerySchema, req.query);
    const limit = query.limit ?? 100;

    const applicationsResult = await supabaseAdmin
      .from("loan_applications")
      .select("id, user_id, requested_amount, purpose, preferred_tenure_months, status, selected_product_id, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (applicationsResult.error) {
      throw internalError("Failed to load admin applications", applicationsResult.error);
    }

    const applications = applicationsResult.data ?? [];
    const userIds = Array.from(new Set(applications.map((item) => String(item.user_id))));
    const appIds = applications.map((item) => String(item.id));

    const [profilesResult, outcomesResult] = await Promise.all([
      userIds.length > 0
        ? supabaseAdmin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      appIds.length > 0
        ? supabaseAdmin
            .from("outcomes")
            .select("id, application_id, status, approved_amount, approved_rate, approved_tenure_months, decision_date, applied_date")
            .in("application_id", appIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error || outcomesResult.error) {
      throw internalError("Failed to load admin application context", {
        profiles: profilesResult.error,
        outcomes: outcomesResult.error,
      });
    }

    const profileById = new Map((profilesResult.data ?? []).map((profile) => [String(profile.id), profile]));
    const outcomeByAppId = new Map((outcomesResult.data ?? []).map((outcome) => [String(outcome.application_id), outcome]));

    const payload = applications.map((application) => ({
      ...application,
      user_profile: profileById.get(String(application.user_id)) ?? null,
      outcome: outcomeByAppId.get(String(application.id)) ?? null,
    }));

    sendSuccess(res, payload, { limit });
  }),
);

adminRouter.put(
  "/admin/applications/:id/decision",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(adminApplicationDecisionParamsSchema, req.params);
    const payload = parseWithSchema(adminApplicationDecisionBodySchema, req.body);

    const applicationResult = await supabaseAdmin
      .from("loan_applications")
      .select("id, user_id")
      .eq("id", params.id)
      .maybeSingle();

    if (applicationResult.error) {
      throw internalError("Failed to load application for decision", applicationResult.error);
    }

    if (!applicationResult.data) {
      throw notFound("Application not found");
    }

    const applicantUserId = String(applicationResult.data.user_id);
    const isDecisionStatus = payload.status === "approved" || payload.status === "rejected";
    const decisionDate = payload.decision_date ?? (isDecisionStatus ? new Date().toISOString().slice(0, 10) : null);
    const shouldKeepApprovalTerms = payload.status === "approved";

    const outcomeResult = await supabaseAdmin
      .from("outcomes")
      .upsert(
        {
          application_id: params.id,
          user_id: applicantUserId,
          status: payload.status,
          applied_date: payload.applied_date ?? new Date().toISOString().slice(0, 10),
          decision_date: decisionDate,
          approved_amount: shouldKeepApprovalTerms ? payload.approved_amount ?? null : null,
          approved_rate: shouldKeepApprovalTerms ? payload.approved_rate ?? null : null,
          approved_tenure_months: shouldKeepApprovalTerms ? payload.approved_tenure_months ?? null : null,
          notes: payload.notes ?? null,
        },
        { onConflict: "application_id" },
      )
      .select("*")
      .single();

    if (outcomeResult.error || !outcomeResult.data) {
      throw internalError("Failed to upsert application outcome", outcomeResult.error);
    }

    const updateResult = await supabaseAdmin
      .from("loan_applications")
      .update({
        status: payload.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateResult.error || !updateResult.data) {
      throw internalError("Failed to update application decision status", updateResult.error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.application.decision.update",
      entityType: "loan_applications",
      entityId: params.id,
      payloadSummary: {
        status: payload.status,
        approved_amount: payload.approved_amount ?? null,
        approved_rate: payload.approved_rate ?? null,
        approved_tenure_months: payload.approved_tenure_months ?? null,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, {
      application: updateResult.data,
      outcome: outcomeResult.data,
    });
  }),
);

adminRouter.get(
  "/admin/audit-logs",
  asyncHandler(async (req, res) => {
    const query = parseWithSchema(auditQuerySchema, req.query);
    const limit = query.limit ?? 50;

    const logsResult = await supabaseAdmin
      .from("audit_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, payload_summary, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (logsResult.error) {
      throw internalError("Failed to load audit logs", logsResult.error);
    }

    const actorIds = Array.from(
      new Set((logsResult.data ?? []).map((log) => log.actor_user_id).filter((value): value is string => Boolean(value))),
    );

    let actorProfiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (actorIds.length > 0) {
      const profilesResult = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);

      if (profilesResult.error) {
        throw internalError("Failed to load audit actor profiles", profilesResult.error);
      }

      actorProfiles = profilesResult.data ?? [];
    }

    const profileById = new Map(actorProfiles.map((profile) => [profile.id, profile]));
    const logs = (logsResult.data ?? []).map((log) => ({
      ...log,
      actor_profile: log.actor_user_id ? profileById.get(log.actor_user_id) ?? null : null,
    }));

    sendSuccess(res, logs, { limit });
  }),
);

adminRouter.post(
  "/admin/banks",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(bankCreateSchema, req.body);

    const { data, error } = await supabaseAdmin
      .from("banks")
      .insert({
        ...payload,
        code: payload.code.toUpperCase(),
      })
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to create bank", error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.bank.create",
      entityType: "banks",
      entityId: data.id,
      payloadSummary: { name: payload.name, code: payload.code },
      ipAddress: req.ip,
    });

    sendSuccess(res, data, undefined, 201);
  }),
);

adminRouter.put(
  "/admin/banks/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(idParamsSchema, req.params);
    const payload = parseWithSchema(bankUpdateSchema, req.body);

    const { data, error } = await supabaseAdmin
      .from("banks")
      .update({
        ...payload,
        ...(payload.code ? { code: payload.code.toUpperCase() } : {}),
      })
      .eq("id", params.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw internalError("Failed to update bank", error);
    }

    if (!data) {
      throw notFound("Bank not found");
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.bank.update",
      entityType: "banks",
      entityId: params.id,
      payloadSummary: payload,
      ipAddress: req.ip,
    });

    sendSuccess(res, data);
  }),
);

adminRouter.delete(
  "/admin/banks/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(idParamsSchema, req.params);

    const { data, error } = await supabaseAdmin
      .from("banks")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw internalError("Failed to delete bank", error);
    }

    if (!data) {
      throw notFound("Bank not found");
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.bank.delete",
      entityType: "banks",
      entityId: params.id,
      payloadSummary: {},
      ipAddress: req.ip,
    });

    sendSuccess(res, { deleted: true });
  }),
);

adminRouter.post(
  "/admin/loan-products",
  asyncHandler(async (req, res) => {
    const payload = parseWithSchema(loanProductCreateSchema, req.body);

    const slug = payload.slug ?? toSlug(`${payload.name}-${Date.now()}`);

    const { data, error } = await supabaseAdmin
      .from("loan_products")
      .insert({
        ...payload,
        slug,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw internalError("Failed to create loan product", error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.loan_product.create",
      entityType: "loan_products",
      entityId: data.id,
      payloadSummary: {
        bank_id: payload.bank_id,
        name: payload.name,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, data, undefined, 201);
  }),
);

adminRouter.put(
  "/admin/loan-products/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(idParamsSchema, req.params);
    const payload = parseWithSchema(loanProductUpdateSchema, req.body);

    const { data, error } = await supabaseAdmin
      .from("loan_products")
      .update({
        ...payload,
        ...(payload.slug ? { slug: toSlug(payload.slug) } : {}),
      })
      .eq("id", params.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw internalError("Failed to update loan product", error);
    }

    if (!data) {
      throw notFound("Loan product not found");
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.loan_product.update",
      entityType: "loan_products",
      entityId: params.id,
      payloadSummary: payload,
      ipAddress: req.ip,
    });

    sendSuccess(res, data);
  }),
);

adminRouter.delete(
  "/admin/loan-products/:id",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(idParamsSchema, req.params);

    const { data, error } = await supabaseAdmin
      .from("loan_products")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw internalError("Failed to delete loan product", error);
    }

    if (!data) {
      throw notFound("Loan product not found");
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.loan_product.delete",
      entityType: "loan_products",
      entityId: params.id,
      payloadSummary: {},
      ipAddress: req.ip,
    });

    sendSuccess(res, { deleted: true });
  }),
);

adminRouter.put(
  "/admin/loan-terms/:productId",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productIdParamsSchema, req.params);
    const payload = parseWithSchema(upsertLoanTermsSchema, req.body);

    const remove = await supabaseAdmin.from("loan_terms").delete().eq("product_id", params.productId);
    if (remove.error) {
      throw internalError("Failed to reset loan terms", remove.error);
    }

    const insert = await supabaseAdmin
      .from("loan_terms")
      .insert(
        payload.terms.map((term) => ({
          ...term,
          product_id: params.productId,
        })),
      )
      .select("*");

    if (insert.error) {
      throw internalError("Failed to save loan terms", insert.error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.loan_terms.update",
      entityType: "loan_terms",
      entityId: params.productId,
      payloadSummary: { count: payload.terms.length },
      ipAddress: req.ip,
    });

    sendSuccess(res, insert.data ?? []);
  }),
);

adminRouter.put(
  "/admin/eligibility-rules/:productId",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productIdParamsSchema, req.params);
    const payload = parseWithSchema(upsertEligibilityRuleSchema, req.body);

    const updateOld = await supabaseAdmin
      .from("eligibility_rules")
      .update({ is_active: false })
      .eq("product_id", params.productId);

    if (updateOld.error) {
      throw internalError("Failed to disable previous eligibility rules", updateOld.error);
    }

    const insert = await supabaseAdmin
      .from("eligibility_rules")
      .insert({
        product_id: params.productId,
        rules_json: payload.rules_json,
        is_active: payload.is_active ?? true,
      })
      .select("*")
      .single();

    if (insert.error || !insert.data) {
      throw internalError("Failed to save eligibility rules", insert.error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.eligibility_rules.update",
      entityType: "eligibility_rules",
      entityId: String(insert.data.id),
      payloadSummary: payload.rules_json,
      ipAddress: req.ip,
    });

    sendSuccess(res, insert.data);
  }),
);

adminRouter.put(
  "/admin/required-documents/:productId",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productIdParamsSchema, req.params);
    const payload = parseWithSchema(upsertRequiredDocumentsSchema, req.body);

    const remove = await supabaseAdmin.from("required_documents").delete().eq("product_id", params.productId);
    if (remove.error) {
      throw internalError("Failed to reset required documents", remove.error);
    }

    const insert = await supabaseAdmin
      .from("required_documents")
      .insert(
        payload.documents.map((doc) => ({
          ...doc,
          product_id: params.productId,
          accepted_formats: doc.accepted_formats ?? ["pdf", "jpg", "png"],
          is_required: doc.is_required ?? true,
          verification_rules_json: doc.verification_rules_json ?? {},
        })),
      )
      .select("*");

    if (insert.error) {
      throw internalError("Failed to save required documents", insert.error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.required_documents.update",
      entityType: "required_documents",
      entityId: params.productId,
      payloadSummary: { count: payload.documents.length },
      ipAddress: req.ip,
    });

    sendSuccess(res, insert.data ?? []);
  }),
);

adminRouter.put(
  "/admin/benefits/:productId",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productIdParamsSchema, req.params);
    const payload = parseWithSchema(upsertBenefitsSchema, req.body);

    const remove = await supabaseAdmin.from("benefits").delete().eq("product_id", params.productId);
    if (remove.error) {
      throw internalError("Failed to reset benefits", remove.error);
    }

    const insert = await supabaseAdmin
      .from("benefits")
      .insert(
        payload.benefits.map((benefit) => ({
          ...benefit,
          product_id: params.productId,
          is_highlight: benefit.is_highlight ?? false,
        })),
      )
      .select("*");

    if (insert.error) {
      throw internalError("Failed to save benefits", insert.error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.benefits.update",
      entityType: "benefits",
      entityId: params.productId,
      payloadSummary: { count: payload.benefits.length },
      ipAddress: req.ip,
    });

    sendSuccess(res, insert.data ?? []);
  }),
);

adminRouter.put(
  "/admin/collateral/:productId",
  asyncHandler(async (req, res) => {
    const params = parseWithSchema(productIdParamsSchema, req.params);
    const payload = parseWithSchema(upsertCollateralSchema, req.body);

    const remove = await supabaseAdmin.from("collateral").delete().eq("product_id", params.productId);
    if (remove.error) {
      throw internalError("Failed to reset collateral requirements", remove.error);
    }

    const insert = await supabaseAdmin
      .from("collateral")
      .insert(
        payload.collateral.map((entry) => ({
          ...entry,
          product_id: params.productId,
          is_optional: entry.is_optional ?? false,
        })),
      )
      .select("*");

    if (insert.error) {
      throw internalError("Failed to save collateral entries", insert.error);
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.collateral.update",
      entityType: "collateral",
      entityId: params.productId,
      payloadSummary: { count: payload.collateral.length },
      ipAddress: req.ip,
    });

    sendSuccess(res, insert.data ?? []);
  }),
);
