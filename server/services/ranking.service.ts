import type { RecommendationItem } from "../../types/domain";

type ProbabilityInput = {
  eligibilityScore: number;
  yearsActive: number;
  turnoverRatio: number;
  collateralAvailable: boolean;
  documentReadiness: number;
};

type ProbabilityBlendInput = {
  modelProbability?: number | null;
  ruleBasedProbability: number;
  previousProbability?: number | null;
};

type ProbabilityBlendResult = {
  probability: number;
  strategy: "rule_based_only" | "ml_blended";
  modelWeight: number;
  divergence: number | null;
};

const WEIGHTS = {
  eligibility: 0.4,
  totalCost: 0.25,
  emi: 0.2,
  probability: 0.15,
} as const;

export function calculateApprovalProbability(input: ProbabilityInput): { probability: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  score += input.eligibilityScore * 0.45;

  const yearsFactor = Math.min(input.yearsActive / 10, 1) * 20;
  score += yearsFactor;
  if (input.yearsActive >= 3) {
    reasons.push("Business has stable operating history");
  }

  const turnoverFit = input.turnoverRatio <= 0 ? 0 : Math.max(0, 1 - Math.max(input.turnoverRatio - 0.6, 0));
  score += turnoverFit * 20;
  if (input.turnoverRatio <= 0.6 && input.turnoverRatio > 0) {
    reasons.push("Requested amount is within a healthy turnover ratio");
  }

  if (input.collateralAvailable) {
    score += 8;
    reasons.push("Collateral support increases underwriting confidence");
  }

  score += (input.documentReadiness / 100) * 12;
  if (input.documentReadiness >= 80) {
    reasons.push("Key bank documents are already available");
  } else if (input.documentReadiness >= 50) {
    reasons.push("Some bank-preferred documents are already available");
  }

  const bounded = Math.max(0, Math.min(100, Number(score.toFixed(2))));
  return { probability: bounded, reasons };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function blendApprovalProbabilities(input: ProbabilityBlendInput): ProbabilityBlendResult {
  const ruleBased = clampPercent(Number(input.ruleBasedProbability) || 0);
  const hasModelProbability =
    input.modelProbability !== null &&
    input.modelProbability !== undefined;
  const rawModel = hasModelProbability ? Number(input.modelProbability) : Number.NaN;
  const model = hasModelProbability && Number.isFinite(rawModel) ? clampPercent(rawModel) : null;

  if (model === null) {
    return {
      probability: Number(ruleBased.toFixed(2)),
      strategy: "rule_based_only",
      modelWeight: 0,
      divergence: null,
    };
  }

  const divergence = Math.abs(model - ruleBased);
  const modelWeight =
    divergence >= 60 ? 0.2 :
    divergence >= 40 ? 0.35 :
    divergence >= 20 ? 0.5 :
    0.65;

  let probability = model * modelWeight + ruleBased * (1 - modelWeight);

  const rawPrevious = Number(input.previousProbability);
  const previous = Number.isFinite(rawPrevious) && rawPrevious > 0 ? clampPercent(rawPrevious) : null;
  if (previous !== null) {
    const previousWeight = divergence >= 40 ? 0.1 : 0.15;
    probability = probability * (1 - previousWeight) + previous * previousWeight;
  }

  return {
    probability: Number(clampPercent(probability).toFixed(2)),
    strategy: "ml_blended",
    modelWeight,
    divergence: Number(divergence.toFixed(2)),
  };
}

function normalizeInverse(values: number[], target: number): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 100;
  return ((max - target) / (max - min)) * 100;
}

export function rankRecommendations(
  items: Array<
    Omit<RecommendationItem, "rankingScore" | "rankPosition"> & {
      totalPayable: number;
      emi: number;
      approvalProbability: number;
      eligibilityScore: number;
    }
  >,
): RecommendationItem[] {
  if (items.length === 0) {
    return [];
  }

  const costs = items.map((item) => item.totalPayable);
  const emis = items.map((item) => item.emi);

  const scored = items.map((item) => {
    const normalizedCost = normalizeInverse(costs, item.totalPayable);
    const normalizedEmi = normalizeInverse(emis, item.emi);

    const rankingScore =
      item.eligibilityScore * WEIGHTS.eligibility +
      normalizedCost * WEIGHTS.totalCost +
      normalizedEmi * WEIGHTS.emi +
      item.approvalProbability * WEIGHTS.probability;

    return {
      ...item,
      rankingScore: Number(rankingScore.toFixed(2)),
      rankPosition: 0,
    };
  });

  return scored
    .sort((left, right) => right.rankingScore - left.rankingScore)
    .map((item, index) => ({
      ...item,
      rankPosition: index + 1,
    }));
}
