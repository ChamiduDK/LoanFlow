import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminML from "@/pages/admin/AdminML";
import type { MlModel, MlTrainingReadiness } from "@/types/ml";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

describe("AdminML page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    root = createRoot(container);

    if (!("ResizeObserver" in window)) {
      Object.defineProperty(window, "ResizeObserver", {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      });
    }
  });

  afterEach(() => {
    root.unmount();
  });

  it("renders readiness and model data without crashing", async () => {
    const models: MlModel[] = [
      {
        id: "3a01f1f8-9817-411d-a78e-21d906157169",
        version: "tabular_mlp_20260308_181153",
        model_type: "tabular_mlp",
        framework: "tfjs",
        model_file_path: "ml-artifacts/models/tabular_mlp_20260308_181153/model.json",
        preprocessing_file_path: "ml-artifacts/models/tabular_mlp_20260308_181153/preprocessing.json",
        metrics_json: {
          accuracy: 1,
          precision: 1,
          recall: 1,
          f1: 1,
          roc_auc: 1,
          pr_auc: 1,
          threshold: 0.5,
          support: {
            total: 10,
            positive: 5,
            negative: 5,
          },
        },
        training_meta_json: {
          epochs_requested: 120,
          epochs_completed: 120,
          batch_size: 32,
          validation_split: 0.2,
          input_size: 56,
          dataset_mode: "bootstrap_with_synthetic",
          synthetic_bootstrap_enabled: true,
          consented_real_outcome_count: 0,
          usable_training_sample_count: 50,
          usable_real_sample_count: 0,
          usable_synthetic_sample_count: 50,
          usable_approved_sample_count: 25,
          usable_rejected_sample_count: 25,
        },
        trained_sample_count: 50,
        is_active: true,
        trained_at: "2026-03-08T18:11:53.000Z",
        activated_at: "2026-03-08T18:12:05.196Z",
        created_at: "2026-03-08T18:11:53.000Z",
        updated_at: "2026-03-08T18:12:05.196Z",
      },
    ];

    const readiness: MlTrainingReadiness = {
      training_mode: {
        code: "bootstrap_with_synthetic",
        include_synthetic_bootstrap: true,
        sample_label: "Training Samples",
        description: "Local/demo training can use consented real outcomes plus synthetic bootstrap rows. Production still needs consented real outcomes.",
      },
      requirements: {
        min_total_samples: 50,
        min_samples_per_class: 15,
        recommended_total_samples: 100,
        min_validation_support: 10,
        min_validation_samples_per_class: 3,
      },
      dataset: {
        finalized_outcomes_total: 51,
        finalized_approved_count: 26,
        finalized_rejected_count: 25,
        consented_real_outcomes: 0,
        usable_training_samples: 50,
        usable_approved_samples: 25,
        usable_rejected_samples: 25,
        usable_real_training_samples: 0,
        usable_real_approved_samples: 0,
        usable_real_rejected_samples: 0,
        usable_synthetic_training_samples: 50,
        usable_synthetic_approved_samples: 25,
        usable_synthetic_rejected_samples: 25,
        non_consented_outcomes_excluded: 1,
        synthetic_outcomes_included: 50,
        synthetic_outcomes_excluded: 0,
        unusable_eligible_outcomes: 0,
        unusable_real_outcomes: 0,
        unusable_synthetic_outcomes: 0,
      },
      ready_for_training: true,
      remaining: {
        total_samples: 0,
        approved_samples: 0,
        rejected_samples: 0,
        recommended_total_samples: 50,
      },
      summary: [
        "Training pool is ready with 50 usable samples (0 real + 50 synthetic).",
        "25 approved and 25 rejected samples are usable.",
      ],
    };

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
        mutations: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData(["ml-models"], models);
    queryClient.setQueryData(["ml-readiness"], readiness);
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/ml/models") {
        return models;
      }

      if (path === "/api/ml/readiness") {
        return readiness;
      }

      throw new Error(`Unexpected path ${path}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/admin/ml"]}>
            <AdminML />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("ML Intelligence");
    expect(container.textContent).toContain("Tabular MLP (03/08 18:11)");
    expect(container.textContent).not.toContain("tabular_mlp_20260308_181153");
    expect(container.textContent).toContain("Train MLP Comparator");
    expect(container.textContent).toContain("Research comparator; future extension after dataset grows");
    expect(container.textContent).not.toContain("Model Comparison And Role Allocation");
    expect(container.textContent).not.toContain("Chosen Role In LoanFlow");
    expect(container.textContent).not.toContain("XGBoost");
    expect(container.textContent).not.toContain("Training Readiness");
    expect(container.textContent).not.toContain("Usable synthetic rows: 50");
  });

  it("falls back safely when the readiness payload has no training_mode", async () => {
    const models: MlModel[] = [];
    const legacyReadiness = {
      requirements: {
        min_total_samples: 50,
        min_samples_per_class: 15,
        recommended_total_samples: 100,
        min_validation_support: 10,
        min_validation_samples_per_class: 3,
      },
      dataset: {
        finalized_outcomes_total: 31,
        finalized_approved_count: 16,
        finalized_rejected_count: 15,
        consented_real_outcomes: 0,
        usable_training_samples: 0,
        usable_approved_samples: 0,
        usable_rejected_samples: 0,
        usable_real_training_samples: 0,
        usable_real_approved_samples: 0,
        usable_real_rejected_samples: 0,
        usable_synthetic_training_samples: 0,
        usable_synthetic_approved_samples: 0,
        usable_synthetic_rejected_samples: 0,
        non_consented_outcomes_excluded: 1,
        synthetic_outcomes_included: 0,
        synthetic_outcomes_excluded: 30,
        unusable_eligible_outcomes: 0,
        unusable_real_outcomes: 0,
        unusable_synthetic_outcomes: 0,
      },
      ready_for_training: false,
      remaining: {
        total_samples: 50,
        approved_samples: 15,
        rejected_samples: 15,
        recommended_total_samples: 100,
      },
      summary: [
        "Usable consented real samples: 0 (0 approved / 0 rejected).",
      ],
    } as MlTrainingReadiness;

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
        mutations: {
          retry: false,
        },
      },
    });
    queryClient.setQueryData(["ml-models"], models);
    queryClient.setQueryData(["ml-readiness"], legacyReadiness);
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/ml/models") {
        return models;
      }

      if (path === "/api/ml/readiness") {
        return legacyReadiness;
      }

      throw new Error(`Unexpected path ${path}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/admin/ml"]}>
            <AdminML />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Train MLP Comparator");
    expect(container.textContent).not.toContain("Model Comparison And Role Allocation");
    expect(container.textContent).not.toContain("Need 50 More Real Samples");
    expect(container.textContent).not.toContain("Excluded synthetic rows: 30");
  });
});
