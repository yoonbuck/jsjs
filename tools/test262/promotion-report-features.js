/**
 * @param {readonly {
 *   entries: readonly { path: string, features: readonly string[] }[],
 * }[]} promotions
 * @returns {(file: string) => readonly string[] | undefined}
 */
export function createPromotionReportFeaturesForPromotions(promotions) {
  const featuresByPath = new Map();

  for (const promotion of promotions) {
    for (const entry of promotion.entries) {
      if (featuresByPath.has(entry.path)) {
        throw new Error(`Promotion report features repeat path ${entry.path}`);
      }
      featuresByPath.set(entry.path, entry.features);
    }
  }

  return (file) => featuresByPath.get(file);
}

/**
 * @param {{ entries: readonly { path: string, features: readonly string[] }[] }} promotion
 * @returns {(file: string) => readonly string[] | undefined}
 */
export function createPromotionReportFeaturesForPath(promotion) {
  return createPromotionReportFeaturesForPromotions([promotion]);
}
