export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "evaluated"
  | "applied"
  | "under_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type LoanApplication = {
  id: string;
  user_id: string;
  requested_amount: number;
  purpose: string;
  preferred_tenure_months: number;
  collateral_available: boolean;
  collateral_type: string | null;
  status: ApplicationStatus;
  selected_product_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TrackerInstallment = {
  id: string;
  dueDate: string;
  amount: number;
  status: "pending" | "paid" | "late";
  paidDate: string | null;
  notes: string | null;
};

export type TrackerSummary = {
  applicationId: string;
  status: ApplicationStatus | "applied" | "under_review" | "approved" | "rejected";
  loanSummary: {
    approvedAmount: number | null;
    approvedRate: number | null;
    approvedTenureMonths: number | null;
    emi: number | null;
  };
  nextDueDate: string | null;
  installmentHistory: TrackerInstallment[];
  progressPercent: number;
};

export type EvaluationResult = {
  ranked_results: Array<{
    productId: string;
    bankId: string;
    bankName: string;
    productName: string;
    eligibilityPassed: boolean;
    eligibilityScore: number;
    reasons: string[];
    emi: number;
    totalInterest: number;
    totalPayable: number;
    estimatedRate: number;
    approvalProbability: number;
    docCompleteness: number;
    rankingScore: number;
    rankPosition: number;
    whyRecommended: string[];
  }>;
  ineligible_results: Array<{
    productId: string;
    bankId: string;
    bankName: string;
    productName: string;
    eligibilityPassed: boolean;
    eligibilityScore: number;
    reasons: string[];
    emi: number;
    totalInterest: number;
    totalPayable: number;
    estimatedRate: number;
    approvalProbability: number;
    docCompleteness: number;
    whyRecommended: string[];
  }>;
  docs_summary: {
    overall_completeness: number;
    total_required: number;
    total_missing: number;
  };
  summary: {
    total_products: number;
    eligible_products: number;
    ineligible_products: number;
  };
};

export type DocumentRow = {
  id: string;
  document_type: string;
  file_name: string;
  status: string;
  created_at: string;
  signed_url: string | null;
};

export type DocumentChecklistResponse = {
  summary: {
    overall_completeness: number;
    total_required: number;
    total_missing: number;
  };
  by_scheme: Array<{
    product_id: string;
    product_name: string;
    bank_id: string;
    bank_name: string | null;
    completeness_score: number;
    checklist: Array<{
      document_type: string;
      display_name: string;
      required: boolean;
      uploaded: boolean;
    }>;
    missing_docs: string[];
  }>;
  missing_docs: string[];
};

export type LoanProduct = {
  id: string;
  bank_id: string;
  name: string;
  min_amount: number;
  max_amount: number;
  rate_min: number;
  rate_max: number;
  tenure_min_months: number;
  tenure_max_months: number;
  collateral_required: boolean;
  banks?: { name?: string } | { name?: string }[];
};

export type Bank = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};
