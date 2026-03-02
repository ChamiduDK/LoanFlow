import * as tf from "@tensorflow/tfjs";
import { badRequest, internalError, notFound } from "../../lib/errors";
import { supabaseAdmin } from "../../lib/supabase/client";
import { logAudit } from "../audit.service";
import { buildTrainingDatasetFromOutcomes, persistTrainingSamples } from "./data-prep.service";
import { evaluateBinaryClassification, type MlEvaluationMetrics } from "./metrics.service";
import { fitPreprocessingMetadata, transformDataset } from "./preprocessing.service";
import { prepareModelArtifactPaths, savePreprocessingMetadata, saveTfjsModel } from "./storage.service";
import type { MlFeatureSample, MlPreprocessingMetadata } from "./types";

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

export async function trainMlApprovalModel(
  actorUserId: string | undefined,
  options: TrainMlModelOptions,
  ipAddress?: string | null,
): Promise<TrainedModelSummary> {
  const epochs = Math.max(10, options.epochs ?? 120);
  const batchSize = Math.max(8, options.batch_size ?? 32);
  const validationSplit = Math.min(0.4, Math.max(0.1, options.validation_split ?? 0.2));
  const minSamples = Math.max(20, options.min_samples ?? 50);

  const samples = await buildTrainingDatasetFromOutcomes();
  const persistedCount = await persistTrainingSamples(samples);

  const labeledSamples = samples.filter((sample) => sample.label === 0 || sample.label === 1);
  if (labeledSamples.length < minSamples) {
    throw badRequest(`Not enough finalized training samples. Need at least ${minSamples}, found ${labeledSamples.length}.`);
  }

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
