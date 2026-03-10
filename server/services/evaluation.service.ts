import type { EligibilityRulePayload, LoanApplication, Profile, RecommendationItem } from "../../types/domain";
import { internalError, forbidden, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { checkDocumentCompleteness } from "./document.service";
import { calculateEmi } from "./emi.service";
import { evaluateEligibility } from "./eligibility.service";
import { logAudit } from "./audit.service";
import { blendApprovalProbabilities, calculateApprovalProbability, rankRecommendations } from "./ranking.service";
import { predictApprovalProbability } from "./ml/prediction.service";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
    throw forbidden("You cannot evaluate another user's application");
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

type EvaluationResult = {
  ranked_results: RecommendationItem[];
  ineligible_results: Array<Omit<RecommendationItem, "rankPosition" | "rankingScore">>;
  docs_summary: {
    overall_completeness: number;
    total_required: number;
    total_missing: number;
  };
  summary: {
    total_products: number;
    eligible_products: number;
    ineligible_products: number;
  };
};

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((value) => String(value));
}

function toNumber(input: unknown, fallback = 0): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type StoredPredictionSummary = {
  source: "ml_model" | "rule_based_fallback";
  fallback_mode: boolean;
  model_id: string | null;
  model_version: string | null;
  confidence: {
    score: number;
    level: "low" | "medium" | "high";
  };
  rule_based_probability: number;
  ml_probability: number | null;
};

function buildFallbackPredictionSummary(ruleBasedProbability: number): {
  probabilityPercent: number;
  explainabilityReasons: string[];
  summary: StoredPredictionSummary;
} {
  return {
    probabilityPercent: ruleBasedProbability,
    explainabilityReasons: ["ML prediction is unavailable for this scheme, so the rule-based estimate was used."],
    summary: {
      source: "rule_based_fallback",
      fallback_mode: true,
      model_id: null,
      model_version: null,
      confidence: {
        score: 0.4,
        level: "low",
      },
      rule_based_probability: ruleBasedProbability,
      ml_probability: null,
    },
  };
}

export async function evaluateApplicationRecommendations(
  userId: string,
  applicationId: string,
  ipAddress?: string | null,
): Promise<EvaluationResult> {
  const [application, profile] = await Promise.all([
    loadOwnedApplication(userId, applicationId),
    loadProfile(userId),
  ]);

  const { data: productData, error: productError } = await supabaseAdmin
    .from("loan_products")
    .select("*, banks(name)")
    .eq("is_active", true);

  if (productError) {
    throw internalError("Failed to load loan products", productError);
  }

  const products = productData ?? [];

  if (products.length === 0) {
    const clearExisting = await supabaseAdmin
      .from("application_results")
      .delete()
      .eq("application_id", applicationId);

    if (clearExisting.error) {
      throw internalError("Failed to clear previous application results", clearExisting.error);
    }

    return {
      ranked_results: [],
      ineligible_results: [],
      docs_summary: {
        overall_completeness: 0,
        total_required: 0,
        total_missing: 0,
      },
      summary: {
        total_products: 0,
        eligible_products: 0,
        ineligible_products: 0,
      },
    };
  }

  const productIds = products.map((item) => String(item.id));

  const [rulesResult, docsResult] = await Promise.all([
    supabaseAdmin
      .from("eligibility_rules")
      .select("product_id, rules_json")
      .in("product_id", productIds)
      .eq("is_active", true),
    checkDocumentCompleteness(userId, applicationId, productIds),
  ]);

  if (rulesResult.error) {
    throw internalError("Failed to load eligibility rules", rulesResult.error);
  }

  const rulesByProduct = new Map(
    (rulesResult.data ?? []).map((item) => [String(item.product_id), (item.rules_json ?? {}) as EligibilityRulePayload]),
  );

  const docsByProduct = new Map<string, { completeness: number; missingDocs: string[] }>();
  for (const scheme of (docsResult.by_scheme as Array<Record<string, unknown>> | undefined) ?? []) {
    docsByProduct.set(String(scheme.product_id), {
      completeness: Number(scheme.completeness_score ?? 0),
      missingDocs: toStringArray(scheme.missing_docs),
    });
  }

  const candidates: Array<
    Omit<RecommendationItem, "rankingScore" | "rankPosition"> & {
      prediction: StoredPredictionSummary;
    }
  > = [];

  for (const product of products) {
    const rulePayload = rulesByProduct.get(String(product.id)) ?? {};
    const eligibility = evaluateEligibility(rulePayload, profile, application);

    let eligibilityPassed = eligibility.passed;
    let eligibilityScore = eligibility.score;
    const ruleReasons = [...eligibility.reasons];

    const minAmount = Number(product.min_amount);
    const maxAmount = Number(product.max_amount);
    if (application.requested_amount < minAmount || application.requested_amount > maxAmount) {
      eligibilityPassed = false;
      eligibilityScore = Math.max(0, eligibilityScore - 30);
      ruleReasons.push(
        `Requested amount must be between LKR ${minAmount.toLocaleString("en-LK")} and LKR ${maxAmount.toLocaleString("en-LK")}`,
      );
    }

    const minTenure = Number(product.tenure_min_months);
    const maxTenure = Number(product.tenure_max_months);
    if (application.preferred_tenure_months < minTenure || application.preferred_tenure_months > maxTenure) {
      eligibilityPassed = false;
      eligibilityScore = Math.max(0, eligibilityScore - 15);
      ruleReasons.push(`Preferred tenure must be between ${minTenure} and ${maxTenure} months`);
    }

    const effectiveRate = Number(((Number(product.rate_min) + Number(product.rate_max)) / 2).toFixed(2));
    const selectedTenure = clamp(
      application.preferred_tenure_months,
      minTenure,
      maxTenure,
    );

    const emi = calculateEmi(application.requested_amount, effectiveRate, selectedTenure);

    const turnoverRatio =
      (profile.annual_turnover ?? 0) > 0 ? application.requested_amount / Number(profile.annual_turnover) : 0;

    const schemeDocuments = docsByProduct.get(String(product.id)) ?? {
      completeness: 0,
      missingDocs: [],
    };
    const documentReadiness = schemeDocuments.completeness;
    const missingDocs = schemeDocuments.missingDocs;

    const ruleBasedProbability = calculateApprovalProbability({
      eligibilityScore,
      yearsActive: profile.years_active ?? 0,
      turnoverRatio,
      collateralAvailable: application.collateral_available,
      documentReadiness,
    });

    const mlPrediction = await (async () => {
      try {
        const prediction = await predictApprovalProbability({
          applicationId,
          viewerUserId: userId,
          productId: String(product.id),
          fallbackProbabilityOverride: ruleBasedProbability.probability,
          featureOverrides: {
            eligibility_score: Number(eligibilityScore.toFixed(2)),
            bank_match_score: Number(eligibilityScore.toFixed(2)),
            document_completeness_score: Number(documentReadiness.toFixed(2)),
            document_quality_score: Number(documentReadiness.toFixed(2)),
            missing_docs_count: missingDocs.length,
            invalid_docs_count: 0,
            unclear_docs_count: 0,
          },
        });

        return {
          probabilityPercent: prediction.probability_percent,
          explainabilityReasons: prediction.explainability.reasons,
          summary: {
            source: prediction.source,
            fallback_mode: prediction.fallback_mode,
            model_id: prediction.model.id,
            model_version: prediction.model.version,
            confidence: prediction.confidence,
            rule_based_probability: ruleBasedProbability.probability,
            ml_probability: prediction.fallback_mode ? null : prediction.probability_percent,
          } satisfies StoredPredictionSummary,
        };
      } catch {
        return buildFallbackPredictionSummary(ruleBasedProbability.probability);
      }
    })();

    const calibratedProbability = blendApprovalProbabilities({
      modelProbability: mlPrediction.summary.ml_probability,
      ruleBasedProbability: ruleBasedProbability.probability,
    });

    const whyRecommended = [
      eligibilityPassed ? "Eligibility criteria largely satisfied" : "Eligibility gaps exist",
      `Estimated EMI LKR ${emi.monthlyEmi.toLocaleString("en-LK")}`,
      mlPrediction.summary.source === "ml_model"
        ? `Calibrated approval probability ${calibratedProbability.probability.toFixed(1)}%`
        : `Fallback approval probability ${calibratedProbability.probability.toFixed(1)}%`,
      `Document readiness ${documentReadiness.toFixed(1)}%`,
    ];

    const recommendationReasons = [
      ...ruleReasons,
      ...ruleBasedProbability.reasons,
      ...mlPrediction.explainabilityReasons.slice(0, 3),
    ];

    if (mlPrediction.summary.source === "ml_model" && calibratedProbability.divergence !== null && calibratedProbability.divergence >= 40) {
      recommendationReasons.push("An extreme ML output was moderated using bank-fit and document-readiness scoring.");
    }

    candidates.push({
      productId: String(product.id),
      bankId: String(product.bank_id),
      bankName: Array.isArray(product.banks)
        ? (product.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
        : (product.banks as { name?: string } | null)?.name ?? "Unknown Bank",
      productName: String(product.name),
      eligibilityPassed,
      eligibilityScore: Number(eligibilityScore.toFixed(2)),
      reasons: recommendationReasons,
      emi: emi.monthlyEmi,
      totalInterest: emi.totalInterest,
      totalPayable: emi.totalPayable,
      estimatedRate: effectiveRate,
      approvalProbability: calibratedProbability.probability,
      docCompleteness: documentReadiness,
      whyRecommended,
      prediction: mlPrediction.summary,
    });
  }

  const eligible = candidates.filter((item) => item.eligibilityPassed);
  const ineligible = candidates.filter((item) => !item.eligibilityPassed);

  const ranked = rankRecommendations(eligible);

  const persistedResults = [
    ...ranked,
    ...ineligible.map((entry) => ({ ...entry, rankingScore: 0, rankPosition: null })),
  ];

  const clearExisting = await supabaseAdmin
    .from("application_results")
    .delete()
    .eq("application_id", applicationId);

  if (clearExisting.error) {
    throw internalError("Failed to reset application results", clearExisting.error);
  }

    const payloadRows = persistedResults.map((item) => ({
      application_id: applicationId,
      product_id: item.productId,
      bank_id: item.bankId,
    eligibility_passed: item.eligibilityPassed,
    eligibility_score: item.eligibilityScore,
    reasons_json: item.reasons,
    emi: item.emi,
    total_interest: item.totalInterest,
      total_payable: item.totalPayable,
      estimated_rate: item.estimatedRate,
      approval_probability: item.approvalProbability,
      initial_probability: item.approvalProbability,
      final_probability: null,
      document_completeness: item.docCompleteness,
      ranking_score: item.rankingScore,
      rank_position: item.rankPosition,
    result_payload: {
      whyRecommended: item.whyRecommended,
      prediction: item.prediction,
      generatedAt: new Date().toISOString(),
    },
  }));

  const { error: persistError } = await supabaseAdmin
    .from("application_results")
    .insert(payloadRows);

  if (persistError) {
    throw internalError("Failed to persist application results", persistError);
  }

  const topPick = ranked[0]?.productId ?? null;

  const { error: appUpdateError } = await supabaseAdmin
    .from("loan_applications")
    .update({
      status: "evaluated",
      selected_product_id: topPick,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("user_id", userId);

  if (appUpdateError) {
    throw internalError("Failed to update application evaluation status", appUpdateError);
  }

  await logAudit({
    actorUserId: userId,
    action: "application.evaluated",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: {
      rankedCount: ranked.length,
      ineligibleCount: ineligible.length,
      topProductId: topPick,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    ranked_results: ranked,
    ineligible_results: ineligible,
    docs_summary: {
      overall_completeness: Number((docsResult.summary as Record<string, unknown> | undefined)?.overall_completeness ?? 0),
      total_required: Number((docsResult.summary as Record<string, unknown> | undefined)?.total_required ?? 0),
      total_missing: Number((docsResult.summary as Record<string, unknown> | undefined)?.total_missing ?? 0),
    },
    summary: {
      total_products: products.length,
      eligible_products: ranked.length,
      ineligible_products: ineligible.length,
    },
  };
}

export async function getStoredEvaluationResults(userId: string, applicationId: string): Promise<EvaluationResult> {
  await loadOwnedApplication(userId, applicationId);

  const [resultsResult, checksResult] = await Promise.all([
    supabaseAdmin
      .from("application_results")
      .select("*, loan_products(name), banks(name)")
      .eq("application_id", applicationId)
      .order("rank_position", { ascending: true, nullsFirst: false })
      .order("ranking_score", { ascending: false }),
    supabaseAdmin
      .from("document_checks")
      .select("checklist_json, completeness_score")
      .eq("application_id", applicationId)
      .eq("user_id", userId),
  ]);

  if (resultsResult.error) {
    throw internalError("Failed to load application evaluation results", resultsResult.error);
  }

  if (checksResult.error) {
    throw internalError("Failed to load document check summary", checksResult.error);
  }

  const rows = resultsResult.data ?? [];

  const mapped = rows.map((row) => {
    const payload = (row.result_payload ?? {}) as Record<string, unknown>;
    const whyRecommended = toStringArray(payload.whyRecommended);

    const recommendation = {
      productId: String(row.product_id),
      bankId: String(row.bank_id),
      bankName: Array.isArray(row.banks)
        ? (row.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
        : (row.banks as { name?: string } | null)?.name ?? "Unknown Bank",
      productName: Array.isArray(row.loan_products)
        ? (row.loan_products[0] as { name?: string } | undefined)?.name ?? "Unknown Product"
        : (row.loan_products as { name?: string } | null)?.name ?? "Unknown Product",
      eligibilityPassed: Boolean(row.eligibility_passed),
      eligibilityScore: toNumber(row.eligibility_score),
      reasons: toStringArray(row.reasons_json),
      emi: toNumber(row.emi),
      totalInterest: toNumber(row.total_interest),
      totalPayable: toNumber(row.total_payable),
      estimatedRate: toNumber(row.estimated_rate),
      approvalProbability: toNumber(row.initial_probability ?? row.approval_probability),
      docCompleteness: toNumber(row.document_completeness),
      whyRecommended,
      prediction: (() => {
        const prediction = payload.prediction as Record<string, unknown> | undefined;
        if (!prediction) {
          return undefined;
        }

        return {
          source: prediction.source === "ml_model" ? "ml_model" : "rule_based_fallback",
          fallback_mode: prediction.fallback_mode === true,
          model_id: prediction.model_id ? String(prediction.model_id) : null,
          model_version: prediction.model_version ? String(prediction.model_version) : null,
          confidence: {
            score: toNumber((prediction.confidence as Record<string, unknown> | undefined)?.score),
            level: ((prediction.confidence as Record<string, unknown> | undefined)?.level === "high"
              || (prediction.confidence as Record<string, unknown> | undefined)?.level === "medium")
              ? String((prediction.confidence as Record<string, unknown> | undefined)?.level) as "medium" | "high"
              : "low",
          },
          rule_based_probability: toNumber(prediction.rule_based_probability),
          ml_probability: prediction.ml_probability == null ? null : toNumber(prediction.ml_probability),
        } satisfies StoredPredictionSummary;
      })(),
      rankingScore: toNumber(row.ranking_score),
      rankPosition: row.rank_position ? Number(row.rank_position) : 0,
    };

    return recommendation;
  });

  const rankedResults = mapped
    .filter((row) => row.eligibilityPassed)
    .sort((left, right) => {
      if (left.rankPosition > 0 && right.rankPosition > 0) {
        return left.rankPosition - right.rankPosition;
      }
      return right.rankingScore - left.rankingScore;
    })
    .map((row, index) => ({
      ...row,
      rankPosition: row.rankPosition > 0 ? row.rankPosition : index + 1,
    })) as RecommendationItem[];

  const ineligibleResults = mapped
    .filter((row) => !row.eligibilityPassed)
    .map(({ rankingScore: _rankingScore, rankPosition: _rankPosition, ...rest }) => rest);

  const checks = checksResult.data ?? [];
  const checklistRows = checks.flatMap((row) =>
    Array.isArray(row.checklist_json) ? row.checklist_json : [],
  ) as Array<Record<string, unknown>>;

  const requiredRows = checklistRows.filter((row) => row.required === true);
  const missingRows = requiredRows.filter((row) => row.is_available !== true && row.available !== true);

  const completenessFromChecks =
    checks.length > 0
      ? Number(
          (
            checks.reduce((sum, row) => sum + toNumber(row.completeness_score), 0) /
            checks.length
          ).toFixed(2),
        )
      : 0;

  return {
    ranked_results: rankedResults,
    ineligible_results: ineligibleResults,
    docs_summary: {
      overall_completeness: completenessFromChecks,
      total_required: requiredRows.length,
      total_missing: missingRows.length,
    },
    summary: {
      total_products: mapped.length,
      eligible_products: rankedResults.length,
      ineligible_products: ineligibleResults.length,
    },
  };
}
