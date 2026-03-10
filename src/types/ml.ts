export type MlEvaluationMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  pr_auc: number;
  threshold: number;
  support: {
    total: number;
    positive: number;
    negative: number;
  };
};

export type MlModel = {
  id: string;
  version: string;
  model_type: string;
  framework: string;
  model_file_path: string;
  preprocessing_file_path: string;
  metrics_json: MlEvaluationMetrics;
  training_meta_json: {
    epochs_requested: number;
    epochs_completed: number;
    batch_size: number;
    validation_split: number;
    input_size: number;
    strategy_family?: string;
    strategy_role?: string;
    strategy_summary?: string;
    strategy_positioning?: string;
    dataset_mode?: "real_only" | "bootstrap_with_synthetic";
    synthetic_bootstrap_enabled?: boolean;
    consented_real_outcome_count?: number;
    usable_training_sample_count?: number;
    usable_real_sample_count?: number;
    usable_synthetic_sample_count?: number;
    usable_approved_sample_count?: number;
    usable_rejected_sample_count?: number;
  };
  trained_sample_count: number;
  is_active: boolean;
  trained_at: string;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MlTrainingReadiness = {
  training_mode: {
    code: "real_only" | "bootstrap_with_synthetic";
    include_synthetic_bootstrap: boolean;
    sample_label: string;
    description: string;
  };
  requirements: {
    min_total_samples: number;
    min_samples_per_class: number;
    recommended_total_samples: number;
    min_validation_support: number;
    min_validation_samples_per_class: number;
  };
  dataset: {
    finalized_outcomes_total: number;
    finalized_approved_count: number;
    finalized_rejected_count: number;
    consented_real_outcomes: number;
    usable_training_samples: number;
    usable_approved_samples: number;
    usable_rejected_samples: number;
    usable_real_training_samples: number;
    usable_real_approved_samples: number;
    usable_real_rejected_samples: number;
    usable_synthetic_training_samples: number;
    usable_synthetic_approved_samples: number;
    usable_synthetic_rejected_samples: number;
    non_consented_outcomes_excluded: number;
    synthetic_outcomes_included: number;
    synthetic_outcomes_excluded: number;
    unusable_eligible_outcomes: number;
    unusable_real_outcomes: number;
    unusable_synthetic_outcomes: number;
  };
  ready_for_training: boolean;
  remaining: {
    total_samples: number;
    approved_samples: number;
    rejected_samples: number;
    recommended_total_samples: number;
  };
  summary: string[];
};
