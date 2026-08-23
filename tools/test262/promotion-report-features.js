/**
 * @param {{ entries: readonly { path: string, features: readonly string[] }[] }} promotion
 * @returns {(file: string) => readonly string[] | undefined}
 */
export function createPromotionReportFeaturesForPath(promotion) {
  const featuresByPath = new Map(
    promotion.entries.map((entry) => [entry.path, entry.features]),
  );

  return (file) => featuresByPath.get(file);
}
