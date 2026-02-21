import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";

async function assertApplication(userId: string, applicationId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load application", error);
  }

  if (!data) {
    throw notFound("Application not found");
  }

  if (data.user_id !== userId) {
    throw forbidden("You cannot access this application");
  }
}

async function loadApplicationForOutcome(userId: string, applicationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id, requested_amount, preferred_tenure_months, selected_product_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load application", error);
  }

  if (!data) {
    throw notFound("Application not found");
  }

  if (data.user_id !== userId) {
    throw forbidden("You cannot access this application");
  }

  return data;
}

export async function upsertOutcome(
  userId: string,
  applicationId: string,
  payload: {
    status: "applied" | "under_review" | "approved" | "rejected";
    applied_date?: string;
    decision_date?: string | null;
    approved_amount?: number | null;
    approved_rate?: number | null;
    approved_tenure_months?: number | null;
    notes?: string | null;
    consent_for_training?: boolean;
  },
  ipAddress?: string | null,
): Promise<Record<string, unknown>> {
  const application = await loadApplicationForOutcome(userId, applicationId);

  const isDecisionStatus = payload.status === "approved" || payload.status === "rejected";
  const decisionDate = payload.decision_date ?? (isDecisionStatus ? new Date().toISOString().slice(0, 10) : null);
  const shouldKeepApprovalTerms = payload.status === "approved";

  const selectedProductId = application.selected_product_id ? String(application.selected_product_id) : null;
  const selectedProductResult = shouldKeepApprovalTerms && selectedProductId
    ? await supabaseAdmin
        .from("loan_products")
        .select("rate_min, rate_max")
        .eq("id", selectedProductId)
        .maybeSingle()
    : { data: null, error: null };

  if (selectedProductResult.error) {
    throw internalError("Failed to derive approval defaults from selected product", selectedProductResult.error);
  }

  const derivedRate = selectedProductResult.data
    ? Number(((Number(selectedProductResult.data.rate_min) + Number(selectedProductResult.data.rate_max)) / 2).toFixed(2))
    : null;

  const approvedAmount = shouldKeepApprovalTerms
    ? payload.approved_amount ?? Number(application.requested_amount ?? 0)
    : null;
  const approvedRate = shouldKeepApprovalTerms
    ? payload.approved_rate ?? derivedRate
    : null;
  const approvedTenureMonths = shouldKeepApprovalTerms
    ? payload.approved_tenure_months ?? Number(application.preferred_tenure_months ?? 0)
    : null;

  const { data, error } = await supabaseAdmin
    .from("outcomes")
    .upsert(
      {
        application_id: applicationId,
        user_id: userId,
        status: payload.status,
        applied_date: payload.applied_date ?? new Date().toISOString().slice(0, 10),
        decision_date: decisionDate,
        approved_amount: approvedAmount,
        approved_rate: approvedRate,
        approved_tenure_months: approvedTenureMonths,
        notes: payload.notes ?? null,
        consent_for_training: payload.consent_for_training ?? false,
      },
      {
        onConflict: "application_id",
      },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw internalError("Failed to upsert outcome", error);
  }

  const { error: appUpdateError } = await supabaseAdmin
    .from("loan_applications")
    .update({
      status: payload.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  if (appUpdateError) {
    throw internalError("Failed to sync application status from outcome", appUpdateError);
  }

  await logAudit({
    actorUserId: userId,
    action: "outcome.upserted",
    entityType: "outcomes",
    entityId: String(data.id),
    payloadSummary: {
      applicationId,
      status: payload.status,
    },
    ipAddress: ipAddress ?? null,
  });

  return data;
}

export async function getOutcome(userId: string, applicationId: string): Promise<Record<string, unknown> | null> {
  await assertApplication(userId, applicationId);

  const { data, error } = await supabaseAdmin
    .from("outcomes")
    .select("*")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to fetch outcome", error);
  }

  return data;
}
