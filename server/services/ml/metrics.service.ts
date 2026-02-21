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

function round(value: number): number {
  return Number(value.toFixed(6));
}

function computeRocAuc(labels: number[], probabilities: number[]): number {
  const pairs = labels.map((label, index) => ({
    label,
    probability: probabilities[index] ?? 0,
  }));

  const positiveCount = pairs.filter((pair) => pair.label === 1).length;
  const negativeCount = pairs.length - positiveCount;
  if (positiveCount === 0 || negativeCount === 0) {
    return 0.5;
  }

  const sorted = [...pairs].sort((left, right) => left.probability - right.probability);

  let rank = 1;
  let index = 0;
  let rankSumPositives = 0;
  while (index < sorted.length) {
    const start = index;
    const probability = sorted[index].probability;
    while (index < sorted.length && sorted[index].probability === probability) {
      index += 1;
    }
    const end = index;
    const avgRank = (rank + (rank + (end - start) - 1)) / 2;
    for (let i = start; i < end; i += 1) {
      if (sorted[i].label === 1) {
        rankSumPositives += avgRank;
      }
    }
    rank += end - start;
  }

  const auc = (rankSumPositives - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
  return round(Math.max(0, Math.min(1, auc)));
}

function computePrAuc(labels: number[], probabilities: number[]): number {
  const sorted = labels
    .map((label, index) => ({
      label,
      probability: probabilities[index] ?? 0,
    }))
    .sort((left, right) => right.probability - left.probability);

  const positiveCount = sorted.filter((item) => item.label === 1).length;
  if (positiveCount === 0) {
    return 0;
  }

  let truePositives = 0;
  let falsePositives = 0;
  const curve: Array<{ recall: number; precision: number }> = [{ recall: 0, precision: 1 }];

  for (const item of sorted) {
    if (item.label === 1) {
      truePositives += 1;
    } else {
      falsePositives += 1;
    }

    const recall = truePositives / positiveCount;
    const precision = truePositives / (truePositives + falsePositives);
    curve.push({ recall, precision });
  }

  let auc = 0;
  for (let i = 1; i < curve.length; i += 1) {
    const left = curve[i - 1];
    const right = curve[i];
    auc += (right.recall - left.recall) * ((left.precision + right.precision) / 2);
  }

  return round(Math.max(0, Math.min(1, auc)));
}

export function evaluateBinaryClassification(
  labels: number[],
  probabilities: number[],
  threshold = 0.5,
): MlEvaluationMetrics {
  const total = labels.length;
  if (total === 0) {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      roc_auc: 0.5,
      pr_auc: 0,
      threshold,
      support: {
        total: 0,
        positive: 0,
        negative: 0,
      },
    };
  }

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < total; i += 1) {
    const actual = labels[i] === 1 ? 1 : 0;
    const predicted = (probabilities[i] ?? 0) >= threshold ? 1 : 0;

    if (predicted === 1 && actual === 1) tp += 1;
    if (predicted === 0 && actual === 0) tn += 1;
    if (predicted === 1 && actual === 0) fp += 1;
    if (predicted === 0 && actual === 1) fn += 1;
  }

  const accuracy = (tp + tn) / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const rocAuc = computeRocAuc(labels, probabilities);
  const prAuc = computePrAuc(labels, probabilities);

  return {
    accuracy: round(accuracy),
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    roc_auc: rocAuc,
    pr_auc: prAuc,
    threshold,
    support: {
      total,
      positive: labels.filter((label) => label === 1).length,
      negative: labels.filter((label) => label === 0).length,
    },
  };
}
