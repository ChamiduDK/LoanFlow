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
  };
  trained_sample_count: number;
  is_active: boolean;
  trained_at: string;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};
