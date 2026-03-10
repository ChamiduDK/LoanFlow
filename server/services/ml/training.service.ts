import * as tf from "@tensorflow/tfjs";
import { badRequest, internalError, notFound } from "../../lib/errors";
import { supabaseAdmin } from "../../lib/supabase/client";
import { logAudit } from "../audit.service";
import { persistTrainingSamples, summarizeTrainingDataset, type MlTrainingDatasetSummary } from "./data-prep.service";
import { evaluateBinaryClassification, type MlEvaluationMetrics } from "./metrics.service";
import { fitPreprocessingMetadata, transformDataset } from "./preprocessing.service";
import {
  MIN_READY_MODEL_PER_CLASS_SUPPORT,
  MIN_READY_MODEL_VALIDATION_SUPPORT,
  MIN_TRAINING_SAMPLES,
  MIN_TRAINING_SAMPLES_PER_CLASS,
  RECOMMENDED_TRAINING_SAMPLES,
  isSyntheticBootstrapTrainingEnabled,
} from "./readiness";
import { prepareModelArtifactPaths, savePreprocessingMetadata, saveTfjsModel } from "./storage.service";
import type { MlFeatureSample, MlPreprocessingMetadata } from "./types";

const MLP_STRATEGY_METADATA = {
  strategy_family: "mlp",
  strategy_role: "Research Comparator",
  strategy_summary: "Research comparator; future extension after dataset grows.",
  strategy_positioning:
    "Flexible and extensible for multimodal features, but still higher-maintenance and more calibration-sensitive than the planned tabular production candidates.",
} as const;

export type TrainMlModelOptions = {
  epochs?: number;
  batch_size?: number;
  validation_split?: number;
  min_samples?: number;
};

export type TrainedModelSummary = {
  id: string;
  version: string;
  is_active: boolean;
  trained_sample_count: number;
  metrics: MlEvaluationMetrics;
  training: {
    epochs_completed: number;
    best_val_loss: number | null;
    persisted_training_samples: number;
    preprocessing: MlPreprocessingMetadata;
  };
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

function buildTrainingMode(includeSyntheticBootstrap: boolean): MlTrainingReadiness["training_mode"] {
  return includeSyntheticBootstrap
    ? {
        code: "bootstrap_with_synthetic",
        include_synthetic_bootstrap: true,
        sample_label: "Training Samples",
        description: "Local/demo training can use consented real outcomes plus synthetic bootstrap rows. Production still needs consented real outcomes.",
      }
    : {
        code: "real_only",
        include_synthetic_bootstrap: false,
        sample_label: "Real Samples",
        description: "Training uses only consented real outcomes and excludes synthetic bootstrap rows.",
      };
}

type DatasetSplit = {
  trainInputs: number[][];
  trainLabels: number[];
  valInputs: number[][];
  valLabels: number[];
};

function shuffleInPlace<T>(input: T[]): T[] {
  for (let i = input.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = input[i];
    input[i] = input[j];
    input[j] = tmp;
  }
  return input;
}

function splitDataset(inputs: number[][], labels: number[], validationSplit: number): DatasetSplit {
  const rows = inputs.map((input, index) => ({
    input,
    label: labels[index],
  }));
  shuffleInPlace(rows);

  const total = rows.length;
  const valCount = Math.max(1, Math.floor(total * validationSplit));
  const trainCount = Math.max(1, total - valCount);

  const trainRows = rows.slice(0, trainCount);
  const valRows = rows.slice(trainCount);
  const fallbackValRows = valRows.length > 0 ? valRows : rows.slice(-1);

  return {
    trainInputs: trainRows.map((row) => row.input),
    trainLabels: trainRows.map((row) => row.label),
    valInputs: fallbackValRows.map((row) => row.input),
    valLabels: fallbackValRows.map((row) => row.label),
  };
}

function createModel(inputSize: number): tf.Sequential {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 64, activation: "relu", inputShape: [inputSize], kernelInitializer: "heNormal" }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: "relu", kernelInitializer: "heNormal" }));
  model.add(tf.layers.dropout({ rate: 0.1 }));
  model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

  model.compile({
    optimizer: tf.train.adam(0.0005),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });

  return model;
}

async function toProbabilities(model: tf.LayersModel, inputs: number[][]): Promise<number[]> {
  const xs = tf.tensor2d(inputs);
  const predictions = model.predict(xs) as tf.Tensor;
  const values = Array.from(await predictions.data()).map((value) => Number(value));
  tf.dispose([xs, predictions]);
  return values;
}

function toTrainingReadiness(
  dataset: MlTrainingDatasetSummary,
  includeSyntheticBootstrap: boolean,
): MlTrainingReadiness {
  const trainingMode = buildTrainingMode(includeSyntheticBootstrap);
  const remaining = {
    total_samples: Math.max(0, MIN_TRAINING_SAMPLES - dataset.usable_training_samples),
    approved_samples: Math.max(0, MIN_TRAINING_SAMPLES_PER_CLASS - dataset.usable_approved_samples),
    rejected_samples: Math.max(0, MIN_TRAINING_SAMPLES_PER_CLASS - dataset.usable_rejected_samples),
    recommended_total_samples: Math.max(0, RECOMMENDED_TRAINING_SAMPLES - dataset.usable_training_samples),
  };

  const readyForTraining =
    dataset.usable_training_samples >= MIN_TRAINING_SAMPLES &&
    dataset.usable_approved_samples >= MIN_TRAINING_SAMPLES_PER_CLASS &&
    dataset.usable_rejected_samples >= MIN_TRAINING_SAMPLES_PER_CLASS;

  const summary = readyForTraining
    ? [
        includeSyntheticBootstrap
          ? `Training pool is ready with ${dataset.usable_training_samples} usable samples (${dataset.usable_real_training_samples} real + ${dataset.usable_synthetic_training_samples} synthetic).`
          : `Dataset is ready for training with ${dataset.usable_training_samples} consented real samples.`,
        `${dataset.usable_approved_samples} approved and ${dataset.usable_rejected_samples} rejected samples are usable.`,
      ]
    : [
        includeSyntheticBootstrap
          ? `Usable training pool samples: ${dataset.usable_training_samples} (${dataset.usable_real_training_samples} real + ${dataset.usable_synthetic_training_samples} synthetic; ${dataset.usable_approved_samples} approved / ${dataset.usable_rejected_samples} rejected).`
          : `Usable consented real samples: ${dataset.usable_training_samples} (${dataset.usable_approved_samples} approved / ${dataset.usable_rejected_samples} rejected).`,
        `Need ${remaining.total_samples} more total samples, ${remaining.approved_samples} more approved, and ${remaining.rejected_samples} more rejected before training.`,
      ];

  if (dataset.non_consented_outcomes_excluded > 0) {
    summary.push(
      `${dataset.non_consented_outcomes_excluded} finalized real outcomes are excluded because training consent is off. Applicants can enable it in Application Tracker after approval or rejection.`,
    );
  }

  if (includeSyntheticBootstrap && dataset.synthetic_outcomes_included > 0) {
    summary.push(
      `${dataset.synthetic_outcomes_included} synthetic bootstrap outcomes are currently included for local/demo ML training. Collect consented real outcomes before relying on production ML.`,
    );
  }

  if (!includeSyntheticBootstrap && dataset.synthetic_outcomes_excluded > 0) {
    summary.push(
      `${dataset.synthetic_outcomes_excluded} synthetic bootstrap outcomes are excluded and will not count toward production ML training.`,
    );
  }

  if (dataset.unusable_real_outcomes > 0) {
    summary.push(
      `${dataset.unusable_real_outcomes} consented real outcomes could not be converted into usable ML feature samples yet.`,
    );
  }

  if (dataset.unusable_synthetic_outcomes > 0) {
    summary.push(
      `${dataset.unusable_synthetic_outcomes} synthetic bootstrap outcomes could not be converted into usable ML feature samples yet.`,
    );
  }

  return {
    training_mode: trainingMode,
    requirements: {
      min_total_samples: MIN_TRAINING_SAMPLES,
      min_samples_per_class: MIN_TRAINING_SAMPLES_PER_CLASS,
      recommended_total_samples: RECOMMENDED_TRAINING_SAMPLES,
      min_validation_support: MIN_READY_MODEL_VALIDATION_SUPPORT,
      min_validation_samples_per_class: MIN_READY_MODEL_PER_CLASS_SUPPORT,
    },
    dataset: {
      finalized_outcomes_total: dataset.finalized_outcomes_total,
      finalized_approved_count: dataset.finalized_approved_count,
      finalized_rejected_count: dataset.finalized_rejected_count,
      consented_real_outcomes: dataset.consented_real_outcomes,
      usable_training_samples: dataset.usable_training_samples,
      usable_approved_samples: dataset.usable_approved_samples,
      usable_rejected_samples: dataset.usable_rejected_samples,
      usable_real_training_samples: dataset.usable_real_training_samples,
      usable_real_approved_samples: dataset.usable_real_approved_samples,
      usable_real_rejected_samples: dataset.usable_real_rejected_samples,
      usable_synthetic_training_samples: dataset.usable_synthetic_training_samples,
      usable_synthetic_approved_samples: dataset.usable_synthetic_approved_samples,
      usable_synthetic_rejected_samples: dataset.usable_synthetic_rejected_samples,
      non_consented_outcomes_excluded: dataset.non_consented_outcomes_excluded,
      synthetic_outcomes_included: dataset.synthetic_outcomes_included,
      synthetic_outcomes_excluded: dataset.synthetic_outcomes_excluded,
      unusable_eligible_outcomes: dataset.unusable_eligible_outcomes,
      unusable_real_outcomes: dataset.unusable_real_outcomes,
      unusable_synthetic_outcomes: dataset.unusable_synthetic_outcomes,
    },
    ready_for_training: readyForTraining,
    remaining,
    summary,
  };
}

function toVersionTag(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `tabular_mlp_${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export async function getMlTrainingReadiness(): Promise<MlTrainingReadiness> {
  const includeSyntheticBootstrap = isSyntheticBootstrapTrainingEnabled();
  const dataset = await summarizeTrainingDataset({ includeSyntheticBootstrap });
  return toTrainingReadiness(dataset, includeSyntheticBootstrap);
}

export async function trainMlApprovalModel(
  actorUserId: string | undefined,
  options: TrainMlModelOptions,
  ipAddress?: string | null,
): Promise<TrainedModelSummary> {
  const includeSyntheticBootstrap = isSyntheticBootstrapTrainingEnabled();
  const epochs = Math.max(10, options.epochs ?? 120);
  const batchSize = Math.max(8, options.batch_size ?? 32);
  const validationSplit = Math.min(0.4, Math.max(0.1, options.validation_split ?? 0.2));
  const minSamples = Math.max(MIN_TRAINING_SAMPLES, options.min_samples ?? MIN_TRAINING_SAMPLES);
  const datasetSummary = await summarizeTrainingDataset({ includeSyntheticBootstrap });
  const readiness = toTrainingReadiness(datasetSummary, includeSyntheticBootstrap);
  const labeledSamples = datasetSummary.samples.filter((sample) => sample.label === 0 || sample.label === 1);

  if (
    labeledSamples.length < minSamples ||
    readiness.dataset.usable_approved_samples < MIN_TRAINING_SAMPLES_PER_CLASS ||
    readiness.dataset.usable_rejected_samples < MIN_TRAINING_SAMPLES_PER_CLASS
  ) {
    throw badRequest(
      [
        includeSyntheticBootstrap
          ? "Not enough training samples in the current bootstrap-enabled pool."
          : "Not enough consented real training samples.",
        `Need at least ${minSamples} total usable samples and ${MIN_TRAINING_SAMPLES_PER_CLASS} per class.`,
        includeSyntheticBootstrap
          ? `Current usable pool: ${readiness.dataset.usable_training_samples} total (${readiness.dataset.usable_real_training_samples} real + ${readiness.dataset.usable_synthetic_training_samples} synthetic), ${readiness.dataset.usable_approved_samples} approved, ${readiness.dataset.usable_rejected_samples} rejected.`
          : `Current usable set: ${readiness.dataset.usable_training_samples} total, ${readiness.dataset.usable_approved_samples} approved, ${readiness.dataset.usable_rejected_samples} rejected.`,
      ].join(" "),
    );
  }

  const persistedCount = await persistTrainingSamples(labeledSamples);

  const preprocessing = fitPreprocessingMetadata(labeledSamples);
  const transformed = transformDataset(labeledSamples, preprocessing);
  if (transformed.inputs.length < 2) {
    throw badRequest("Not enough transformed samples to train a model");
  }

  const split = splitDataset(transformed.inputs, transformed.labels, validationSplit);
  if (split.trainInputs.length < 1 || split.valInputs.length < 1) {
    throw badRequest("Training/validation split failed. Add more labeled samples.");
  }

  const model = createModel(preprocessing.input_size);
  const trainXs = tf.tensor2d(split.trainInputs);
  const trainYs = tf.tensor2d(split.trainLabels, [split.trainLabels.length, 1]);
  const valXs = tf.tensor2d(split.valInputs);
  const valYs = tf.tensor2d(split.valLabels, [split.valLabels.length, 1]);

  let bestValLoss: number | null = null;
  let bestWeights: tf.Tensor[] | null = null;
  let epochsCompleted = 0;

  const checkpointCallback = new tf.CustomCallback({
    onEpochEnd: async (epoch, logs) => {
      epochsCompleted = epoch + 1;
      const valLoss = Number(logs?.val_loss ?? Number.POSITIVE_INFINITY);
      if (!Number.isFinite(valLoss)) {
        return;
      }

      if (bestValLoss === null || valLoss < bestValLoss) {
        bestValLoss = valLoss;
        if (bestWeights) {
          bestWeights.forEach((weight) => weight.dispose());
        }
        bestWeights = model.getWeights().map((weight) => weight.clone());
      }
    },
  });

  const earlyStopping = tf.callbacks.earlyStopping({
    monitor: "val_loss",
    mode: "min",
    patience: 12,
    restoreBestWeights: false,
  });

  await model.fit(trainXs, trainYs, {
    epochs,
    batchSize,
    validationData: [valXs, valYs],
    callbacks: [earlyStopping, checkpointCallback],
    classWeight: {
      0: preprocessing.class_weights["0"],
      1: preprocessing.class_weights["1"],
    },
    verbose: 0,
    shuffle: true,
  });

  const selectedWeights = bestWeights as tf.Tensor[] | null;
  if (selectedWeights && selectedWeights.length > 0) {
    model.setWeights(selectedWeights);
    selectedWeights.forEach((weight) => weight.dispose());
    bestWeights = null;
  }

  const valProbabilities = await toProbabilities(model, split.valInputs);
  const metrics = evaluateBinaryClassification(split.valLabels, valProbabilities, 0.5);

  const version = toVersionTag();
  const artifactPaths = await prepareModelArtifactPaths(version);
  await saveTfjsModel(model, artifactPaths.modelFilePath);
  await savePreprocessingMetadata(preprocessing, artifactPaths.preprocessingFilePath);

  const activeModelResult = await supabaseAdmin
    .from("ml_models")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  if (activeModelResult.error) {
    throw internalError("Failed to verify active ML model", activeModelResult.error);
  }

  const hasActiveModel = Boolean(activeModelResult.data);
  const nowIso = new Date().toISOString();

  const insertResult = await supabaseAdmin
    .from("ml_models")
    .insert({
      version,
      model_type: "tabular_mlp",
      framework: "tfjs",
      model_file_path: artifactPaths.modelFilePath,
      preprocessing_file_path: artifactPaths.preprocessingFilePath,
      metrics_json: metrics,
      training_meta_json: {
        epochs_requested: epochs,
        epochs_completed: epochsCompleted,
        batch_size: batchSize,
        validation_split: validationSplit,
        input_size: preprocessing.input_size,
        ...MLP_STRATEGY_METADATA,
        dataset_mode: readiness.training_mode.code,
        synthetic_bootstrap_enabled: includeSyntheticBootstrap,
        consented_real_outcome_count: datasetSummary.consented_real_outcomes,
        usable_training_sample_count: readiness.dataset.usable_training_samples,
        usable_real_sample_count: readiness.dataset.usable_real_training_samples,
        usable_synthetic_sample_count: readiness.dataset.usable_synthetic_training_samples,
        usable_approved_sample_count: readiness.dataset.usable_approved_samples,
        usable_rejected_sample_count: readiness.dataset.usable_rejected_samples,
      },
      trained_sample_count: labeledSamples.length,
      is_active: !hasActiveModel,
      created_by: actorUserId ?? null,
      trained_at: nowIso,
      activated_at: hasActiveModel ? null : nowIso,
    })
    .select("*")
    .single();

  if (insertResult.error || !insertResult.data) {
    throw internalError("Failed to persist ML model metadata", insertResult.error);
  }

  await logAudit({
    actorUserId: actorUserId ?? null,
    action: "ml.model.trained",
    entityType: "ml_models",
    entityId: String(insertResult.data.id),
    payloadSummary: {
      version,
      sample_count: labeledSamples.length,
      metrics,
      is_active: !hasActiveModel,
    },
    ipAddress: ipAddress ?? null,
  });

  tf.dispose([trainXs, trainYs, valXs, valYs]);
  model.dispose();

  return {
    id: String(insertResult.data.id),
    version: String(insertResult.data.version),
    is_active: Boolean(insertResult.data.is_active),
    trained_sample_count: Number(insertResult.data.trained_sample_count),
    metrics,
    training: {
      epochs_completed: epochsCompleted,
      best_val_loss: bestValLoss,
      persisted_training_samples: persistedCount,
      preprocessing,
    },
  };
}

export async function listMlModels(): Promise<Array<Record<string, unknown>>> {
  const result = await supabaseAdmin
    .from("ml_models")
    .select("*")
    .order("trained_at", { ascending: false });

  if (result.error) {
    throw internalError("Failed to list ML models", result.error);
  }

  return result.data ?? [];
}

export async function activateMlModel(
  modelId: string,
  actorUserId: string | undefined,
  ipAddress?: string | null,
): Promise<Record<string, unknown>> {
  const target = await supabaseAdmin
    .from("ml_models")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();

  if (target.error) {
    throw internalError("Failed to load target ML model", target.error);
  }

  if (!target.data) {
    throw notFound("ML model not found");
  }

  const deactivate = await supabaseAdmin
    .from("ml_models")
    .update({ is_active: false, activated_at: null })
    .eq("is_active", true);

  if (deactivate.error) {
    throw internalError("Failed to deactivate current ML model", deactivate.error);
  }

  const nowIso = new Date().toISOString();
  const activate = await supabaseAdmin
    .from("ml_models")
    .update({ is_active: true, activated_at: nowIso })
    .eq("id", modelId)
    .select("*")
    .single();

  if (activate.error || !activate.data) {
    throw internalError("Failed to activate ML model", activate.error);
  }

  await logAudit({
    actorUserId: actorUserId ?? null,
    action: "ml.model.activated",
    entityType: "ml_models",
    entityId: modelId,
    payloadSummary: {
      version: activate.data.version,
    },
    ipAddress: ipAddress ?? null,
  });

  return activate.data;
}
