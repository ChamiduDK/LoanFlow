const KNOWN_MODEL_LABELS: Record<string, string> = {
  tabular_mlp: "Tabular MLP",
  mlp: "MLP",
  logistic_regression: "Logistic Regression",
  logistic: "Logistic Regression",
  xgboost: "XGBoost",
  xgb: "XGBoost",
  catboost: "CatBoost",
};

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanizeToken(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseVersion(value: string | null | undefined): { familyToken: string; compactTimestamp: string | null } {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(.*)_(\d{8})_(\d{6})$/);
  if (!match) {
    return {
      familyToken: normalizeToken(normalized),
      compactTimestamp: null,
    };
  }

  const [, family, yyyymmdd, hhmmss] = match;
  const year = yyyymmdd.slice(0, 4);
  const month = yyyymmdd.slice(4, 6);
  const day = yyyymmdd.slice(6, 8);
  const hour = hhmmss.slice(0, 2);
  const minute = hhmmss.slice(2, 4);

  return {
    familyToken: normalizeToken(family),
    compactTimestamp: `${month}/${day} ${hour}:${minute}`,
  };
}

export function formatMlModelFamilyLabel(value: string | null | undefined): string {
  const parsed = parseVersion(value);
  if (!parsed.familyToken) {
    return "ML Model";
  }

  return KNOWN_MODEL_LABELS[parsed.familyToken] ?? humanizeToken(parsed.familyToken);
}

export function formatMlModelVersionLabel(
  version: string | null | undefined,
  modelType?: string | null,
): string {
  const parsed = parseVersion(version);
  const familyLabel = formatMlModelFamilyLabel(parsed.familyToken || modelType);
  if (parsed.compactTimestamp) {
    return `${familyLabel} (${parsed.compactTimestamp})`;
  }

  return familyLabel;
}

export function formatMlModelShortLabel(
  version: string | null | undefined,
  modelType?: string | null,
): string {
  const parsed = parseVersion(version);
  const familyLabel = formatMlModelFamilyLabel(parsed.familyToken || modelType);
  if (parsed.compactTimestamp) {
    return `${familyLabel} ${parsed.compactTimestamp}`;
  }

  return familyLabel;
}
