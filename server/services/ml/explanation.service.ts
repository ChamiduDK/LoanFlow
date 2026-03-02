import * as tf from "@tensorflow/tfjs";
import { transformFeatureSample } from "./preprocessing.service";
import { CATEGORICAL_FEATURE_KEYS, NUMERIC_FEATURE_KEYS, type MlFeatureSample, type MlPreprocessingMetadata, type MlPredictionResult } from "./types";

type Attribution = {
  feature: string;
  weight: number;
  impact: "positive" | "negative" | "neutral";
};

const FEATURE_DESCRIPTIONS: Record<string, { positive: string; negative: string }> = {
  requested_amount: {
    positive: "The requested amount is well-supported by your financials.",
    negative: "The requested amount is high relative to the evaluated risk profile."
  },
  annual_turnover: {
    positive: "Your strong annual turnover indicates high repayment capacity.",
    negative: "Annual turnover is a limiting factor for this loan size."
  },
  amount_turnover_ratio: {
    positive: "The loan-to-turnover ratio is within a healthy range.",
    negative: "The requested loan amount is high compared to your annual revenue."
  },
  eligibility_score: {
    positive: "Your basic eligibility profile is strong.",
    negative: "Some basic eligibility criteria are not fully met."
  },
  bank_match_score: {
    positive: "You have a strong match with this specific bank's lending criteria.",
    negative: "Your profile differs from this bank's typical lending preferences."
  },
  document_completeness_score: {
    positive: "Your document checklist is highly complete.",
    negative: "Additional documentation would strengthen your application."
  },
  document_quality_score: {
    positive: "The uploaded documents are clear and valid.",
    negative: "Some documents require better clarity or verification."
  },
  years_active: {
    positive: "Your business has a stable operating history.",
    negative: "The business has a relatively short operating history."
  },
  collateral_available: {
    positive: "Available collateral significantly reduces lending risk.",
    negative: "Lack of collateral increases the risk assessment for this product."
  },
  invalid_docs_count: {
    positive: "Clean document validation record.",
    negative: "Validation issues in some documents have decreased the score."
  },
  business_type: {
    positive: "Your business entity type is preferred for this category.",
    negative: "This business entity type faces stricter requirements."
  },
  industry: {
    positive: "Your industry sector is currently viewed favorably.",
    negative: "This industry is considered higher risk under current policy."
  }
};

/**
 * Generates faithful explanations for a prediction using Feature Perturbation.
 * This identifies which features moved the probability the most.
 */
export async function generateFaithfulExplanations(
  sample: MlFeatureSample,
  model: tf.LayersModel,
  preprocessing: MlPreprocessingMetadata,
  originalProbability: number
): Promise<MlPredictionResult["explainability"]> {
  const baseVector = transformFeatureSample(sample, preprocessing);
  const attributions: Attribution[] = [];

  // 1. Analyze Numeric Features
  for (const key of NUMERIC_FEATURE_KEYS) {
    // We compare current feature value vs a "baseline" (the mean)
    // To see how much this specific feature value is contributing to the current score
    const baselineValue = preprocessing.numeric_stats[key]?.mean || 0;
    const reducedFeatures = { ...sample.features, [key]: baselineValue };
    const reducedSample = { ...sample, features: reducedFeatures };
    const reducedVector = transformFeatureSample(reducedSample, preprocessing);
    const reducedProb = await predictProb(model, reducedVector);

    const weight = originalProbability - reducedProb;
    attributions.push({
      feature: key,
      weight: Math.abs(weight),
      impact: weight > 0.01 ? "positive" : weight < -0.01 ? "negative" : "neutral"
    });
  }

  // 2. Analyze Categorical (Simplified: check if removing it helps/hurts)
  for (const key of CATEGORICAL_FEATURE_KEYS) {
    const reducedFeatures = { ...sample.features, [key]: "unknown" };
    const reducedSample = { ...sample, features: reducedFeatures };
    const reducedVector = transformFeatureSample(reducedSample, preprocessing);
    const reducedProb = await predictProb(model, reducedVector);

    const weight = originalProbability - reducedProb;
    attributions.push({
      feature: key,
      weight: Math.abs(weight),
      impact: weight > 0.01 ? "positive" : weight < -0.01 ? "negative" : "neutral"
    });
  }

  // Sort by absolute weight
  attributions.sort((a, b) => b.weight - a.weight);

  const topContribs = attributions.slice(0, 6).map(attr => {
    const desc = FEATURE_DESCRIPTIONS[attr.feature] || { positive: `${attr.feature} is helping.`, negative: `${attr.feature} is hurting.` };
    return {
      feature: attr.feature,
      impact: attr.impact,
      weight: Number(attr.weight.toFixed(4)),
      note: attr.impact === "positive" ? desc.positive : attr.impact === "negative" ? desc.negative : `Neutral impact from ${attr.feature}.`
    };
  });

  return {
    reasons: topContribs.map(c => c.note),
    contributions: topContribs
  };
}

async function predictProb(model: tf.LayersModel, vector: number[]): Promise<number> {
  const tensor = tf.tensor2d([vector]);
  const pred = model.predict(tensor) as tf.Tensor;
  const data = await pred.data();
  tf.dispose([tensor, pred]);
  return data[0];
}
