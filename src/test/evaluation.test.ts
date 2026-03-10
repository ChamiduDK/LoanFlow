import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  tableQueues,
  checkDocumentCompletenessMock,
  calculateEmiMock,
  evaluateEligibilityMock,
  logAuditMock,
  calculateApprovalProbabilityMock,
  rankRecommendationsMock,
  predictApprovalProbabilityMock,
} = vi.hoisted(() => ({
  tableQueues: new Map<string, Array<Record<string, any>>>(),
  checkDocumentCompletenessMock: vi.fn(),
  calculateEmiMock: vi.fn(),
  evaluateEligibilityMock: vi.fn(),
  logAuditMock: vi.fn(),
  calculateApprovalProbabilityMock: vi.fn(),
  rankRecommendationsMock: vi.fn(),
  predictApprovalProbabilityMock: vi.fn(),
}));

function createBuilder(config: {
  result?: Record<string, unknown>;
  maybeSingleResult?: Record<string, unknown>;
  singleResult?: Record<string, unknown>;
}) {
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingleResult ?? config.result ?? { data: null, error: null })),
    single: vi.fn(() => Promise.resolve(config.singleResult ?? config.result ?? { data: null, error: null })),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(config.result ?? { data: null, error: null }).then(onFulfilled, onRejected),
  };

  return builder;
}

function queueTable(table: string, ...builders: Array<Record<string, any>>) {
  tableQueues.set(table, [...builders]);
}

vi.mock("../../server/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const queue = tableQueues.get(table);
      if (!queue || queue.length === 0) {
        throw new Error(`No queued builder for table ${table}`);
      }
      return queue.shift();
    }),
  },
}));

vi.mock("../../server/services/document.service", () => ({
  checkDocumentCompleteness: checkDocumentCompletenessMock,
}));

vi.mock("../../server/services/emi.service", () => ({
  calculateEmi: calculateEmiMock,
}));

vi.mock("../../server/services/eligibility.service", () => ({
  evaluateEligibility: evaluateEligibilityMock,
}));

vi.mock("../../server/services/audit.service", () => ({
  logAudit: logAuditMock,
}));

vi.mock("../../server/services/ranking.service", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/ranking.service")>(
    "../../server/services/ranking.service"
  );

  return {
    ...actual,
    calculateApprovalProbability: calculateApprovalProbabilityMock,
    rankRecommendations: rankRecommendationsMock,
  };
});

vi.mock("../../server/services/ml/prediction.service", () => ({
  predictApprovalProbability: predictApprovalProbabilityMock,
}));

import { evaluateApplicationRecommendations, getStoredEvaluationResults } from "../../server/services/evaluation.service";

describe("evaluation.service", () => {
  beforeEach(() => {
    tableQueues.clear();
    vi.clearAllMocks();

    calculateEmiMock.mockReturnValue({
      monthlyEmi: 12000,
      totalInterest: 44000,
      totalPayable: 544000,
    });

    evaluateEligibilityMock.mockReturnValue({
      passed: true,
      score: 78,
      reasons: ["Meets core policy rules"],
      matched_rules: [],
      failed_rules: [],
    });

    calculateApprovalProbabilityMock.mockReturnValue({
      probability: 61.5,
      reasons: ["Rule engine marked the profile as reasonably strong"],
    });

    rankRecommendationsMock.mockImplementation((items: Array<Record<string, any>>) =>
      items.map((item, index) => ({
        ...item,
        rankingScore: 96 - index,
        rankPosition: index + 1,
      })),
    );

    checkDocumentCompletenessMock.mockResolvedValue({
      summary: {
        overall_completeness: 85,
        total_required: 4,
        total_missing: 1,
      },
      by_scheme: [
        {
          product_id: "prod-1",
          completeness_score: 85,
          missing_docs: ["tax_return"],
        },
      ],
    });

    logAuditMock.mockResolvedValue(undefined);
  });

  it("uses ML prediction probabilities for loan recommendations when the model is available", async () => {
    const applicationResultsDeleteBuilder = createBuilder({
      result: { error: null },
    });
    const applicationResultsInsertBuilder = createBuilder({
      result: { error: null },
    });

    queueTable(
      "loan_applications",
      createBuilder({
        maybeSingleResult: {
          data: {
            id: "app-1",
            user_id: "user-1",
            requested_amount: 500000,
            preferred_tenure_months: 24,
            collateral_available: true,
          },
          error: null,
        },
      }),
      createBuilder({
        result: { error: null },
      }),
    );
    queueTable(
      "profiles",
      createBuilder({
        maybeSingleResult: {
          data: {
            id: "user-1",
            years_active: 6,
            annual_turnover: 1800000,
          },
          error: null,
        },
      }),
    );
    queueTable(
      "loan_products",
      createBuilder({
        result: {
          data: [
            {
              id: "prod-1",
              bank_id: "bank-1",
              name: "SME Booster",
              min_amount: 100000,
              max_amount: 2000000,
              rate_min: 10,
              rate_max: 14,
              tenure_min_months: 12,
              tenure_max_months: 36,
              banks: { name: "Bank A" },
            },
          ],
          error: null,
        },
      }),
    );
    queueTable(
      "eligibility_rules",
      createBuilder({
        result: {
          data: [{ product_id: "prod-1", rules_json: {} }],
          error: null,
        },
      }),
    );
    queueTable("application_results", applicationResultsDeleteBuilder, applicationResultsInsertBuilder);

    predictApprovalProbabilityMock.mockResolvedValue({
      probability: 0.842,
      probability_percent: 84.2,
      fallback_mode: false,
      source: "ml_model",
      model: {
        id: "model-1",
        version: "tabular_mlp_20260307_234221",
      },
      confidence: {
        score: 0.82,
        level: "high",
      },
      explainability: {
        reasons: ["Strong bank fit", "Document profile is strong"],
        contributions: [],
      },
      feature_sample: {
        sample_key: "sample-1",
        application_id: "app-1",
        product_id: "prod-1",
        outcome_status: null,
        label: null,
        features: {} as any,
        fallback_rule_probability: 61.5,
      },
    });

    const result = await evaluateApplicationRecommendations("user-1", "app-1", "127.0.0.1");

    expect(predictApprovalProbabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        viewerUserId: "user-1",
        productId: "prod-1",
        fallbackProbabilityOverride: 61.5,
        featureOverrides: expect.objectContaining({
          eligibility_score: 78,
          bank_match_score: 78,
          document_completeness_score: 85,
          missing_docs_count: 1,
        }),
      }),
    );

    expect(result.ranked_results).toHaveLength(1);
    expect(result.ranked_results[0]).toEqual(
      expect.objectContaining({
        approvalProbability: 72.85,
        prediction: expect.objectContaining({
          source: "ml_model",
          model_version: "tabular_mlp_20260307_234221",
          rule_based_probability: 61.5,
          ml_probability: 84.2,
        }),
      }),
    );
    expect(result.ranked_results[0].whyRecommended).toContain("Calibrated approval probability 72.8%");
    expect(result.ranked_results[0].reasons).toEqual(
      expect.arrayContaining(["Strong bank fit", "Document profile is strong"]),
    );

    expect(applicationResultsInsertBuilder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          application_id: "app-1",
          product_id: "prod-1",
          approval_probability: 72.85,
          initial_probability: 72.85,
          result_payload: expect.objectContaining({
            prediction: expect.objectContaining({
              source: "ml_model",
              rule_based_probability: 61.5,
              ml_probability: 84.2,
            }),
          }),
        }),
      ]),
    );
  });

  it("falls back to the rule-based score when ML prediction fails", async () => {
    const applicationResultsInsertBuilder = createBuilder({
      result: { error: null },
    });

    queueTable(
      "loan_applications",
      createBuilder({
        maybeSingleResult: {
          data: {
            id: "app-2",
            user_id: "user-1",
            requested_amount: 500000,
            preferred_tenure_months: 24,
            collateral_available: false,
          },
          error: null,
        },
      }),
      createBuilder({
        result: { error: null },
      }),
    );
    queueTable(
      "profiles",
      createBuilder({
        maybeSingleResult: {
          data: {
            id: "user-1",
            years_active: 2,
            annual_turnover: 1200000,
          },
          error: null,
        },
      }),
    );
    queueTable(
      "loan_products",
      createBuilder({
        result: {
          data: [
            {
              id: "prod-1",
              bank_id: "bank-1",
              name: "SME Booster",
              min_amount: 100000,
              max_amount: 2000000,
              rate_min: 10,
              rate_max: 14,
              tenure_min_months: 12,
              tenure_max_months: 36,
              banks: { name: "Bank A" },
            },
          ],
          error: null,
        },
      }),
    );
    queueTable(
      "eligibility_rules",
      createBuilder({
        result: {
          data: [{ product_id: "prod-1", rules_json: {} }],
          error: null,
        },
      }),
    );
    queueTable(
      "application_results",
      createBuilder({
        result: { error: null },
      }),
      applicationResultsInsertBuilder,
    );

    predictApprovalProbabilityMock.mockRejectedValue(new Error("prediction unavailable"));

    const result = await evaluateApplicationRecommendations("user-1", "app-2");

    expect(result.ranked_results[0]).toEqual(
      expect.objectContaining({
        approvalProbability: 61.5,
        prediction: expect.objectContaining({
          source: "rule_based_fallback",
          fallback_mode: true,
          rule_based_probability: 61.5,
          ml_probability: null,
        }),
      }),
    );
    expect(result.ranked_results[0].whyRecommended).toContain("Fallback approval probability 61.5%");
    expect(result.ranked_results[0].reasons).toContain(
      "ML prediction is unavailable for this scheme, so the rule-based estimate was used.",
    );

    expect(applicationResultsInsertBuilder.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          approval_probability: 61.5,
          result_payload: expect.objectContaining({
            prediction: expect.objectContaining({
              source: "rule_based_fallback",
              ml_probability: null,
            }),
          }),
        }),
      ]),
    );
  });

  it("returns stored prediction metadata with saved evaluation results", async () => {
    queueTable(
      "loan_applications",
      createBuilder({
        maybeSingleResult: {
          data: {
            id: "app-3",
            user_id: "user-1",
            requested_amount: 500000,
            preferred_tenure_months: 24,
            collateral_available: true,
          },
          error: null,
        },
      }),
    );
    queueTable(
      "application_results",
      createBuilder({
        result: {
          data: [
            {
              application_id: "app-3",
              product_id: "prod-1",
              bank_id: "bank-1",
              eligibility_passed: true,
              eligibility_score: 82,
              reasons_json: ["Strong financial profile"],
              emi: 12000,
              total_interest: 44000,
              total_payable: 544000,
              estimated_rate: 12,
              approval_probability: 61.5,
              initial_probability: 72.85,
              document_completeness: 85,
              ranking_score: 96,
              rank_position: 1,
              result_payload: {
                whyRecommended: ["Calibrated approval probability 72.8%"],
                prediction: {
                  source: "ml_model",
                  fallback_mode: false,
                  model_id: "model-1",
                  model_version: "tabular_mlp_20260307_234221",
                  confidence: {
                    score: 0.77,
                    level: "medium",
                  },
                  rule_based_probability: 61.5,
                  ml_probability: 84.2,
                },
              },
              loan_products: { name: "SME Booster" },
              banks: { name: "Bank A" },
            },
          ],
          error: null,
        },
      }),
    );
    queueTable(
      "document_checks",
      createBuilder({
        result: {
          data: [
            {
              checklist_json: [
                { required: true, is_available: true },
                { required: true, is_available: false },
              ],
              completeness_score: 50,
            },
          ],
          error: null,
        },
      }),
    );

    const result = await getStoredEvaluationResults("user-1", "app-3");

    expect(result.ranked_results[0]).toEqual(
      expect.objectContaining({
        approvalProbability: 72.85,
        prediction: expect.objectContaining({
          source: "ml_model",
          model_id: "model-1",
          model_version: "tabular_mlp_20260307_234221",
          confidence: {
            score: 0.77,
            level: "medium",
          },
          rule_based_probability: 61.5,
          ml_probability: 84.2,
        }),
      }),
    );
    expect(result.docs_summary).toEqual({
      overall_completeness: 50,
      total_required: 2,
      total_missing: 1,
    });
  });
});
