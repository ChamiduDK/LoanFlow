import type { EligibilityRulePayload, LoanApplication, Profile } from "../../types/domain";
import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { calculateEmi } from "./emi.service";
import { evaluateEligibility } from "./eligibility.service";
import { checkDocumentCompleteness } from "./document.service";
import { logAudit } from "./audit.service";
import { predictApprovalProbability } from "./ml/prediction.service";
import { blendApprovalProbabilities } from "./ranking.service";

type DocumentAvailabilityStatus = "available" | "missing";

export type TrackerReEvaluationResult = {
  application_id: string;
  product: {
    id: string;
    name: string;
    bank_id: string;
    bank_name: string;
    estimated_rate: number;
    selected_tenure_months: number;
    estimated_emi: number;
  };
  eligibility: {
    passed: boolean;
    score: number;
    reasons: string[];
  };
  documents: {
    readiness_score: number;
    required_count: number;
    available_count: number;
    missing_count: number;
    missing_docs: string[];
    availability_notes: Array<{
      document_type: string;
      display_name: string;
      note: string;
      status: DocumentAvailabilityStatus;
    }>;
  };
  scoring: {
    bank_match_score: number;
    document_readiness_score: number;
    initial_probability: number;
    rule_based_final_probability: number;
    model_probability: number | null;
    final_probability: number;
  };
  prediction: {
    source: "ml_model" | "rule_based_fallback";
    fallback_mode: boolean;
    model_id: string | null;
    model_version: string | null;
    confidence: {
      score: number;
      level: "low" | "medium" | "high";
    };
  };
  reasons: string[];
  evaluated_at: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(input: unknown, fallback = 0): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadOwnedApplication(userId: string, applicationId: string): Promise<LoanApplication> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("*")
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

  return data as LoanApplication;
}

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load profile", error);
  }

  if (!data) {
    throw notFound("Profile not found");
  }

  return data as Profile;
}

export async function reEvaluateTrackedApplication(
  userId: string,
  applicationId: string,
  productIdOverride?: string,
  ipAddress?: string | null,
): Promise<TrackerReEvaluationResult> {
  const [application, profile] = await Promise.all([
    loadOwnedApplication(userId, applicationId),
    loadProfile(userId),
  ]);

  const selectedProductId = productIdOverride ?? application.selected_product_id;
  if (!selectedProductId) {
    throw notFound("No tracked loan product selected for this application");
  }

  const [productResult, rulesResult, requiredDocsResult, checksResult, existingResult] = await Promise.all([
    supabaseAdmin
      .from("loan_products")
      .select("*, banks(name)")
      .eq("id", selectedProductId)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("eligibility_rules")
      .select("rules_json")
      .eq("product_id", selectedProductId)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("required_documents")
      .select("document_type, display_name, is_required")
      .eq("product_id", selectedProductId),
    checkDocumentCompleteness(userId, applicationId, [selectedProductId]),
    supabaseAdmin
      .from("application_results")
      .select("*")
      .eq("application_id", applicationId)
      .eq("product_id", selectedProductId)
      .maybeSingle(),
  ]);

  if (productResult.error) {
    throw internalError("Failed to load tracked loan product", productResult.error);
  }

  if (!productResult.data) {
    throw notFound("Tracked loan product was not found");
  }

  if (rulesResult.error) {
    throw internalError("Failed to load product eligibility rules", rulesResult.error);
  }

  if (requiredDocsResult.error) {
    throw internalError("Failed to load required documents", requiredDocsResult.error);
  }

  if (existingResult.error) {
    throw internalError("Failed to load existing recommendation result", existingResult.error);
  }

  const product = productResult.data;
  const rulePayload = (rulesResult.data?.rules_json ?? {}) as EligibilityRulePayload;
  const requiredDocs = (requiredDocsResult.data ?? []).filter((row) => row.is_required === true);

  const eligibility = evaluateEligibility(rulePayload, profile, application);
  let eligibilityScore = eligibility.score;
  let eligibilityPassed = eligibility.passed;
  const eligibilityReasons = [...eligibility.reasons];

  const minAmount = Number(product.min_amount);
  const maxAmount = Number(product.max_amount);
  if (application.requested_amount < minAmount || application.requested_amount > maxAmount) {
    eligibilityPassed = false;
    eligibilityScore = Math.max(0, eligibilityScore - 30);
    eligibilityReasons.push(
      `Requested amount must be between LKR ${minAmount.toLocaleString("en-LK")} and LKR ${maxAmount.toLocaleString("en-LK")}`,
    );
  }

  const minTenure = Number(product.tenure_min_months);
  const maxTenure = Number(product.tenure_max_months);
  if (application.preferred_tenure_months < minTenure || application.preferred_tenure_months > maxTenure) {
    eligibilityPassed = false;
    eligibilityScore = Math.max(0, eligibilityScore - 15);
    eligibilityReasons.push(`Preferred tenure must be between ${minTenure} and ${maxTenure} months`);
  }

  const checksByScheme = ((checksResult.by_scheme as Array<Record<string, unknown>> | undefined) ?? [])[0] ?? {};
  const readinessScore = toNumber(checksByScheme.completeness_score, 0);
  const missingDocs = ((checksByScheme.missing_docs as string[] | undefined) ?? []).map((item) => String(item));

  const checklist = (checksByScheme.checklist as Array<Record<string, any>> | undefined) ?? [];
  const checklistMap = new Map(checklist.map((item) => [String(item.document_type).trim().toLowerCase(), item]));

  const availabilityNotes: TrackerReEvaluationResult["documents"]["availability_notes"] = [];
  let availableCount = 0;

  for (const required of requiredDocs) {
    const key = String(required.document_type).trim().toLowerCase();
    const item = checklistMap.get(key);

    if (item?.is_available === true) {
      availableCount += 1;
      availabilityNotes.push({
        document_type: String(required.document_type),
        display_name: String(required.display_name),
        note: "Applicant has marked this document as available.",
        status: "available",
      });
      continue;
    }

    availabilityNotes.push({
      document_type: String(required.document_type),
      display_name: String(required.display_name),
      note: "Applicant has not marked this document as available yet.",
      status: "missing",
    });
  }

  const bankMatchScore = Number(eligibilityScore.toFixed(2));
  let finalProbabilityRaw = bankMatchScore * 0.8 + readinessScore * 0.2;
  if (!eligibilityPassed) {
    finalProbabilityRaw = Math.min(finalProbabilityRaw, 55);
  }

  const existingInitialProbability =
    existingResult.data?.initial_probability ??
    existingResult.data?.approval_probability ??
    null;
  const normalizedExistingInitialProbability =
    typeof existingInitialProbability === "number" && Number.isFinite(existingInitialProbability) && existingInitialProbability > 0
      ? Number(existingInitialProbability)
      : null;

  const ruleBasedFinalProbability = clamp(Number(finalProbabilityRaw.toFixed(2)), 0, 100);

  const initialProbability = Number(
    (
      normalizedExistingInitialProbability ??
      existingResult.data?.approval_probability ??
      Math.max(ruleBasedFinalProbability, bankMatchScore * 0.8)
    ).toFixed(2),
  );

  const mlPrediction = await (async () => {
    try {
      return await predictApprovalProbability({
        applicationId,
        viewerUserId: userId,
        productId: String(selectedProductId),
        fallbackProbabilityOverride: ruleBasedFinalProbability,
        featureOverrides: {
          eligibility_score: Number(eligibilityScore.toFixed(2)),
          bank_match_score: bankMatchScore,
          document_completeness_score: readinessScore,
          document_quality_score: readinessScore,
          missing_docs_count: missingDocs.length,
          invalid_docs_count: 0,
          unclear_docs_count: 0,
        },
      });
    } catch {
      return {
        probability: ruleBasedFinalProbability / 100,
        probability_percent: ruleBasedFinalProbability,
        fallback_mode: true,
        source: "rule_based_fallback" as const,
        model: {
          id: null,
          version: null,
        },
        explainability: {
          reasons: [
            "ML prediction service is unavailable; using rule-based fallback score.",
          ],
          contributions: [],
        },
        confidence: {
          score: 0.4,
          level: "low" as const,
        },
        feature_sample: {
          sample_key: "",
          application_id: applicationId,
          product_id: String(selectedProductId),
          outcome_status: null,
          label: null,
          features: {
            requested_amount: 0,
            preferred_tenure_months: 0,
            years_active: 0,
            annual_turnover: 0,
            amount_turnover_ratio: 0,
            eligibility_score: 0,
            bank_match_score: 0,
            document_completeness_score: 0,
            document_quality_score: 0,
            missing_docs_count: 0,
            invalid_docs_count: 0,
            unclear_docs_count: 0,
            rate_min: 0,
            rate_max: 0,
            product_min_amount: 0,
            product_max_amount: 0,
            product_tenure_min: 0,
            product_tenure_max: 0,
            collateral_available: 0,
            product_collateral_required: 0,
            business_type: "unknown",
            industry: "unknown",
            turnover_band: "unknown",
            district: "unknown",
            purpose: "unknown",
            collateral_type: "unknown",
            bank_id: "unknown",
            product_id: "unknown",
          },
          fallback_rule_probability: ruleBasedFinalProbability,
        },
      };
    }
  })();

  const modelProbability = mlPrediction.fallback_mode ? null : mlPrediction.probability_percent;
  const calibratedProbability = blendApprovalProbabilities({
    modelProbability,
    ruleBasedProbability: ruleBasedFinalProbability,
    previousProbability: normalizedExistingInitialProbability,
  });
  let finalProbability = calibratedProbability.probability;

  if (!eligibilityPassed) {
    finalProbability = Math.min(finalProbability, 60);
  }
  finalProbability = clamp(Number(finalProbability.toFixed(2)), 0, 100);

  const selectedTenure = clamp(
    application.preferred_tenure_months,
    minTenure,
    maxTenure,
  );
  const estimatedRate = Number(((Number(product.rate_min) + Number(product.rate_max)) / 2).toFixed(2));
  const emi = calculateEmi(application.requested_amount, estimatedRate, selectedTenure);

  const reasons: string[] = [];
  if (eligibilityPassed) {
    reasons.push("Business and loan profile align with the selected bank's core criteria.");
  } else {
    reasons.push("Eligibility gaps were identified for the selected bank scheme.");
  }
  if (missingDocs.length > 0 && availableCount > 0) {
    reasons.push(`${availableCount} of ${requiredDocs.length} preferred bank documents are already available.`);
  } else if (missingDocs.length > 0) {
    reasons.push("Marking available documents will improve the accuracy of this bank-specific estimate.");
  } else {
    reasons.push("All preferred bank documents are already marked as available.");
  }
  if (mlPrediction.fallback_mode) {
    reasons.push(
      mlPrediction.explainability.reasons[0] ??
      "ML prediction is currently unavailable, so the rule-based fallback score was used.",
    );
  } else {
    reasons.push(`ML model ${mlPrediction.model.version ?? "active"} predicted ${mlPrediction.probability_percent.toFixed(1)}%.`);
    if (calibratedProbability.divergence !== null && calibratedProbability.divergence >= 40) {
      reasons.push("That raw ML result was moderated using bank-fit and document-readiness scoring.");
    }
    reasons.push(...mlPrediction.explainability.reasons.slice(0, 2));
  }
  reasons.push(`Final probability refined to ${finalProbability.toFixed(1)}% using bank fit and document readiness.`);

  const trackerPayload = {
    tracker_re_evaluation: {
      bank_match_score: bankMatchScore,
      document_readiness_score: readinessScore,
      document_completeness_score: readinessScore,
      document_quality_score: readinessScore,
      rule_based_final_probability: ruleBasedFinalProbability,
      model_probability: modelProbability,
      final_probability: finalProbability,
      reasons,
      availability_notes: availabilityNotes,
      ml_prediction: {
        source: mlPrediction.source,
        fallback_mode: mlPrediction.fallback_mode,
        model: mlPrediction.model,
        confidence: mlPrediction.confidence,
        explainability: mlPrediction.explainability,
      },
      evaluated_at: new Date().toISOString(),
    },
  };

  if (existingResult.data) {
    const mergedPayload = {
      ...((existingResult.data.result_payload as Record<string, unknown> | null) ?? {}),
      ...trackerPayload,
    };

    const updateResult = await supabaseAdmin
      .from("application_results")
      .update({
        eligibility_passed: eligibilityPassed,
        eligibility_score: eligibilityScore,
        reasons_json: eligibilityReasons,
        estimated_rate: estimatedRate,
        emi: emi.monthlyEmi,
        total_interest: emi.totalInterest,
        total_payable: emi.totalPayable,
        document_completeness: readinessScore,
        initial_probability: initialProbability,
        final_probability: finalProbability,
        result_payload: mergedPayload,
      })
      .eq("id", existingResult.data.id);

    if (updateResult.error) {
      throw internalError("Failed to update tracked application result", updateResult.error);
    }
  } else {
    const insertResult = await supabaseAdmin
      .from("application_results")
      .insert({
        application_id: applicationId,
        product_id: selectedProductId,
        bank_id: product.bank_id,
        eligibility_passed: eligibilityPassed,
        eligibility_score: eligibilityScore,
        reasons_json: eligibilityReasons,
        emi: emi.monthlyEmi,
        total_interest: emi.totalInterest,
        total_payable: emi.totalPayable,
        estimated_rate: estimatedRate,
        approval_probability: initialProbability,
        initial_probability: initialProbability,
        final_probability: finalProbability,
        document_completeness: readinessScore,
        ranking_score: 0,
        rank_position: null,
        result_payload: trackerPayload,
      });

    if (insertResult.error) {
      throw internalError("Failed to create tracked application result", insertResult.error);
    }
  }

  const notesUpsert = await supabaseAdmin
    .from("document_checks")
    .upsert(
      {
        application_id: applicationId,
        product_id: selectedProductId,
        user_id: userId,
        checklist_json: checksByScheme.checklist ?? [],
        missing_docs: missingDocs,
        completeness_score: readinessScore,
        validation_notes_json: availabilityNotes,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "application_id,product_id" },
    );

  if (notesUpsert.error) {
    throw internalError("Failed to update document validation notes", notesUpsert.error);
  }

  await logAudit({
    actorUserId: userId,
    action: "application.tracker.re_evaluated",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: {
      product_id: selectedProductId,
      final_probability: finalProbability,
      probability_source: mlPrediction.source,
      fallback_mode: mlPrediction.fallback_mode,
      missing_docs: missingDocs.length,
      available_docs: availableCount,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    application_id: applicationId,
    product: {
      id: selectedProductId,
      name: String(product.name),
      bank_id: String(product.bank_id),
      bank_name: Array.isArray(product.banks)
        ? (product.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
        : (product.banks as { name?: string } | null)?.name ?? "Unknown Bank",
      estimated_rate: estimatedRate,
      selected_tenure_months: selectedTenure,
      estimated_emi: emi.monthlyEmi,
    },
    eligibility: {
      passed: eligibilityPassed,
      score: Number(eligibilityScore.toFixed(2)),
      reasons: eligibilityReasons,
    },
    documents: {
      readiness_score: readinessScore,
      required_count: requiredDocs.length,
      available_count: availableCount,
      missing_count: missingDocs.length,
      missing_docs: missingDocs,
      availability_notes: availabilityNotes,
    },
    scoring: {
      bank_match_score: bankMatchScore,
      document_readiness_score: readinessScore,
      initial_probability: initialProbability,
      rule_based_final_probability: ruleBasedFinalProbability,
      model_probability: modelProbability,
      final_probability: finalProbability,
    },
    prediction: {
      source: mlPrediction.source,
      fallback_mode: mlPrediction.fallback_mode,
      model_id: mlPrediction.model.id,
      model_version: mlPrediction.model.version,
      confidence: mlPrediction.confidence,
    },
    reasons,
    evaluated_at: new Date().toISOString(),
  };
}
