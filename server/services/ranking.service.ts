import type { RecommendationItem } from "../../types/domain";

type ProbabilityInput = {
  eligibilityScore: number;
  yearsActive: number;
  turnoverRatio: number;
  collateralAvailable: boolean;
  documentCompleteness: number;
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

  score += (input.documentCompleteness / 100) * 12;
  if (input.documentCompleteness >= 80) {
    reasons.push("Document checklist is mostly complete");
  }

  const bounded = Math.max(0, Math.min(100, Number(score.toFixed(2))));
  return { probability: bounded, reasons };
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
