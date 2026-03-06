import { USER_FEATURE_LABELS, type UserFeatureKey } from "../lib/feature-access";

export function getFeatureLabel(featureKey: UserFeatureKey): string {
  return USER_FEATURE_LABELS[featureKey];
}
