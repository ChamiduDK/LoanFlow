export type UUID = string;

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "evaluated"
  | "applied"
  | "under_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type OutcomeStatus = "applied" | "under_review" | "approved" | "rejected";

export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "verified"
  | "rejected"
  | "needs_review";

export type InstallmentStatus = "pending" | "paid" | "late";

export type ChannelType = "whatsapp" | "email" | "sms" | "web";

export type ChatSessionStatus = "active" | "closed" | "archived";

export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export type Profile = {
  id: UUID;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  district: string | null;
  business_name: string | null;
  business_type: string | null;
  industry: string | null;
  years_active: number | null;
  annual_turnover: number | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  existing_loan_obligations: number | null;
  turnover_band: string | null;
  is_admin: boolean;
  feature_access: {
    ai_chat: boolean;
    new_application: boolean;
    upload_documents: boolean;
    track_application: boolean;
    emi_calculator: boolean;
  };
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Bank = {
  id: UUID;
  name: string;
  code: string;
  website: string | null;
  contact_email: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LoanProduct = {
  id: UUID;
  bank_id: UUID;
  name: string;
  slug: string;
  description: string | null;
  purpose_category: string | null;
  min_amount: number;
  max_amount: number;
  rate_min: number;
  rate_max: number;
  tenure_min_months: number;
  tenure_max_months: number;
  collateral_required: boolean;
  processing_days_min: number | null;
  processing_days_max: number | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LoanApplication = {
  id: UUID;
  user_id: UUID;
  requested_amount: number;
  purpose: string;
  preferred_tenure_months: number;
  collateral_available: boolean;
  collateral_type: string | null;
  status: ApplicationStatus;
  profile_snapshot: Record<string, unknown> | null;
  business_context: Record<string, unknown> | null;
  selected_product_id: UUID | null;
  tracking_started_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibilityRulePayload = {
  min_years_active?: number;
  allowed_business_types?: string[];
  allowed_purposes?: string[];
  min_turnover?: number;
  allowed_turnover_bands?: string[];
  max_amount_ratio_turnover?: number;
  collateral_required?: boolean;
  min_monthly_income?: number;
  max_existing_obligations_ratio?: number;
};

export type ApplicationResult = {
  id: UUID;
  application_id: UUID;
  product_id: UUID;
  bank_id: UUID;
  eligibility_passed: boolean;
  eligibility_score: number;
  reasons_json: unknown;
  emi: number;
  total_interest: number;
  total_payable: number;
  estimated_rate: number;
  approval_probability: number;
  initial_probability: number | null;
  final_probability: number | null;
  document_completeness: number;
  ranking_score: number;
  rank_position: number | null;
  result_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type EligibilityEvaluation = {
  passed: boolean;
  score: number;
  reasons: string[];
  matched_rules: string[];
  failed_rules: string[];
};

export type EmiResult = {
  principal: number;
  annualRate: number;
  tenureMonths: number;
  monthlyEmi: number;
  totalInterest: number;
  totalPayable: number;
};

export type EmiRangeResult = {
  minRate: number;
  maxRate: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  minEmi: number;
  maxEmi: number;
};

export type RecommendationItem = {
  productId: UUID;
  bankId: UUID;
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
};

export type TrackerSummary = {
  applicationId: UUID;
  status: ApplicationStatus | OutcomeStatus;
  loanSummary: {
    approvedAmount: number | null;
    approvedRate: number | null;
    approvedTenureMonths: number | null;
    emi: number | null;
  };
  nextDueDate: string | null;
  installmentHistory: Array<{
    id: UUID;
    dueDate: string;
    amount: number;
    status: InstallmentStatus;
    paidDate: string | null;
    notes: string | null;
  }>;
  progressPercent: number;
};
