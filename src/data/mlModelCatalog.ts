export type MlStrategyFamily = "logistic_regression" | "xgboost" | "catboost" | "mlp";

export type MlStrategyRoleKey =
  | "baseline_fallback"
  | "primary_candidate"
  | "categorical_specialist"
  | "research_comparator";

export type MlModelCatalogEntry = {
  family: MlStrategyFamily;
  label: string;
  shortLabel: string;
  roleKey: MlStrategyRoleKey;
  roleBadge: string;
  chosenRole: string;
  pros: string;
  cons: string;
  implementationStatus: "implemented" | "planned";
  aliases: string[];
};

export const ML_IMPLEMENTATION_NOTE =
  "LoanFlow currently trains TFJS MLP artifacts only. Logistic regression, XGBoost, and CatBoost remain planned allocations until their training and inference paths are implemented.";

export const ML_MODEL_CATALOG: MlModelCatalogEntry[] = [
  {
    family: "logistic_regression",
    label: "Logistic Regression",
    shortLabel: "LR",
    roleKey: "baseline_fallback",
    roleBadge: "Baseline / Fallback",
    chosenRole: "Baseline and fallback; reference for explainability",
    pros: "Interpretable baseline; stable training; calibration-friendly; aligns with scoring guidance",
    cons: "May underfit nonlinear interactions",
    implementationStatus: "planned",
    aliases: ["logistic_regression", "logistic", "log_reg", "lr"],
  },
  {
    family: "xgboost",
    label: "XGBoost",
    shortLabel: "XGB",
    roleKey: "primary_candidate",
    roleBadge: "Primary Candidate",
    chosenRole: "Primary candidate for ranking and probability prediction",
    pros: "Strong tabular performance; handles missingness; widely validated in ML practice",
    cons: "Requires tuning; explanations require tooling",
    implementationStatus: "planned",
    aliases: ["xgboost", "xgb", "gradient_boosting"],
  },
  {
    family: "catboost",
    label: "CatBoost",
    shortLabel: "CAT",
    roleKey: "categorical_specialist",
    roleBadge: "Categorical Specialist",
    chosenRole: "Preferred when categorical predictors dominate",
    pros: "Strong with categorical features; ordered boosting reduces certain leakage artifacts",
    cons: "Heavier compute than LR; tuning still needed",
    implementationStatus: "planned",
    aliases: ["catboost", "cat_boost"],
  },
  {
    family: "mlp",
    label: "MLP",
    shortLabel: "MLP",
    roleKey: "research_comparator",
    roleBadge: "Research Comparator",
    chosenRole: "Research comparator; future extension after dataset grows",
    pros: "Flexible; supports future multimodal features; can integrate embeddings",
    cons: "Needs larger datasets; calibration risk; higher maintenance",
    implementationStatus: "implemented",
    aliases: ["mlp", "tabular_mlp", "neural_network"],
  },
];

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveMlModelCatalogEntry(input: {
  modelType?: string | null;
  strategyFamily?: string | null;
}): MlModelCatalogEntry | null {
  const candidates = [input.strategyFamily, input.modelType]
    .map((value) => normalizeToken(value))
    .filter((value) => value.length > 0);

  for (const candidate of candidates) {
    const match = ML_MODEL_CATALOG.find(
      (entry) => entry.family === candidate || entry.aliases.includes(candidate),
    );
    if (match) {
      return match;
    }
  }

  return null;
}
