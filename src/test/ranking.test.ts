import { describe, expect, it } from "vitest";
import { blendApprovalProbabilities } from "../../server/services/ranking.service";

describe("blendApprovalProbabilities", () => {
  it("falls back to the rule-based score when no ML prediction exists", () => {
    const result = blendApprovalProbabilities({
      modelProbability: null,
      ruleBasedProbability: 64.5,
    });

    expect(result).toEqual({
      probability: 64.5,
      strategy: "rule_based_only",
      modelWeight: 0,
      divergence: null,
    });
  });

  it("moderates extreme ML outputs with the rule-based score", () => {
    const result = blendApprovalProbabilities({
      modelProbability: 0,
      ruleBasedProbability: 88,
    });

    expect(result.strategy).toBe("ml_blended");
    expect(result.divergence).toBe(88);
    expect(result.modelWeight).toBe(0.2);
    expect(result.probability).toBe(70.4);
  });

  it("ignores stale zero previous probabilities when calibrating", () => {
    const withoutPrevious = blendApprovalProbabilities({
      modelProbability: 0,
      ruleBasedProbability: 88,
    });

    const withZeroPrevious = blendApprovalProbabilities({
      modelProbability: 0,
      ruleBasedProbability: 88,
      previousProbability: 0,
    });

    expect(withZeroPrevious.probability).toBe(withoutPrevious.probability);
  });
});
