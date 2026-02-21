import * as tf from "@tensorflow/tfjs";
import { internalError } from "../../lib/errors";
import { supabaseAdmin } from "../../lib/supabase/client";
import { buildFeatureSampleForApplication } from "./data-prep.service";
import { transformFeatureSample } from "./preprocessing.service";
import { loadPreprocessingMetadata, loadTfjsModel } from "./storage.service";
import type { MlFeatureSample, MlPredictionResult, MlPreprocessingMetadata } from "./types";

type PredictOptions = {
  applicationId: string;
  viewerUserId?: string;
  productId?: string | null;
  fallbackProbabilityOverride?: number;
  featureOverrides?: Partial<MlFeatureSample["features"]>;
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
    push("document_completeness_score", "positive", "Document checklist is highly complete.", 0.24);
  } else if (features.document_completeness_score < 60) {
    push("document_completeness_score", "negative", "Document checklist has significant gaps.", -0.26);
  } else {
    push("document_completeness_score", "neutral", "Document checklist is partially complete.", 0.06);
  }

  if (features.invalid_docs_count > 0) {
    push("invalid_docs_count", "negative", "Some uploaded documents failed validation.", -0.22);
  } else {
    push("invalid_docs_count", "positive", "No invalid documents were detected.", 0.08);
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

function buildExplainability(sample: MlFeatureSample, fallbackMode: boolean): MlPredictionResult["explainability"] {
  const contributions = buildContributions(sample);
  const reasons = contributions.map((item) => item.note);
  if (fallbackMode) {
    reasons.unshift("No active ML model found, using rule-based fallback probability.");
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

async function loadActiveModelBundle(): Promise<ActiveModelBundle | null> {
  const activeModelResult = await supabaseAdmin
    .from("ml_models")
    .select("id, version, model_file_path, preprocessing_file_path, is_active")
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

  const modelId = String(activeModelResult.data.id);
  if (modelCache && modelCache.modelId === modelId) {
    return modelCache;
  }

  const model = await loadTfjsModel(String(activeModelResult.data.model_file_path));
  const preprocessing = await loadPreprocessingMetadata(String(activeModelResult.data.preprocessing_file_path));

  if (modelCache) {
    modelCache.model.dispose();
  }

  modelCache = {
    modelId,
    version: String(activeModelResult.data.version),
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

  let activeBundle: ActiveModelBundle | null = null;
  let modelUnavailableReason: string | null = null;
  try {
    activeBundle = await loadActiveModelBundle();
  } catch {
    activeBundle = null;
    modelUnavailableReason = "Active ML model artifacts are unavailable; using fallback scoring.";
  }

  if (!activeBundle) {
    const explainability = buildExplainability(sample, true);
    if (modelUnavailableReason) {
      explainability.reasons.unshift(modelUnavailableReason);
    }

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

  const rawProbability = await predictWithModel(sample, activeBundle);
  const probability = clamp(rawProbability, 0, 1);

  return {
    probability,
    probability_percent: toPercent(probability),
    fallback_mode: false,
    source: "ml_model",
    model: {
      id: activeBundle.modelId,
      version: activeBundle.version,
    },
    explainability: buildExplainability(sample, false),
    confidence: buildConfidence(probability, false),
    feature_sample: sample,
  };
}
