export const NUMERIC_FEATURE_KEYS = [
  "requested_amount",
  "preferred_tenure_months",
  "years_active",
  "annual_turnover",
  "amount_turnover_ratio",
  "eligibility_score",
  "bank_match_score",
  "document_completeness_score",
  "document_quality_score",
  "missing_docs_count",
  "invalid_docs_count",
  "unclear_docs_count",
  "rate_min",
  "rate_max",
  "product_min_amount",
  "product_max_amount",
  "product_tenure_min",
  "product_tenure_max",
  "collateral_available",
  "product_collateral_required",
] as const;

export const CATEGORICAL_FEATURE_KEYS = [
  "business_type",
  "industry",
  "turnover_band",
  "district",
  "purpose",
  "collateral_type",
  "bank_id",
  "product_id",
] as const;

export type NumericFeatureKey = (typeof NUMERIC_FEATURE_KEYS)[number];
export type CategoricalFeatureKey = (typeof CATEGORICAL_FEATURE_KEYS)[number];

export type MlFeatureRecord = Record<NumericFeatureKey, number> & Record<CategoricalFeatureKey, string>;

export type MlFeatureSample = {
  sample_key: string;
  application_id: string;
  product_id: string | null;
  outcome_status: "approved" | "rejected" | null;
  label: 0 | 1 | null;
  features: MlFeatureRecord;
  fallback_rule_probability: number;
};

export type MlPreprocessingMetadata = {
  schema_version: 1;
  numeric_stats: Record<NumericFeatureKey, { mean: number; std: number }>;
  categorical_vocabulary: Record<CategoricalFeatureKey, string[]>;
  numeric_feature_order: NumericFeatureKey[];
  categorical_feature_order: CategoricalFeatureKey[];
  input_size: number;
  class_weights: {
    "0": number;
    "1": number;
  };
  fitted_at: string;
};

export type MlPredictionResult = {
  probability: number;
  probability_percent: number;
  fallback_mode: boolean;
  source: "ml_model" | "rule_based_fallback";
  model: {
    id: string | null;
    version: string | null;
  };
  explainability: {
    reasons: string[];
    contributions: Array<{
      feature: string;
      impact: "positive" | "negative" | "neutral";
      note: string;
      weight: number;
    }>;
  };
  confidence: {
    score: number;
    level: "low" | "medium" | "high";
  };
};
