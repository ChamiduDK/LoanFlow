import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentUpload from "@/pages/DocumentUpload";
import type {
  DocumentChecklistResponse,
  EvaluationResult,
  LoanApplication,
} from "@/types/backend";

const { apiFetchMock, apiUploadMock, toastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  apiUploadMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
  apiUpload: apiUploadMock,
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

describe("DocumentUpload page", () => {
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

  it("refreshes loan recommendations after saving availability for an evaluated application", async () => {
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

    const checklist: DocumentChecklistResponse = {
      summary: {
        overall_completeness: 100,
        total_required: 1,
        total_missing: 0,
      },
      by_scheme: [
        {
          product_id: "prod-1",
          product_name: "SME Booster",
          bank_id: "bank-1",
          bank_name: "Bank A",
          completeness_score: 100,
          checklist: [
            {
              document_type: "financial_statement",
              display_name: "Financial Statement",
              required: true,
              uploaded: false,
              is_available: true,
              has_uploaded_record: false,
            },
          ],
          missing_docs: [],
        },
      ],
      missing_docs: [],
    };

    const refreshedEvaluation: EvaluationResult = {
      ranked_results: [
        {
          productId: "prod-1",
          bankId: "bank-1",
          bankName: "Bank A",
          productName: "SME Booster",
          eligibilityPassed: true,
          eligibilityScore: 82,
          reasons: ["Meets core policy rules"],
          emi: 12000,
          totalInterest: 44000,
          totalPayable: 544000,
          estimatedRate: 12,
          approvalProbability: 74.25,
          docCompleteness: 100,
          rankingScore: 96.5,
          rankPosition: 1,
          whyRecommended: ["Document readiness improved the lender-specific probability estimate."],
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
      ineligible_results: [],
      docs_summary: {
        overall_completeness: 100,
        total_required: 1,
        total_missing: 0,
      },
      summary: {
        total_products: 1,
        eligible_products: 1,
        ineligible_products: 0,
      },
    };

    queryClient.setQueryData(["applications"], applications);
    queryClient.setQueryData(["documents", "app-1"], []);
    queryClient.setQueryData(["document-checklist", "app-1"], checklist);

    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/applications/app-1/documents/availability") {
        return { success: true };
      }

      if (path === "/api/applications/app-1/evaluate") {
        return refreshedEvaluation;
      }

      if (path === "/api/applications/app-1/documents/check") {
        return checklist;
      }

      throw new Error(`Unexpected path ${path}`);
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/documents?applicationId=app-1"]}>
            <DocumentUpload />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await flushUi();
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save Availability"),
    ) as HTMLButtonElement | undefined;

    expect(saveButton).toBeDefined();
    expect(saveButton?.disabled).toBe(false);

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushUi();
      await flushUi();
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/applications/app-1/evaluate",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(queryClient.getQueryData(["application-evaluation", "app-1"])).toEqual(refreshedEvaluation);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Document availability saved",
        description: "Loan recommendations were refreshed with your latest document readiness.",
      }),
    );
  });
});
