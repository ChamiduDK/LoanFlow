import { beforeEach, describe, expect, it, vi } from "vitest";

const { summarizeTrainingDatasetMock, persistTrainingSamplesMock } = vi.hoisted(() => ({
  summarizeTrainingDatasetMock: vi.fn(),
  persistTrainingSamplesMock: vi.fn(),
}));

vi.mock("../../server/services/ml/data-prep.service", () => ({
  summarizeTrainingDataset: summarizeTrainingDatasetMock,
  persistTrainingSamples: persistTrainingSamplesMock,
}));

vi.mock("../../server/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("../../server/services/audit.service", () => ({
  logAudit: vi.fn(),
}));

describe("ml training readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ML_ALLOW_SYNTHETIC_BOOTSTRAP = "false";
  });

  it("reports how many more consented real samples are needed", async () => {
    summarizeTrainingDatasetMock.mockResolvedValue({
      finalized_outcomes_total: 31,
      finalized_approved_count: 16,
      finalized_rejected_count: 15,
      consented_real_outcomes: 30,
      non_consented_outcomes_excluded: 1,
      synthetic_outcomes_included: 0,
      synthetic_outcomes_excluded: 0,
      unusable_eligible_outcomes: 0,
      unusable_real_outcomes: 0,
      unusable_synthetic_outcomes: 0,
      usable_training_samples: 31,
      usable_approved_samples: 16,
      usable_rejected_samples: 15,
      usable_real_training_samples: 31,
      usable_real_approved_samples: 16,
      usable_real_rejected_samples: 15,
      usable_synthetic_training_samples: 0,
      usable_synthetic_approved_samples: 0,
      usable_synthetic_rejected_samples: 0,
      samples: [],
    });

    const { getMlTrainingReadiness } = await import("../../server/services/ml/training.service");
    const readiness = await getMlTrainingReadiness();

    expect(readiness.ready_for_training).toBe(false);
    expect(readiness.remaining).toEqual({
      total_samples: 19,
      approved_samples: 0,
      rejected_samples: 0,
      recommended_total_samples: 69,
    });
    expect(readiness.summary[0]).toContain("31");
    expect(readiness.summary[2]).toContain("training consent is off");
  });

  it("can treat synthetic bootstrap rows as the local training pool", async () => {
    process.env.ML_ALLOW_SYNTHETIC_BOOTSTRAP = "true";

    summarizeTrainingDatasetMock.mockResolvedValue({
      finalized_outcomes_total: 50,
      finalized_approved_count: 25,
      finalized_rejected_count: 25,
      consented_real_outcomes: 0,
      non_consented_outcomes_excluded: 0,
      synthetic_outcomes_included: 50,
      synthetic_outcomes_excluded: 0,
      unusable_eligible_outcomes: 0,
      unusable_real_outcomes: 0,
      unusable_synthetic_outcomes: 0,
      usable_training_samples: 50,
      usable_approved_samples: 25,
      usable_rejected_samples: 25,
      usable_real_training_samples: 0,
      usable_real_approved_samples: 0,
      usable_real_rejected_samples: 0,
      usable_synthetic_training_samples: 50,
      usable_synthetic_approved_samples: 25,
      usable_synthetic_rejected_samples: 25,
      samples: [],
    });

    const { getMlTrainingReadiness } = await import("../../server/services/ml/training.service");
    const readiness = await getMlTrainingReadiness();

    expect(readiness.ready_for_training).toBe(true);
    expect(readiness.training_mode.code).toBe("bootstrap_with_synthetic");
    expect(readiness.dataset.usable_synthetic_training_samples).toBe(50);
    expect(readiness.summary[0]).toContain("50 usable samples");
    expect(readiness.summary[2]).toContain("local/demo ML training");
  });

  it("blocks training until enough consented real samples exist", async () => {
    summarizeTrainingDatasetMock.mockResolvedValue({
      finalized_outcomes_total: 31,
      finalized_approved_count: 16,
      finalized_rejected_count: 15,
      consented_real_outcomes: 30,
      non_consented_outcomes_excluded: 1,
      synthetic_outcomes_included: 0,
      synthetic_outcomes_excluded: 0,
      unusable_eligible_outcomes: 0,
      unusable_real_outcomes: 0,
      unusable_synthetic_outcomes: 0,
      usable_training_samples: 31,
      usable_approved_samples: 16,
      usable_rejected_samples: 15,
      usable_real_training_samples: 31,
      usable_real_approved_samples: 16,
      usable_real_rejected_samples: 15,
      usable_synthetic_training_samples: 0,
      usable_synthetic_approved_samples: 0,
      usable_synthetic_rejected_samples: 0,
      samples: Array.from({ length: 31 }, (_, index) => ({
        sample_key: `sample-${index + 1}`,
        application_id: `app-${index + 1}`,
        product_id: `prod-${index + 1}`,
        outcome_status: index % 2 === 0 ? "approved" : "rejected",
        label: index % 2 === 0 ? 1 : 0,
        features: {} as any,
        fallback_rule_probability: 60,
      })),
    });

    const { trainMlApprovalModel } = await import("../../server/services/ml/training.service");

    await expect(trainMlApprovalModel("admin-1", {}, "127.0.0.1")).rejects.toThrow(
      /Not enough consented real training samples/,
    );
    expect(persistTrainingSamplesMock).not.toHaveBeenCalled();
  });
});
