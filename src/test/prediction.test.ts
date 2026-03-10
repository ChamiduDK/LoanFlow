import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  maybeSingleMock,
  buildFeatureSampleForApplicationMock,
  loadTfjsModelMock,
  loadPreprocessingMetadataMock,
  generateFaithfulExplanationsMock,
} = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  buildFeatureSampleForApplicationMock: vi.fn(),
  loadTfjsModelMock: vi.fn(),
  loadPreprocessingMetadataMock: vi.fn(),
  generateFaithfulExplanationsMock: vi.fn(),
}));

vi.mock("../../server/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== "ml_models") {
        throw new Error(`Unexpected table ${table}`);
      }

      const builder: Record<string, any> = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: maybeSingleMock,
      };

      return builder;
    }),
  },
}));

vi.mock("../../server/services/ml/data-prep.service", () => ({
  buildFeatureSampleForApplication: buildFeatureSampleForApplicationMock,
}));

vi.mock("../../server/services/ml/storage.service", () => ({
  loadTfjsModel: loadTfjsModelMock,
  loadPreprocessingMetadata: loadPreprocessingMetadataMock,
}));

vi.mock("../../server/services/ml/explanation.service", () => ({
  generateFaithfulExplanations: generateFaithfulExplanationsMock,
}));

describe("predictApprovalProbability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ML_ALLOW_SYNTHETIC_BOOTSTRAP = "false";

    buildFeatureSampleForApplicationMock.mockResolvedValue({
      sample_key: "sample-1",
      application_id: "app-1",
      product_id: "prod-1",
      outcome_status: null,
      label: null,
      fallback_rule_probability: 61.5,
      features: {
        requested_amount: 500000,
        preferred_tenure_months: 24,
        years_active: 5,
        annual_turnover: 1800000,
        amount_turnover_ratio: 0.277778,
        eligibility_score: 78,
        bank_match_score: 78,
        document_completeness_score: 85,
        document_quality_score: 85,
        missing_docs_count: 1,
        invalid_docs_count: 0,
        unclear_docs_count: 0,
        rate_min: 10,
        rate_max: 14,
        product_min_amount: 100000,
        product_max_amount: 2000000,
        product_tenure_min: 12,
        product_tenure_max: 36,
        collateral_available: 1,
        product_collateral_required: 0,
        business_type: "sole_proprietorship",
        industry: "retail",
        turnover_band: "1m_to_5m",
        district: "colombo",
        purpose: "working_capital",
        collateral_type: "property",
        bank_id: "bank-1",
        product_id: "prod-1",
      },
    });
  });

  it("falls back when the active model is undertrained", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "model-1",
        version: "tabular_mlp_20260307_234221",
        model_file_path: "ml-artifacts/models/model.json",
        preprocessing_file_path: "ml-artifacts/models/preprocessing.json",
        trained_sample_count: 31,
        metrics_json: {
          support: {
            total: 6,
            positive: 3,
            negative: 3,
          },
        },
        is_active: true,
      },
      error: null,
    });

    const { predictApprovalProbability } = await import("../../server/services/ml/prediction.service");
    const result = await predictApprovalProbability({
      applicationId: "app-1",
      viewerUserId: "user-1",
      productId: "prod-1",
    });

    expect(result.fallback_mode).toBe(true);
    expect(result.source).toBe("rule_based_fallback");
    expect(result.probability_percent).toBe(61.5);
    expect(result.model).toEqual({
      id: null,
      version: null,
    });
    expect(result.explainability.reasons[0]).toContain("not production-ready");
    expect(result.explainability.reasons[0]).toContain("31 labeled samples");
    expect(result.explainability.reasons[0]).toContain("6 validation cases");
    expect(loadTfjsModelMock).not.toHaveBeenCalled();
    expect(loadPreprocessingMetadataMock).not.toHaveBeenCalled();
    expect(generateFaithfulExplanationsMock).not.toHaveBeenCalled();
  });

  it("falls back when a bootstrap-trained model is loaded with bootstrap mode disabled", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "model-2",
        version: "tabular_mlp_20260308_010101",
        model_file_path: "ml-artifacts/models/model.json",
        preprocessing_file_path: "ml-artifacts/models/preprocessing.json",
        trained_sample_count: 80,
        metrics_json: {
          support: {
            total: 16,
            positive: 8,
            negative: 8,
          },
        },
        training_meta_json: {
          dataset_mode: "bootstrap_with_synthetic",
          usable_synthetic_sample_count: 80,
        },
        is_active: true,
      },
      error: null,
    });

    const { predictApprovalProbability } = await import("../../server/services/ml/prediction.service");
    const result = await predictApprovalProbability({
      applicationId: "app-1",
      viewerUserId: "user-1",
      productId: "prod-1",
    });

    expect(result.fallback_mode).toBe(true);
    expect(result.source).toBe("rule_based_fallback");
    expect(result.explainability.reasons[0]).toContain("synthetic bootstrap samples");
    expect(loadTfjsModelMock).not.toHaveBeenCalled();
    expect(loadPreprocessingMetadataMock).not.toHaveBeenCalled();
    expect(generateFaithfulExplanationsMock).not.toHaveBeenCalled();
  });
});
