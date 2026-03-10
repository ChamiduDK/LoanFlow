import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoanResults from "@/pages/LoanResults";
import type { Bank, EvaluationResult, LoanApplication } from "@/types/backend";

const { apiFetchMock, toastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

function flushUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), 0);
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
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
}

describe("LoanResults page", () => {
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

  it("falls back to the first valid application instead of querying an invalid application id", async () => {
    const queryClient = createQueryClient();
    const applications: LoanApplication[] = [
      {
        id: "app-1",
        user_id: "user-1",
        requested_amount: 500000,
        purpose: "working_capital",
        preferred_tenure_months: 24,
        collateral_available: true,
        collateral_type: "property",
        status: "evaluated",
        selected_product_id: "prod-1",
        tracking_started_at: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
    ];
    const banks: Bank[] = [
      { id: "bank-1", name: "Bank A", code: "BKA", is_active: true },
    ];
    const evaluation: EvaluationResult = {
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

    queryClient.setQueryData(["applications"], applications);
    queryClient.setQueryData(["banks"], banks);

    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/applications") {
        return applications;
      }

      if (path === "/api/banks") {
        return banks;
      }

      if (path === "/api/applications/app-1/evaluation") {
        return evaluation;
      }

      throw new Error(`Unexpected path ${path}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/results?applicationId=missing"]}>
            <LoanResults />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await flushUi();
      await flushUi();
    });

    expect(apiFetchMock).not.toHaveBeenCalledWith("/api/applications/missing/evaluation");
    expect(apiFetchMock).toHaveBeenCalledWith("/api/applications/app-1/evaluation");
    expect(container.textContent).toContain("Loading lender recommendations...");
  });

  it("shows eligible and review-only lenders together with human-readable ML labels", async () => {
    const queryClient = createQueryClient();
    const applications: LoanApplication[] = [
      {
        id: "app-1",
        user_id: "user-1",
        requested_amount: 500000,
        purpose: "working_capital",
        preferred_tenure_months: 24,
        collateral_available: true,
        collateral_type: "property",
        status: "evaluated",
        selected_product_id: "prod-1",
        tracking_started_at: null,
        created_at: "2026-03-09T00:00:00.000Z",
        updated_at: "2026-03-09T00:00:00.000Z",
      },
    ];
    const banks: Bank[] = [
      { id: "bank-1", name: "Bank A", code: "BKA", is_active: true },
      { id: "bank-2", name: "Bank B", code: "BKB", is_active: true },
    ];
    const evaluation: EvaluationResult = {
      ranked_results: [
        {
          productId: "prod-1",
          bankId: "bank-1",
          bankName: "Bank A",
          productName: "SME Booster",
          eligibilityPassed: true,
          eligibilityScore: 84,
          reasons: ["Strong overall profile"],
          emi: 12000,
          totalInterest: 44000,
          totalPayable: 544000,
          estimatedRate: 12,
          approvalProbability: 74.25,
          docCompleteness: 100,
          rankingScore: 96.5,
          rankPosition: 1,
          whyRecommended: ["Best fit across bank match, repayment profile, and document readiness."],
          prediction: {
            source: "ml_model",
            fallback_mode: false,
            model_id: "model-1",
            model_version: "tabular_mlp_20260308_181153",
            confidence: {
              score: 0.78,
              level: "high",
            },
            rule_based_probability: 68,
            ml_probability: 79.5,
          },
        },
      ],
      ineligible_results: [
        {
          productId: "prod-2",
          bankId: "bank-2",
          bankName: "Bank B",
          productName: "Growth Plus",
          eligibilityPassed: false,
          eligibilityScore: 52,
          reasons: ["Requested amount exceeds the product limit."],
          emi: 13800,
          totalInterest: 58200,
          totalPayable: 558200,
          estimatedRate: 13.5,
          approvalProbability: 41.1,
          docCompleteness: 100,
          whyRecommended: [],
          prediction: {
            source: "ml_model",
            fallback_mode: false,
            model_id: "model-1",
            model_version: "tabular_mlp_20260308_181153",
            confidence: {
              score: 0.63,
              level: "medium",
            },
            rule_based_probability: 38,
            ml_probability: 44.2,
          },
        },
      ],
      docs_summary: {
        overall_completeness: 100,
        total_required: 3,
        total_missing: 0,
      },
      summary: {
        total_products: 2,
        eligible_products: 1,
        ineligible_products: 1,
      },
    };

    queryClient.setQueryData(["applications"], applications);
    queryClient.setQueryData(["banks"], banks);
    queryClient.setQueryData(["application-evaluation", "app-1"], evaluation);

    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/applications") {
        return applications;
      }

      if (path === "/api/banks") {
        return banks;
      }

      if (path === "/api/applications/app-1/evaluation") {
        return evaluation;
      }

      throw new Error(`Unexpected path ${path}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/results?applicationId=app-1"]}>
            <LoanResults />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await flushUi();
      await flushUi();
    });

    expect(container.textContent).toContain("Eligible Matches");
    expect(container.textContent).toContain("Needs Review");
    expect(container.textContent).toContain("Eligible matches");
    expect(container.textContent).toContain("Needs review");
    expect(container.textContent).toContain("Bank A");
    expect(container.textContent).toContain("Bank B");
    expect(container.textContent).toContain("Why each lender is shown");
    expect(container.textContent).toContain("Ranking score 96.50");
    expect(container.textContent).toContain("Tabular MLP 03/08 18:11 | high confidence");
    expect(container.textContent).not.toContain("tabular_mlp_20260308_181153");

    const progressIndicators = Array.from(container.querySelectorAll('[style*="translateX"]'));
    expect(progressIndicators.some((node) => node.getAttribute("style")?.includes("translateX(-3.5%)"))).toBe(true);
  });
});
