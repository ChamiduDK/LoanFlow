import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler";
import { parseWithSchema } from "../lib/validation";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { internalError, notFound } from "../lib/errors";
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
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
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
        .select("id, email, full_name, phone, is_admin, created_at, updated_at")
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

    const updateResult = await supabaseAdmin
      .from("profiles")
      .update({ is_admin: payload.is_admin })
      .eq("id", params.id)
      .select("id, email, full_name, is_admin, updated_at")
      .maybeSingle();

    if (updateResult.error) {
      throw internalError("Failed to update user role", updateResult.error);
    }

    if (!updateResult.data) {
      throw notFound("User profile not found");
    }

    await logAudit({
      actorUserId: req.auth?.user.id,
      action: "admin.user_role.update",
      entityType: "profiles",
      entityId: params.id,
      payloadSummary: { is_admin: payload.is_admin },
      ipAddress: req.ip,
    });

    sendSuccess(res, updateResult.data);
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
