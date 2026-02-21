import type { EligibilityRulePayload, LoanApplication, Profile, RecommendationItem } from "../../types/domain";
import { internalError, forbidden, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { checkDocumentCompleteness } from "./document.service";
import { calculateEmi } from "./emi.service";
import { evaluateEligibility } from "./eligibility.service";
import { logAudit } from "./audit.service";
import { calculateApprovalProbability, rankRecommendations } from "./ranking.service";

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

  const docsByProduct = new Map<string, number>();
  for (const scheme of (docsResult.by_scheme as Array<Record<string, unknown>> | undefined) ?? []) {
    docsByProduct.set(String(scheme.product_id), Number(scheme.completeness_score ?? 0));
  }

  const candidates: Array<Omit<RecommendationItem, "rankingScore" | "rankPosition">> = [];

  for (const product of products) {
    const rulePayload = rulesByProduct.get(String(product.id)) ?? {};
    const eligibility = evaluateEligibility(rulePayload, profile, application);

    const effectiveRate = Number(((Number(product.rate_min) + Number(product.rate_max)) / 2).toFixed(2));
    const selectedTenure = clamp(
      application.preferred_tenure_months,
      Number(product.tenure_min_months),
      Number(product.tenure_max_months),
    );

    const emi = calculateEmi(application.requested_amount, effectiveRate, selectedTenure);

    const turnoverRatio =
      (profile.annual_turnover ?? 0) > 0 ? application.requested_amount / Number(profile.annual_turnover) : 0;

    const docCompleteness = docsByProduct.get(String(product.id)) ?? 0;

    const probability = calculateApprovalProbability({
      eligibilityScore: eligibility.score,
      yearsActive: profile.years_active ?? 0,
      turnoverRatio,
      collateralAvailable: application.collateral_available,
      documentCompleteness: docCompleteness,
    });

    const whyRecommended = [
      eligibility.passed ? "Eligibility criteria largely satisfied" : "Eligibility gaps exist",
      `Estimated EMI LKR ${emi.monthlyEmi.toLocaleString("en-LK")}`,
      `Approval probability ${probability.probability.toFixed(1)}%`,
      `Document completeness ${docCompleteness.toFixed(1)}%`,
    ];

    candidates.push({
      productId: String(product.id),
      bankId: String(product.bank_id),
      bankName: Array.isArray(product.banks)
        ? (product.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
        : (product.banks as { name?: string } | null)?.name ?? "Unknown Bank",
      productName: String(product.name),
      eligibilityPassed: eligibility.passed,
      eligibilityScore: eligibility.score,
      reasons: [...eligibility.reasons, ...probability.reasons],
      emi: emi.monthlyEmi,
      totalInterest: emi.totalInterest,
      totalPayable: emi.totalPayable,
      estimatedRate: effectiveRate,
      approvalProbability: probability.probability,
      docCompleteness,
      whyRecommended,
    });
  }

  const eligible = candidates.filter((item) => item.eligibilityPassed);
  const ineligible = candidates.filter((item) => !item.eligibilityPassed);

  const ranked = rankRecommendations(eligible);

  for (const item of [...ranked, ...ineligible.map((entry) => ({ ...entry, rankingScore: 0, rankPosition: null }))]) {
    const { error: upsertError } = await supabaseAdmin
      .from("application_results")
      .upsert(
        {
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
          document_completeness: item.docCompleteness,
          ranking_score: item.rankingScore,
          rank_position: item.rankPosition,
          result_payload: {
            whyRecommended: item.whyRecommended,
            generatedAt: new Date().toISOString(),
          },
        },
        {
          onConflict: "application_id,product_id",
        },
      );

    if (upsertError) {
      throw internalError("Failed to persist application result", upsertError);
    }
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
