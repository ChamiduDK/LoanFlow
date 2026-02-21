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
