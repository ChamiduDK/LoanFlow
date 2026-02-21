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
  await assertApplication(userId, applicationId);

  const { data, error } = await supabaseAdmin
    .from("outcomes")
    .upsert(
      {
        application_id: applicationId,
        user_id: userId,
        status: payload.status,
        applied_date: payload.applied_date ?? new Date().toISOString().slice(0, 10),
        decision_date: payload.decision_date ?? null,
        approved_amount: payload.approved_amount ?? null,
        approved_rate: payload.approved_rate ?? null,
        approved_tenure_months: payload.approved_tenure_months ?? null,
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
