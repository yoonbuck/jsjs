/**
 * The project's supported-feature manifest for Test262.
 *
 * `features.json` is the single checked-in list of Test262 `features` tags
 * the engine actually implements and exercises with tests today. It exists so
 * "the engine supports X" is a reviewable file rather than a claim buried in
 * a CLI flag, and so a real conformance run — once `vendor/test262` is
 * checked out at the pinned revision — selects the same tests in every host.
 *
 * This module owns parsing and validation only, exactly like `selection.js`
 * owns the test-selection manifest: it touches no filesystem, so it stays
 * importable from every host, and an adapter that wants the manifest's
 * default must read the raw text itself and hand it to
 * `resolveSupportedFeatures`. Nothing here decides *which tests run* — that
 * remains `selection.js` and `runner.js`'s job — only *which optional
 * language features are allowed to run* when a test declares one.
 */

import { sortStrings } from './selection.js';

/** Repository-relative path to the manifest, for messages and callers. */
export const FEATURES_MANIFEST_FILE = 'tools/test262/features.json';

/**
 * Raised when the manifest cannot be parsed as a well-formed feature list: an
 * unreadable shape, a duplicate entry, or a non-string/empty entry. A
 * manifest that cannot be *read* is different from one that reads and fails
 * to validate — reading is the caller's concern, this only validates text
 * that was already read.
 */
export class Test262FeatureManifestError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'Test262FeatureManifestError';
  }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function parseFeatureManifest(text) {
  /** @type {unknown} */
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} must contain a JSON array`,
    );
  }

  const seen = new Set();

  for (const entry of parsed) {
    if (typeof entry !== 'string' || entry === '') {
      throw new Test262FeatureManifestError(
        `${FEATURES_MANIFEST_FILE} entries must be non-empty strings`,
      );
    }

    if (seen.has(entry)) {
      throw new Test262FeatureManifestError(
        `${FEATURES_MANIFEST_FILE} lists "${entry}" more than once`,
      );
    }

    seen.add(entry);
  }

  return sortStrings(/** @type {string[]} */ (parsed));
}

/**
 * Resolves which features a Test262 run should treat as supported. An
 * explicit CLI list — even an empty one — always wins outright, exactly like
 * `selection.js`'s explicit-paths precedence: a caller naming features is
 * asking for exactly those. Only when nothing was passed explicitly does the
 * manifest text get parsed and used, so a caller can never be silently
 * overridden by a stale default.
 *
 * @param {{ cliFeatures?: readonly string[], manifestText: string }} options
 * @returns {string[]}
 */
export function resolveSupportedFeatures(options) {
  const { cliFeatures, manifestText } = options;

  if (cliFeatures !== undefined) {
    return sortStrings(cliFeatures);
  }

  return parseFeatureManifest(manifestText);
}
