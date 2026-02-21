import { badRequest, forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";

type TrackApplicationResponse = {
  application_id: string;
  selected_product_id: string;
  tracking_started_at: string;
  redirect_to: string;
  product: {
    id: string;
    name: string;
    bank_id: string;
    bank_name: string;
  };
};

async function loadOwnedApplication(userId: string, applicationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id, status")
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

export async function startApplicationTracking(
  userId: string,
  applicationId: string,
  productId: string,
  ipAddress?: string | null,
): Promise<TrackApplicationResponse> {
  const application = await loadOwnedApplication(userId, applicationId);

  const [productResult, resultResult] = await Promise.all([
    supabaseAdmin
      .from("loan_products")
      .select("id, bank_id, name, is_active, banks(name)")
      .eq("id", productId)
      .maybeSingle(),
    supabaseAdmin
      .from("application_results")
      .select("id, approval_probability, initial_probability")
      .eq("application_id", applicationId)
      .eq("product_id", productId)
      .maybeSingle(),
  ]);

  if (productResult.error) {
    throw internalError("Failed to load selected loan product", productResult.error);
  }

  if (!productResult.data || !productResult.data.is_active) {
    throw notFound("Selected loan product is not available");
  }

  if (resultResult.error) {
    throw internalError("Failed to load application evaluation result", resultResult.error);
  }

  if (!resultResult.data) {
    throw badRequest("Selected product was not found in evaluation results. Run evaluation first.");
  }

  if (resultResult.data.initial_probability == null) {
    const syncProbability = await supabaseAdmin
      .from("application_results")
      .update({
        initial_probability: resultResult.data.approval_probability,
      })
      .eq("id", resultResult.data.id);

    if (syncProbability.error) {
      throw internalError("Failed to persist initial probability", syncProbability.error);
    }
  }

  const trackingStartedAt = new Date().toISOString();
  const currentStatus = String(application.status ?? "draft");
  const nextStatus = ["under_review", "approved", "rejected", "withdrawn"].includes(currentStatus)
    ? currentStatus
    : "evaluated";

  const updateApplication = await supabaseAdmin
    .from("loan_applications")
    .update({
      selected_product_id: productId,
      tracking_started_at: trackingStartedAt,
      status: nextStatus,
      updated_at: trackingStartedAt,
    })
    .eq("id", applicationId)
    .eq("user_id", userId)
    .select("id, selected_product_id, tracking_started_at")
    .single();

  if (updateApplication.error || !updateApplication.data) {
    throw internalError("Failed to start tracking for application", updateApplication.error);
  }

  await logAudit({
    actorUserId: userId,
    action: "application.tracking.started",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: {
      product_id: productId,
      tracking_started_at: trackingStartedAt,
    },
    ipAddress: ipAddress ?? null,
  });

  const product = productResult.data;
  const bankName = Array.isArray(product.banks)
    ? (product.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
    : (product.banks as { name?: string } | null)?.name ?? "Unknown Bank";

  return {
    application_id: applicationId,
    selected_product_id: productId,
    tracking_started_at: trackingStartedAt,
    redirect_to: `/tracker?applicationId=${applicationId}`,
    product: {
      id: String(product.id),
      name: String(product.name),
      bank_id: String(product.bank_id),
      bank_name: bankName,
    },
  };
}
