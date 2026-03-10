export const MIN_TRAINING_SAMPLES = 50;
export const MIN_TRAINING_SAMPLES_PER_CLASS = 15;
export const RECOMMENDED_TRAINING_SAMPLES = 100;
export const MIN_READY_MODEL_VALIDATION_SUPPORT = 10;
export const MIN_READY_MODEL_PER_CLASS_SUPPORT = 3;

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

export function isSyntheticBootstrapTrainingEnabled(): boolean {
  const explicit = parseBooleanEnv(process.env.ML_ALLOW_SYNTHETIC_BOOTSTRAP);
  if (explicit !== null) {
    return explicit;
  }

  return (process.env.NODE_ENV ?? "development").trim().toLowerCase() !== "production";
}
