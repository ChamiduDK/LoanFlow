import * as tf from "@tensorflow/tfjs";
import { internalError } from "../../lib/errors";
import { supabaseAdmin } from "../../lib/supabase/client";
import { buildFeatureSampleForApplication } from "./data-prep.service";
import { transformFeatureSample } from "./preprocessing.service";
import {
  MIN_READY_MODEL_PER_CLASS_SUPPORT,
  MIN_READY_MODEL_VALIDATION_SUPPORT,
  MIN_TRAINING_SAMPLES,
  isSyntheticBootstrapTrainingEnabled,
} from "./readiness";
import { loadPreprocessingMetadata, loadTfjsModel } from "./storage.service";
import type { MlFeatureSample, MlPredictionResult, MlPreprocessingMetadata } from "./types";
import { generateFaithfulExplanations } from "./explanation.service";

type PredictOptions = {
  applicationId: string;
  viewerUserId?: string;
  productId?: string | null;
  fallbackProbabilityOverride?: number;
  featureOverrides?: Partial<MlFeatureSample["features"]>;
};

type ActiveModelRecord = {
  id: string;
  version: string;
  model_file_path: string;
  preprocessing_file_path: string;
  trained_sample_count: number | null;
  metrics_json: Record<string, unknown> | null;
  training_meta_json: Record<string, unknown> | null;
};

type ActiveModelBundle = {
  modelId: string;
  version: string;
  model: tf.LayersModel;
  preprocessing: MlPreprocessingMetadata;
};

let modelCache: ActiveModelBundle | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPercent(probability: number): number {
  return Number((clamp(probability, 0, 1) * 100).toFixed(2));
}

function buildContributions(sample: MlFeatureSample): MlPredictionResult["explainability"]["contributions"] {
  const features = sample.features;
  const contributions: MlPredictionResult["explainability"]["contributions"] = [];

  const push = (
    feature: string,
    impact: "positive" | "negative" | "neutral",
    note: string,
    weight: number,
  ) => {
    contributions.push({
      feature,
      impact,
      note,
      weight: Number(Math.abs(weight).toFixed(4)),
    });
  };

  if (features.document_completeness_score >= 85) {
    push("document_completeness_score", "positive", "Most bank-preferred documents are already available.", 0.24);
  } else if (features.document_completeness_score < 60) {
    push("document_completeness_score", "negative", "Only a few bank-preferred documents are currently marked available.", -0.26);
  } else {
    push("document_completeness_score", "neutral", "Some bank-preferred documents are available, but there are still gaps.", 0.06);
  }

  if (features.missing_docs_count === 0 && features.document_completeness_score > 0) {
    push("missing_docs_count", "positive", "The applicant already has the preferred document set for this bank.", 0.08);
  } else if (features.missing_docs_count > 0) {
    push("missing_docs_count", "negative", "Several preferred documents are not yet marked available.", -0.16);
  } else {
    push("missing_docs_count", "neutral", "Document availability has not added much signal yet.", 0.04);
  }

  if (features.years_active >= 3) {
    push("years_active", "positive", "Business operating history is stable.", 0.15);
  } else {
    push("years_active", "negative", "Limited operating history may increase risk.", -0.12);
  }

  if (features.amount_turnover_ratio > 0 && features.amount_turnover_ratio <= 0.6) {
    push("amount_turnover_ratio", "positive", "Requested amount is reasonable against annual turnover.", 0.14);
  } else if (features.amount_turnover_ratio > 0.9) {
    push("amount_turnover_ratio", "negative", "Requested amount is high compared to annual turnover.", -0.18);
  } else {
    push("amount_turnover_ratio", "neutral", "Amount-to-turnover ratio is moderate.", 0.05);
  }

  if (features.product_collateral_required === 1 && features.collateral_available === 0) {
    push("collateral_available", "negative", "Collateral-required product selected without available collateral.", -0.2);
  } else if (features.collateral_available === 1) {
    push("collateral_available", "positive", "Collateral support improves underwriting confidence.", 0.1);
  }

  if (features.bank_match_score >= 75) {
    push("bank_match_score", "positive", "Bank-specific eligibility match is strong.", 0.17);
  } else if (features.bank_match_score < 50) {
    push("bank_match_score", "negative", "Bank-specific eligibility match is weak.", -0.16);
  }

  return contributions.sort((left, right) => right.weight - left.weight).slice(0, 6);
}

function buildExplainability(
  sample: MlFeatureSample,
  fallbackReason: string | null = null,
): MlPredictionResult["explainability"] {
  const contributions = buildContributions(sample);
  const reasons = contributions.map((item) => item.note);
  if (fallbackReason) {
    reasons.unshift(fallbackReason);
  }
  return { reasons, contributions };
}

function buildConfidence(probability: number, fallbackMode: boolean): MlPredictionResult["confidence"] {
  if (fallbackMode) {
    return { score: 0.4, level: "low" };
  }

  const distanceFromBoundary = Math.abs(probability - 0.5);
  const score = Number((0.5 + distanceFromBoundary).toFixed(4));
  if (score >= 0.75) {
    return { score, level: "high" };
  }
  if (score >= 0.62) {
    return { score, level: "medium" };
  }
  return { score, level: "low" };
}

function loadValidationSupport(metricsJson: Record<string, unknown> | null): {
  total: number;
  positive: number;
  negative: number;
} {
  const support = metricsJson?.support;
  const record =
    support && typeof support === "object" && !Array.isArray(support)
      ? (support as Record<string, unknown>)
      : {};

  return {
    total: toNumber(record.total, 0),
    positive: toNumber(record.positive, 0),
    negative: toNumber(record.negative, 0),
  };
}

function usesSyntheticBootstrapModel(activeModel: ActiveModelRecord): boolean {
  const meta = activeModel.training_meta_json;
  if (!meta || Array.isArray(meta)) {
    return false;
  }

  if (meta.dataset_mode === "bootstrap_with_synthetic" || meta.synthetic_bootstrap_enabled === true) {
    return true;
  }

  return toNumber(meta.usable_synthetic_sample_count, 0) > 0;
}

function buildModelReadinessFailureReason(activeModel: ActiveModelRecord): string | null {
  if (usesSyntheticBootstrapModel(activeModel) && !isSyntheticBootstrapTrainingEnabled()) {
    return `Active ML model ${activeModel.version} was trained with synthetic bootstrap samples while bootstrap mode is off. Using rule-based fallback probability. Re-train with consented real outcomes for production use.`;
  }

  const issues: string[] = [];
  const trainedSampleCount = toNumber(activeModel.trained_sample_count, 0);
  const validationSupport = loadValidationSupport(activeModel.metrics_json);

  if (trainedSampleCount < MIN_TRAINING_SAMPLES) {
    issues.push(
      `${trainedSampleCount} labeled samples (need at least ${MIN_TRAINING_SAMPLES})`,
    );
  }

  if (validationSupport.total < MIN_READY_MODEL_VALIDATION_SUPPORT) {
    issues.push(
      `${validationSupport.total} validation cases (need at least ${MIN_READY_MODEL_VALIDATION_SUPPORT})`,
    );
  }

  if (
    validationSupport.positive < MIN_READY_MODEL_PER_CLASS_SUPPORT ||
    validationSupport.negative < MIN_READY_MODEL_PER_CLASS_SUPPORT
  ) {
    issues.push(
      `validation class mix is too small (${validationSupport.positive} approved / ${validationSupport.negative} rejected)`,
    );
  }

  if (issues.length === 0) {
    return null;
  }

  return `Active ML model ${activeModel.version} is not production-ready: ${issues.join("; ")}. Using rule-based fallback probability. Collect more consented real approved/rejected outcomes and retrain to restore live ML scoring.`;
}

function buildFallbackPrediction(
  sample: MlFeatureSample,
  fallbackProbability: number,
  reason: string,
): MlPredictionResult & { feature_sample: MlFeatureSample } {
  const explainability = buildExplainability(sample, reason);

  return {
    probability: fallbackProbability,
    probability_percent: toPercent(fallbackProbability),
    fallback_mode: true,
    source: "rule_based_fallback",
    model: {
      id: null,
      version: null,
    },
    explainability,
    confidence: buildConfidence(fallbackProbability, true),
    feature_sample: sample,
  };
}

async function loadActiveModelRecord(): Promise<ActiveModelRecord | null> {
  const activeModelResult = await supabaseAdmin
    .from("ml_models")
    .select("id, version, model_file_path, preprocessing_file_path, trained_sample_count, metrics_json, training_meta_json, is_active")
    .eq("is_active", true)
    .order("trained_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeModelResult.error) {
    throw internalError("Failed to load active ML model", activeModelResult.error);
  }

  if (!activeModelResult.data) {
    return null;
  }

  return activeModelResult.data as ActiveModelRecord;
}

async function loadActiveModelBundle(activeModel: ActiveModelRecord): Promise<ActiveModelBundle> {
  const modelId = String(activeModel.id);
  if (modelCache && modelCache.modelId === modelId) {
    return modelCache;
  }

  const model = await loadTfjsModel(String(activeModel.model_file_path));
  const preprocessing = await loadPreprocessingMetadata(String(activeModel.preprocessing_file_path));

  if (modelCache) {
    modelCache.model.dispose();
  }

  modelCache = {
    modelId,
    version: String(activeModel.version),
    model,
    preprocessing,
  };

  return modelCache;
}

async function predictWithModel(sample: MlFeatureSample, bundle: ActiveModelBundle): Promise<number> {
  const vector = transformFeatureSample(sample, bundle.preprocessing);
  const tensor = tf.tensor2d([vector]);
  const predictionTensor = bundle.model.predict(tensor) as tf.Tensor;
  const values = await predictionTensor.data();
  tf.dispose([tensor, predictionTensor]);
  return Number(values[0] ?? 0);
}

export async function predictApprovalProbability(
  options: PredictOptions,
): Promise<MlPredictionResult & { feature_sample: MlFeatureSample }> {
  const baseSample = await buildFeatureSampleForApplication({
    applicationId: options.applicationId,
    viewerUserId: options.viewerUserId,
    selectedProductId: options.productId,
  });
  const sample: MlFeatureSample = options.featureOverrides
    ? {
      ...baseSample,
      features: {
        ...baseSample.features,
        ...options.featureOverrides,
      },
    }
    : baseSample;

  const fallbackProbabilityPercent = Number(
    (
      options.fallbackProbabilityOverride ??
      sample.fallback_rule_probability
    ).toFixed(2),
  );
  const fallbackProbability = clamp(fallbackProbabilityPercent / 100, 0, 1);

  let activeModel: ActiveModelRecord | null = null;
  let modelUnavailableReason: string | null = null;
  try {
    activeModel = await loadActiveModelRecord();
  } catch {
    activeModel = null;
    modelUnavailableReason = "Active ML model metadata is unavailable; using rule-based fallback probability.";
  }

  if (!activeModel) {
    return buildFallbackPrediction(
      sample,
      fallbackProbability,
      modelUnavailableReason ?? "No active ML model found; using rule-based fallback probability.",
    );
  }

  const readinessFailureReason = buildModelReadinessFailureReason(activeModel);
  if (readinessFailureReason) {
    return buildFallbackPrediction(sample, fallbackProbability, readinessFailureReason);
  }

  let activeBundle: ActiveModelBundle;
  try {
    activeBundle = await loadActiveModelBundle(activeModel);
  } catch {
    return buildFallbackPrediction(
      sample,
      fallbackProbability,
      "Active ML model artifacts are unavailable; using rule-based fallback probability.",
    );
  }

  const rawProbability = await predictWithModel(sample, activeBundle);
  const probability = clamp(rawProbability, 0, 1);

  const explainability = await generateFaithfulExplanations(
    sample,
    activeBundle.model,
    activeBundle.preprocessing,
    probability
  );

  return {
    probability,
    probability_percent: toPercent(probability),
    fallback_mode: false,
    source: "ml_model",
    model: {
      id: activeBundle.modelId,
      version: activeBundle.version,
    },
    explainability,
    confidence: buildConfidence(probability, false),
    feature_sample: sample,
  };
}
