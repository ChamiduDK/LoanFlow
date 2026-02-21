import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { getTrackerSummary } from "./tracker.service";

type LoanManagementSummary = {
  application_id: string;
  status: "approved";
  unlocked: true;
  tracking_started_at: string | null;
  selected_product: {
    id: string;
    name: string;
    bank_id: string;
    bank_name: string;
  } | null;
  final_probability: number | null;
  tracker_summary: Awaited<ReturnType<typeof getTrackerSummary>>;
};

async function loadOwnedApplication(userId: string, applicationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id, selected_product_id, tracking_started_at, status")
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

export async function getLoanManagementSummary(userId: string, applicationId: string): Promise<LoanManagementSummary> {
  const application = await loadOwnedApplication(userId, applicationId);

  const outcomeResult = await supabaseAdmin
    .from("outcomes")
    .select("status")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (outcomeResult.error) {
    throw internalError("Failed to validate outcome status", outcomeResult.error);
  }

  if (!outcomeResult.data || outcomeResult.data.status !== "approved") {
    throw forbidden("Loan management is available only after approval");
  }

  const selectedProductId = application.selected_product_id ? String(application.selected_product_id) : null;

  const [trackerSummary, productResult, resultResult] = await Promise.all([
    getTrackerSummary(userId, applicationId),
    selectedProductId
      ? supabaseAdmin
          .from("loan_products")
          .select("id, bank_id, name, banks(name)")
          .eq("id", selectedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectedProductId
      ? supabaseAdmin
          .from("application_results")
          .select("initial_probability, final_probability, approval_probability")
          .eq("application_id", applicationId)
          .eq("product_id", selectedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (productResult.error) {
    throw internalError("Failed to load selected product", productResult.error);
  }

  if (resultResult.error) {
    throw internalError("Failed to load tracked result scores", resultResult.error);
  }

  const probabilityValue = resultResult.data
    ? (
        resultResult.data.final_probability ??
        resultResult.data.initial_probability ??
        resultResult.data.approval_probability ??
        null
      )
    : null;
  const finalProbability = probabilityValue == null ? null : Number(probabilityValue);

  const product = productResult.data
    ? {
        id: String(productResult.data.id),
        name: String(productResult.data.name),
        bank_id: String(productResult.data.bank_id),
        bank_name: Array.isArray(productResult.data.banks)
          ? (productResult.data.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
          : (productResult.data.banks as { name?: string } | null)?.name ?? "Unknown Bank",
      }
    : null;

  return {
    application_id: applicationId,
    status: "approved",
    unlocked: true,
    tracking_started_at: application.tracking_started_at ? String(application.tracking_started_at) : null,
    selected_product: product,
    final_probability: finalProbability !== null && Number.isFinite(finalProbability)
      ? Number(finalProbability.toFixed(2))
      : null,
    tracker_summary: trackerSummary,
  };
}
