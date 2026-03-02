import { describe, expect, it, vi, beforeEach } from "vitest";
import * as tf from "@tensorflow/tfjs";
import { generateFaithfulExplanations } from "../../server/services/ml/explanation.service";
import { MlFeatureSample, MlPreprocessingMetadata } from "../../server/services/ml/types";

describe("generateFaithfulExplanations", () => {
  const mockModel = {
    predict: vi.fn(),
    apply: vi.fn(),
    dispose: vi.fn(),
  } as unknown as tf.LayersModel;

  beforeEach(async () => {
    await tf.setBackend("cpu");
    vi.clearAllMocks();
  });

  const mockPreprocessing: MlPreprocessingMetadata = {
    schema_version: 1,
    numeric_stats: {
      requested_amount: { mean: 500000, std: 100000 },
      preferred_tenure_months: { mean: 24, std: 12 },
      years_active: { mean: 5, std: 2 },
      annual_turnover: { mean: 1000000, std: 200000 },
      amount_turnover_ratio: { mean: 0.5, std: 0.1 },
      eligibility_score: { mean: 70, std: 10 },
      bank_match_score: { mean: 70, std: 10 },
      document_completeness_score: { mean: 80, std: 5 },
      document_quality_score: { mean: 80, std: 5 },
      collateral_available: { mean: 0.5, std: 0.5 },
      product_collateral_required: { mean: 0.5, std: 0.5 },
      missing_docs_count: { mean: 1, std: 1 },
      invalid_docs_count: { mean: 0, std: 1 },
      unclear_docs_count: { mean: 0, std: 1 },
      rate_min: { mean: 10, std: 2 },
      rate_max: { mean: 15, std: 2 },
      product_min_amount: { mean: 100000, std: 50000 },
      product_max_amount: { mean: 2000000, std: 500000 },
      product_tenure_min: { mean: 12, std: 6 },
      product_tenure_max: { mean: 60, std: 12 }
    } as any,
    categorical_vocabulary: {
      business_type: ["sole_proprietorship", "partnership"],
      industry: ["agriculture", "manufacturing"],
      turnover_band: ["low", "high"],
      district: ["colombo", "gampaha"],
      purpose: ["working_capital"],
      collateral_type: ["property"],
      bank_id: ["bank-1"],
      product_id: ["prod-1"]
    },
    numeric_feature_order: [
      "requested_amount", "preferred_tenure_months", "years_active", "annual_turnover", "amount_turnover_ratio",
      "eligibility_score", "bank_match_score", "document_completeness_score", "document_quality_score",
      "missing_docs_count", "invalid_docs_count", "unclear_docs_count", "rate_min", "rate_max",
      "product_min_amount", "product_max_amount", "product_tenure_min", "product_tenure_max",
      "collateral_available", "product_collateral_required"
    ],
    categorical_feature_order: ["business_type", "industry", "turnover_band", "district", "purpose", "collateral_type", "bank_id", "product_id"],
    input_size: 40,
    class_weights: { "0": 1, "1": 1 },
    fitted_at: new Date().toISOString()
  };

  const sample: MlFeatureSample = {
    sample_key: "test",
    application_id: "app-1",
    product_id: "prod-1",
    outcome_status: null,
    label: null,
    features: {
      requested_amount: 600000,
      preferred_tenure_months: 24,
      years_active: 5,
      annual_turnover: 1200000,
      amount_turnover_ratio: 0.5,
      eligibility_score: 85,
      bank_match_score: 90,
      document_completeness_score: 95,
      document_quality_score: 90,
      missing_docs_count: 0,
      invalid_docs_count: 0,
      unclear_docs_count: 0,
      rate_min: 10,
      rate_max: 15,
      product_min_amount: 100000,
      product_max_amount: 2000000,
      product_tenure_min: 12,
      product_tenure_max: 60,
      collateral_available: 1,
      product_collateral_required: 0,
      business_type: "sole_proprietorship",
      industry: "it_technology",
      turnover_band: "mid",
      district: "colombo",
      purpose: "working_capital",
      collateral_type: "none",
      bank_id: "bank-1",
      product_id: "prod-1"
    } as any,
    fallback_rule_probability: 0.8
  };

  it("identifies positive contributors correctly", async () => {
    const originalProb = 0.8;
    const reducedProb = 0.4;

    (mockModel.predict as any)
      .mockImplementationOnce(() => tf.tensor2d([[reducedProb]]))
      .mockImplementation(() => tf.tensor2d([[originalProb]]));

    const result = await generateFaithfulExplanations(sample, mockModel, mockPreprocessing, originalProb);

    expect(result.contributions.length).toBeGreaterThan(0);
    expect(result.contributions[0].impact).toBe("positive");
  });

  it("handles negative contributors", async () => {
    const originalProb = 0.5;
    const increasedProb = 0.8;

    (mockModel.predict as any)
      .mockImplementationOnce(() => tf.tensor2d([[increasedProb]]))
      .mockImplementation(() => tf.tensor2d([[originalProb]]));

    const result = await generateFaithfulExplanations(sample, mockModel, mockPreprocessing, originalProb);

    expect(result.contributions.length).toBeGreaterThan(0);
    expect(result.contributions[0].impact).toBe("negative");
  });
});
