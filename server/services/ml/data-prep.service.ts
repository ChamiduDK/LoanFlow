import { createHash } from "node:crypto";
import { forbidden, internalError, notFound } from "../../lib/errors";
import { supabaseAdmin } from "../../lib/supabase/client";
import type { MlFeatureRecord, MlFeatureSample } from "./types";

type BuildSampleInput = {
  applicationId: string;
  viewerUserId?: string;
  selectedProductId?: string | null;
  outcomeStatusHint?: "approved" | "rejected" | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCategory(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/\s+/g, "_");
  return normalized.length > 0 ? normalized : "unknown";
}

function toBooleanFeature(value: unknown): number {
  return value === true ? 1 : 0;
}

function computeDocQuality(validCount: number, invalidCount: number, unclearCount: number): number {
  const total = validCount + invalidCount + unclearCount;
  if (total <= 0) {
    return 0;
  }
  return Number((((validCount + unclearCount * 0.5) / total) * 100).toFixed(2));
}

function computeSampleKey(applicationId: string, productId: string | null): string {
  return createHash("sha256")
    .update(`${applicationId}:${productId ?? "none"}`)
    .digest("hex");
}

type FeatureContext = {
  application: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  check: Record<string, unknown> | null;
  documents: Array<Record<string, unknown>>;
  outcome: Record<string, unknown> | null;
};

async function loadFeatureContext(input: BuildSampleInput): Promise<FeatureContext> {
  const appResult = await supabaseAdmin
    .from("loan_applications")
    .select("*")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (appResult.error) {
    throw internalError("Failed to load application for ML features", appResult.error);
  }

  if (!appResult.data) {
    throw notFound("Application not found");
  }

  if (input.viewerUserId && appResult.data.user_id !== input.viewerUserId) {
    throw forbidden("You cannot access this application");
  }

  const selectedProductId =
    input.selectedProductId ??
    (appResult.data.selected_product_id ? String(appResult.data.selected_product_id) : null);

  const [profileResult, topResult, specificResult, checkResult, fallbackCheckResult, docsResult, outcomeResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", appResult.data.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from("application_results")
      .select("*")
      .eq("application_id", input.applicationId)
      .order("rank_position", { ascending: true, nullsFirst: false })
      .order("ranking_score", { ascending: false })
      .limit(1)
      .maybeSingle(),
    selectedProductId
      ? supabaseAdmin
          .from("application_results")
          .select("*")
          .eq("application_id", input.applicationId)
          .eq("product_id", selectedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectedProductId
      ? supabaseAdmin
          .from("document_checks")
          .select("*")
          .eq("application_id", input.applicationId)
          .eq("product_id", selectedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("document_checks")
      .select("*")
      .eq("application_id", input.applicationId)
      .order("completeness_score", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("documents")
      .select("id, product_id, validation_status, status")
      .eq("application_id", input.applicationId)
      .eq("user_id", appResult.data.user_id),
    supabaseAdmin
      .from("outcomes")
      .select("*")
      .eq("application_id", input.applicationId)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    throw internalError("Failed to load profile for ML features", profileResult.error);
  }
  if (topResult.error) {
    throw internalError("Failed to load application result for ML features", topResult.error);
  }
  if (specificResult.error) {
    throw internalError("Failed to load selected product result for ML features", specificResult.error);
  }
  if (checkResult.error) {
    throw internalError("Failed to load selected document check for ML features", checkResult.error);
  }
  if (fallbackCheckResult.error) {
    throw internalError("Failed to load fallback document check for ML features", fallbackCheckResult.error);
  }
  if (docsResult.error) {
    throw internalError("Failed to load documents for ML features", docsResult.error);
  }
  if (outcomeResult.error) {
    throw internalError("Failed to load outcome for ML features", outcomeResult.error);
  }

  const resolvedResult = (specificResult.data ?? topResult.data) as Record<string, unknown> | null;
  const resolvedProductId = selectedProductId ?? (resolvedResult?.product_id ? String(resolvedResult.product_id) : null);

  const productResult = resolvedProductId
    ? await supabaseAdmin
        .from("loan_products")
        .select("id, bank_id, name, min_amount, max_amount, rate_min, rate_max, tenure_min_months, tenure_max_months, collateral_required, banks(name)")
        .eq("id", resolvedProductId)
        .maybeSingle()
    : { data: null, error: null };

  if (productResult.error) {
    throw internalError("Failed to load product context for ML features", productResult.error);
  }

  return {
    application: appResult.data as Record<string, unknown>,
    profile: (profileResult.data ?? null) as Record<string, unknown> | null,
    product: (productResult.data ?? null) as Record<string, unknown> | null,
    result: resolvedResult,
    check: (checkResult.data ?? fallbackCheckResult.data ?? null) as Record<string, unknown> | null,
    documents: (docsResult.data ?? []) as Array<Record<string, unknown>>,
    outcome: (outcomeResult.data ?? null) as Record<string, unknown> | null,
  };
}

function deriveFeatureRecord(context: FeatureContext): {
  record: MlFeatureRecord;
  productId: string | null;
  fallbackProbability: number;
  outcomeStatus: "approved" | "rejected" | null;
  label: 0 | 1 | null;
} {
  const application = context.application;
  const profile = context.profile ?? {};
  const product = context.product ?? {};
  const result = context.result ?? {};
  const check = context.check ?? {};
  const outcome = context.outcome ?? {};

  const trackerPayload = (
    ((result.result_payload as Record<string, unknown> | null) ?? {}).tracker_re_evaluation as Record<string, unknown> | undefined
  ) ?? {};

  const selectedProductId =
    (product.id ? String(product.id) : null) ??
    (result.product_id ? String(result.product_id) : null) ??
    (application.selected_product_id ? String(application.selected_product_id) : null);

  const validDocs = context.documents.filter((doc) => String(doc.validation_status ?? "unclear") === "valid").length;
  const invalidDocs = context.documents.filter((doc) => String(doc.validation_status ?? "unclear") === "invalid").length;
  const unclearDocs = context.documents.filter((doc) => String(doc.validation_status ?? "unclear") === "unclear").length;

  const missingDocsCount = Array.isArray(check.missing_docs)
    ? check.missing_docs.length
    : toNumber(trackerPayload.missing_count, 0);

  const docCompleteness = toNumber(
    trackerPayload.document_completeness_score,
    toNumber(check.completeness_score, toNumber(result.document_completeness, 0)),
  );

  const docQuality = toNumber(
    trackerPayload.document_quality_score,
    computeDocQuality(validDocs, invalidDocs, unclearDocs),
  );

  const eligibilityScore = toNumber(result.eligibility_score, 0);
  const bankMatchScore = toNumber(trackerPayload.bank_match_score, eligibilityScore);

  const annualTurnover = toNumber(profile.annual_turnover, 0);
  const requestedAmount = toNumber(application.requested_amount, 0);
  const amountTurnoverRatio = annualTurnover > 0
    ? Number((requestedAmount / annualTurnover).toFixed(6))
    : 0;

  const fallbackProbability = toNumber(
    trackerPayload.final_probability,
    toNumber(result.final_probability, toNumber(result.initial_probability, toNumber(result.approval_probability, 0))),
  );

  const rawOutcomeStatus = toCategory(outcome.status);
  const outcomeStatus = rawOutcomeStatus === "approved" || rawOutcomeStatus === "rejected"
    ? rawOutcomeStatus
    : null;
  const label = outcomeStatus === "approved" ? 1 : outcomeStatus === "rejected" ? 0 : null;

  const record: MlFeatureRecord = {
    requested_amount: requestedAmount,
    preferred_tenure_months: toNumber(application.preferred_tenure_months, 0),
    years_active: toNumber(profile.years_active, 0),
    annual_turnover: annualTurnover,
    amount_turnover_ratio: amountTurnoverRatio,
    eligibility_score: eligibilityScore,
    bank_match_score: bankMatchScore,
    document_completeness_score: docCompleteness,
    document_quality_score: docQuality,
    missing_docs_count: missingDocsCount,
    invalid_docs_count: toNumber(trackerPayload.invalid_count, invalidDocs),
    unclear_docs_count: toNumber(trackerPayload.unclear_count, unclearDocs),
    rate_min: toNumber(product.rate_min, 0),
    rate_max: toNumber(product.rate_max, 0),
    product_min_amount: toNumber(product.min_amount, 0),
    product_max_amount: toNumber(product.max_amount, 0),
    product_tenure_min: toNumber(product.tenure_min_months, 0),
    product_tenure_max: toNumber(product.tenure_max_months, 0),
    collateral_available: toBooleanFeature(application.collateral_available),
    product_collateral_required: toBooleanFeature(product.collateral_required),
    business_type: toCategory(profile.business_type),
    industry: toCategory(profile.industry),
    turnover_band: toCategory(profile.turnover_band),
    district: toCategory(profile.district),
    purpose: toCategory(application.purpose),
    collateral_type: toCategory(application.collateral_type),
    bank_id: toCategory(product.bank_id),
    product_id: toCategory(selectedProductId),
  };

  return {
    record,
    productId: selectedProductId,
    fallbackProbability,
    outcomeStatus,
    label,
  };
}

export async function buildFeatureSampleForApplication(input: BuildSampleInput): Promise<MlFeatureSample> {
  const context = await loadFeatureContext(input);
  const derived = deriveFeatureRecord(context);
  const outcomeStatus = input.outcomeStatusHint ?? derived.outcomeStatus;
  const label = outcomeStatus === "approved" ? 1 : outcomeStatus === "rejected" ? 0 : null;

  return {
    sample_key: computeSampleKey(String(context.application.id), derived.productId),
    application_id: String(context.application.id),
    product_id: derived.productId,
    outcome_status: outcomeStatus,
    label,
    features: derived.record,
    fallback_rule_probability: derived.fallbackProbability,
  };
}

export async function buildTrainingDatasetFromOutcomes(): Promise<MlFeatureSample[]> {
  const outcomesResult = await supabaseAdmin
    .from("outcomes")
    .select("application_id, status")
    .in("status", ["approved", "rejected"]);

  if (outcomesResult.error) {
    throw internalError("Failed to load finalized outcomes for ML training", outcomesResult.error);
  }

  const rows = outcomesResult.data ?? [];
  const samples: MlFeatureSample[] = [];

  for (const row of rows) {
    const status = String(row.status) === "approved" ? "approved" : String(row.status) === "rejected" ? "rejected" : null;
    if (!status) {
      continue;
    }

    try {
      const sample = await buildFeatureSampleForApplication({
        applicationId: String(row.application_id),
        outcomeStatusHint: status,
      });

      if (!sample.product_id || sample.label == null) {
        continue;
      }

      samples.push(sample);
    } catch {
      continue;
    }
  }

  return samples;
}

function chunkArray<T>(input: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function persistTrainingSamples(samples: MlFeatureSample[]): Promise<number> {
  if (samples.length === 0) {
    return 0;
  }

  const rows = samples
    .filter((sample) => sample.label !== null && sample.outcome_status !== null)
    .map((sample) => ({
      sample_key: sample.sample_key,
      application_id: sample.application_id,
      product_id: sample.product_id,
      outcome_status: sample.outcome_status,
      label: sample.label,
      feature_json: sample.features,
      source_snapshot_at: new Date().toISOString(),
    }));

  for (const chunk of chunkArray(rows, 200)) {
    const upsert = await supabaseAdmin
      .from("ml_training_samples")
      .upsert(chunk, { onConflict: "sample_key" });

    if (upsert.error) {
      throw internalError("Failed to persist ML training samples", upsert.error);
    }
  }

  return rows.length;
}
