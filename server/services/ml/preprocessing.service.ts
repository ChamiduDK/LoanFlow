import { CATEGORICAL_FEATURE_KEYS, NUMERIC_FEATURE_KEYS, type MlFeatureSample, type MlPreprocessingMetadata } from "./types";

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCategory(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return normalized.length > 0 ? normalized : "unknown";
}

export function fitPreprocessingMetadata(samples: MlFeatureSample[]): MlPreprocessingMetadata {
  const numericStats = {} as MlPreprocessingMetadata["numeric_stats"];
  for (const key of NUMERIC_FEATURE_KEYS) {
    const values = samples.map((sample) => toNumber(sample.features[key], 0));
    const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length > 0
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
      : 0;
    const std = Math.sqrt(variance);
    numericStats[key] = {
      mean: Number(mean.toFixed(8)),
      std: Number((std > 0 ? std : 1).toFixed(8)),
    };
  }

  const categoricalVocabulary = {} as MlPreprocessingMetadata["categorical_vocabulary"];
  for (const key of CATEGORICAL_FEATURE_KEYS) {
    const vocabulary = Array.from(
      new Set(samples.map((sample) => normalizeCategory(sample.features[key]))),
    )
      .filter((value) => value.length > 0)
      .sort()
      .slice(0, 100);
    categoricalVocabulary[key] = vocabulary;
  }

  const positiveCount = samples.filter((sample) => sample.label === 1).length;
  const negativeCount = samples.filter((sample) => sample.label === 0).length;
  const total = positiveCount + negativeCount;

  const classWeights = {
    "0": negativeCount > 0 ? total / (2 * negativeCount) : 1,
    "1": positiveCount > 0 ? total / (2 * positiveCount) : 1,
  };

  const inputSize = NUMERIC_FEATURE_KEYS.length + CATEGORICAL_FEATURE_KEYS.reduce(
    (sum, key) => sum + categoricalVocabulary[key].length + 1,
    0,
  );

  return {
    schema_version: 1,
    numeric_stats: numericStats,
    categorical_vocabulary: categoricalVocabulary,
    numeric_feature_order: [...NUMERIC_FEATURE_KEYS],
    categorical_feature_order: [...CATEGORICAL_FEATURE_KEYS],
    input_size: inputSize,
    class_weights: {
      "0": Number(classWeights["0"].toFixed(8)),
      "1": Number(classWeights["1"].toFixed(8)),
    },
    fitted_at: new Date().toISOString(),
  };
}

export function transformFeatureSample(sample: MlFeatureSample, metadata: MlPreprocessingMetadata): number[] {
  const vector: number[] = [];

  for (const feature of metadata.numeric_feature_order) {
    const value = toNumber(sample.features[feature], 0);
    const stats = metadata.numeric_stats[feature];
    const normalized = (value - stats.mean) / (stats.std > 0 ? stats.std : 1);
    vector.push(Number.isFinite(normalized) ? normalized : 0);
  }

  for (const feature of metadata.categorical_feature_order) {
    const value = normalizeCategory(sample.features[feature]);
    const vocabulary = metadata.categorical_vocabulary[feature];
    const oneHot = new Array(vocabulary.length + 1).fill(0);
    const vocabIndex = vocabulary.indexOf(value);
    const index = vocabIndex >= 0 ? vocabIndex + 1 : 0;
    oneHot[index] = 1;
    vector.push(...oneHot);
  }

  return vector;
}

export function transformDataset(
  samples: MlFeatureSample[],
  metadata: MlPreprocessingMetadata,
): { inputs: number[][]; labels: number[] } {
  const labeled = samples.filter((sample) => sample.label === 0 || sample.label === 1);
  return {
    inputs: labeled.map((sample) => transformFeatureSample(sample, metadata)),
    labels: labeled.map((sample) => sample.label as 0 | 1),
  };
}
