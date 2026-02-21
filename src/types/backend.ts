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
  tracking_started_at: string | null;
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
  detected_doc_type?: string | null;
  validation_status?: "valid" | "invalid" | "unclear";
  extracted_json?: Record<string, unknown>;
  ocr_preview?: string | null;
  created_at: string;
  signed_url: string | null;
};

export type TrackApplicationResponse = {
  application_id: string;
  selected_product_id: string;
  tracking_started_at: string;
  redirect_to: string;
  product: {
    id: string;
    name: string;
    bank_id: string;
    bank_name: string;
  };
};

export type TrackerReEvaluationResponse = {
  application_id: string;
  product: {
    id: string;
    name: string;
    bank_id: string;
    bank_name: string;
    estimated_rate: number;
    selected_tenure_months: number;
    estimated_emi: number;
  };
  eligibility: {
    passed: boolean;
    score: number;
    reasons: string[];
  };
  documents: {
    completeness_score: number;
    quality_score: number;
    required_count: number;
    missing_count: number;
    invalid_count: number;
    unclear_count: number;
    missing_docs: string[];
    validation_notes: Array<{
      document_type: string;
      display_name: string;
      note: string;
      status: "valid" | "invalid" | "unclear";
    }>;
  };
  scoring: {
    bank_match_score: number;
    document_completeness_score: number;
    document_quality_score: number;
    initial_probability: number;
    rule_based_final_probability?: number;
    model_probability?: number | null;
    final_probability: number;
  };
  prediction?: {
    source: "ml_model" | "rule_based_fallback";
    fallback_mode: boolean;
    model_id: string | null;
    model_version: string | null;
    confidence: {
      score: number;
      level: "low" | "medium" | "high";
    };
  };
  reasons: string[];
  evaluated_at: string;
};

export type DocumentScanResponse = {
  application_id: string;
  product_id: string | null;
  scanned_count: number;
  summary: {
    total_documents: number;
    valid_count: number;
    invalid_count: number;
    unclear_count: number;
    missing_required_count: number;
  };
  documents: Array<{
    document_id: string;
    document_type: string;
    file_name: string;
    detected_doc_type: string | null;
    validation_status: "valid" | "invalid" | "unclear";
    confidence_score: number;
    notes: string[];
    extracted_fields: Record<string, unknown>;
    ocr_preview: string | null;
    scanned: boolean;
  }>;
};

export type LoanProposal = {
  id: string;
  application_id: string;
  product_id: string;
  proposal_version: number;
  proposal_data_json: Record<string, unknown>;
  html_content: string | null;
  pdf_file_path: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalGenerateResponse = {
  proposal: LoanProposal;
  preview: {
    html_content: string;
    generated_at: string;
  };
};

export type LoanManagementAccessResponse = {
  application_id: string;
  status: "approved";
  unlocked: true;
  tracking_started_at: string | null;
  selected_product: {
    id: string;
    name: string;
    bank_id: string;
    bank_name: string;
  } | null;
  final_probability: number | null;
  tracker_summary: TrackerSummary;
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
