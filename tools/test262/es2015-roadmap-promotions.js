export const ES2015_M1_PROMOTION_FILE =
  'tools/test262/es2015-m1-promotion.json';

export const ES2015_P1C_PROMOTION_FILE =
  'tools/test262/es2015-p1c-promotion.json';

export const ES2015_P1C_DISPOSITION_FILE =
  'tools/test262/es2015-p1c-disposition.json';

export const ES2015_ROADMAP_PROMOTIONS = Object.freeze([
  Object.freeze({
    code: 'M1',
    promotionFile: ES2015_M1_PROMOTION_FILE,
    dispositionFile: 'tools/test262/es2015-m1-disposition.json',
  }),
  Object.freeze({
    code: 'P1C',
    promotionFile: ES2015_P1C_PROMOTION_FILE,
    dispositionFile: ES2015_P1C_DISPOSITION_FILE,
  }),
]);

export const ES2015_ROADMAP_PROMOTION_FILES = Object.freeze([
  ...ES2015_ROADMAP_PROMOTIONS.map((entry) => entry.promotionFile),
]);

/**
 * @param {string} path
 * @param {(path: string) => Promise<string>} readFile
 * @returns {Promise<string | null>}
 */
export async function readOptionalRoadmapFile(path, readFile) {
  try {
    return await readFile(path);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
