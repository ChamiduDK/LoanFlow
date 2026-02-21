import type { EligibilityEvaluation, EligibilityRulePayload, LoanApplication, Profile } from "../../types/domain";

const turnoverBandRanking: Record<string, number> = {
  below_1m: 1,
  "1m_5m": 2,
  "5m_25m": 3,
  "25m_100m": 4,
  above_100m: 5,
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function evaluateEligibility(
  rules: EligibilityRulePayload,
  profile: Profile,
  application: LoanApplication,
): EligibilityEvaluation {
  let score = 100;
  const reasons: string[] = [];
  const matchedRules: string[] = [];
  const failedRules: string[] = [];

  const yearsActive = profile.years_active ?? 0;
  const annualTurnover = profile.annual_turnover ?? 0;
  const monthlyIncome = profile.monthly_income ?? 0;
  const monthlyObligations = profile.existing_loan_obligations ?? 0;

  if (rules.min_years_active !== undefined) {
    if (yearsActive < rules.min_years_active) {
      score -= 20;
      reasons.push(`Business must be active for at least ${rules.min_years_active} years`);
      failedRules.push("min_years_active");
    } else {
      matchedRules.push("min_years_active");
    }
  }

  if (rules.allowed_business_types?.length) {
    const candidate = normalizeText(profile.business_type);
    const allowed = rules.allowed_business_types.map((item) => normalizeText(item));
    if (!allowed.includes(candidate)) {
      score -= 15;
      reasons.push("Business type is outside allowed categories");
      failedRules.push("allowed_business_types");
    } else {
      matchedRules.push("allowed_business_types");
    }
  }

  if (rules.allowed_purposes?.length) {
    const candidate = normalizeText(application.purpose);
    const allowed = rules.allowed_purposes.map((item) => normalizeText(item));
    if (!allowed.includes(candidate)) {
      score -= 10;
      reasons.push("Loan purpose is outside allowed purposes");
      failedRules.push("allowed_purposes");
    } else {
      matchedRules.push("allowed_purposes");
    }
  }

  if (rules.min_turnover !== undefined) {
    if (annualTurnover < rules.min_turnover) {
      score -= 20;
      reasons.push(`Minimum annual turnover requirement is LKR ${rules.min_turnover.toLocaleString("en-LK")}`);
      failedRules.push("min_turnover");
    } else {
      matchedRules.push("min_turnover");
    }
  }

  if (rules.allowed_turnover_bands?.length && profile.turnover_band) {
    const allowedRanks = rules.allowed_turnover_bands
      .map((item) => turnoverBandRanking[item])
      .filter((value): value is number => Boolean(value));

    const candidateRank = turnoverBandRanking[profile.turnover_band] ?? 0;

    if (allowedRanks.length > 0 && !allowedRanks.includes(candidateRank)) {
      score -= 10;
      reasons.push("Turnover band is outside allowed range");
      failedRules.push("allowed_turnover_bands");
    } else {
      matchedRules.push("allowed_turnover_bands");
    }
  }

  if (rules.max_amount_ratio_turnover !== undefined && annualTurnover > 0) {
    const ratio = application.requested_amount / annualTurnover;
    if (ratio > rules.max_amount_ratio_turnover) {
      score -= 15;
      reasons.push(
        `Requested amount exceeds turnover ratio limit (${rules.max_amount_ratio_turnover.toFixed(2)}x)`
      );
      failedRules.push("max_amount_ratio_turnover");
    } else {
      matchedRules.push("max_amount_ratio_turnover");
    }
  }

  if (rules.collateral_required) {
    if (!application.collateral_available) {
      score -= 15;
      reasons.push("Collateral is required for this scheme");
      failedRules.push("collateral_required");
    } else {
      matchedRules.push("collateral_required");
    }
  }

  if (rules.min_monthly_income !== undefined) {
    if (monthlyIncome < rules.min_monthly_income) {
      score -= 10;
      reasons.push(`Monthly income must be at least LKR ${rules.min_monthly_income.toLocaleString("en-LK")}`);
      failedRules.push("min_monthly_income");
    } else {
      matchedRules.push("min_monthly_income");
    }
  }

  if (rules.max_existing_obligations_ratio !== undefined && monthlyIncome > 0) {
    const ratio = monthlyObligations / monthlyIncome;
    if (ratio > rules.max_existing_obligations_ratio) {
      score -= 10;
      reasons.push("Existing debt obligations are above the allowed ratio");
      failedRules.push("max_existing_obligations_ratio");
    } else {
      matchedRules.push("max_existing_obligations_ratio");
    }
  }

  const boundedScore = Math.max(0, Math.min(100, Number(score.toFixed(2))));

  return {
    passed: boundedScore >= 60,
    score: boundedScore,
    reasons,
    matched_rules: matchedRules,
    failed_rules: failedRules,
  };
}
