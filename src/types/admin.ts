export type AdminOverview = {
  metrics: {
    total_banks: number;
    total_products: number;
    total_applications: number;
    under_review_applications: number;
    approved_outcomes: number;
  };
  recent_activity: AdminAuditLog[];
};

export type AdminBank = {
  id: string;
  name: string;
  code: string;
  website: string | null;
  contact_email: string | null;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AdminLoanProduct = {
  id: string;
  bank_id: string;
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
  is_active: boolean;
  banks?: {
    name?: string;
    code?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  applications_total: number;
  applications_active: number;
};

export type AdminAuditLog = {
  id: number;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload_summary: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  actor_profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

export type AdminApplicationRow = {
  id: string;
  user_id: string;
  requested_amount: number;
  purpose: string;
  preferred_tenure_months: number;
  status: "draft" | "submitted" | "evaluated" | "applied" | "under_review" | "approved" | "rejected" | "withdrawn";
  selected_product_id: string | null;
  created_at: string;
  updated_at: string;
  user_profile: {
    id: string;
    email: string | null;
    full_name: string | null;
  } | null;
  outcome: {
    id: string;
    application_id: string;
    status: "applied" | "under_review" | "approved" | "rejected";
    approved_amount: number | null;
    approved_rate: number | null;
    approved_tenure_months: number | null;
    decision_date: string | null;
    applied_date: string | null;
  } | null;
};
