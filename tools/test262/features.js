/**
 * The project's supported-feature manifest for Test262.
 *
 * `features.json` is the single checked-in record of which Test262 `features`
 * tags the engine actually implements. It exists so "the engine supports X" is
 * a reviewable, falsifiable claim rather than a flag buried in a CLI
 * invocation, and so a real conformance run — against `vendor/test262` at the
 * pinned revision — selects the same tests in every host.
 *
 * A bare list of names would only be a claim, so an entry is a small record
 * instead:
 *
 * - `name` is the upstream Test262 `features` tag.
 * - `probe` is engine source that must complete normally on an engine that
 *   implements the feature and must throw, or fail to parse, on one that does
 *   not. `runFeatureProbe` executes it for real, so a probe that cannot run is
 *   a failed claim rather than a passing test.
 * - `tests` names the upstream tests that back the claim. The full local CI
 *   contract checks that each one carries the feature tag and passes at the
 *   pinned revision, except for its small documented set of pinned metadata
 *   exceptions where no standalone upstream tag exists.
 *
 * This module owns parsing, validation, and probe execution only, exactly like
 * `selection.js` owns the test-selection manifest: it touches no filesystem, so
 * it stays importable from every host, and the engine arrives injected rather
 * than imported. Nothing here decides *which tests run* — that remains
 * `selection.js` and `runner.js`'s job — only *which optional language
 * features are allowed to run* when a test declares one.
 */

import { sortStrings } from './selection.js';

/** Repository-relative path to the manifest, for messages and callers. */
export const FEATURES_MANIFEST_FILE = 'tools/test262/features.json';

/** The only manifest schema version this tooling understands. */
export const FEATURES_MANIFEST_VERSION = 1;

const MANIFEST_KEYS = Object.freeze(['version', 'features']);
const FEATURE_KEYS = Object.freeze(['name', 'probe', 'tests']);

/**
 * A manifest that claims nothing, for callers that must tolerate a missing
 * file. It lives here rather than in an adapter so the schema stays this
 * module's business.
 */
export const EMPTY_FEATURES_MANIFEST = '{"version": 1, "features": []}';

/**
 * @typedef {{
 *   name: string,
 *   probe: string,
 *   tests: readonly string[],
 * }} Test262SupportedFeature
 *
 * @typedef {{
 *   version: number,
 *   features: readonly Test262SupportedFeature[],
 * }} Test262FeatureManifest
 *
 * @typedef {'completed' | 'threw' | 'parse-error' | 'engine-error'} Test262ProbeOutcome
 *
 * @typedef {import('./runner.js').Test262Engine} Test262Engine
 */

/**
 * Raised when the manifest cannot be read as a well-formed set of feature
 * records: an unreadable shape, an unknown key, a duplicate or unsorted entry,
 * an empty probe, or a backing test that is not an upstream test path. A
 * manifest that cannot be *read* is different from one that reads and fails to
 * validate — reading is the caller's concern, this only validates text that was
 * already read.
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
 * @returns {Test262FeatureManifest}
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

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} must contain a JSON object`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (parsed);

  requireExactKeys(record, MANIFEST_KEYS, FEATURES_MANIFEST_FILE);

  if (record.version !== FEATURES_MANIFEST_VERSION) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} must declare version ${FEATURES_MANIFEST_VERSION}`,
    );
  }

  if (!Array.isArray(record.features)) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} must list features in an array`,
    );
  }

  const features = record.features.map((entry) => parseFeatureEntry(entry));
  const names = features.map((feature) => feature.name);

  if (new Set(names).size !== names.length) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} lists a feature more than once`,
    );
  }

  if (!isSorted(names)) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} must list features sorted by name`,
    );
  }

  return Object.freeze({
    version: FEATURES_MANIFEST_VERSION,
    features: Object.freeze(features),
  });
}

/**
 * @param {unknown} entry
 * @returns {Test262SupportedFeature}
 */
function parseFeatureEntry(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} entries must be objects`,
    );
  }

  const record = /** @type {Record<string, unknown>} */ (entry);

  requireExactKeys(record, FEATURE_KEYS, `${FEATURES_MANIFEST_FILE} entries`);

  const { name, probe, tests } = record;

  if (typeof name !== 'string' || name === '') {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} entries must name a non-empty feature`,
    );
  }

  if (typeof probe !== 'string' || probe.trim() === '') {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} entry ${name} must carry a non-empty probe`,
    );
  }

  if (!Array.isArray(tests) || tests.length === 0) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} entry ${name} must name the upstream tests that back it`,
    );
  }

  for (const test of tests) {
    if (typeof test !== 'string' || !test.startsWith('test/')) {
      throw new Test262FeatureManifestError(
        `${FEATURES_MANIFEST_FILE} entry ${name} lists ${String(
          test,
        )}, which is not an upstream test path`,
      );
    }
  }

  const paths = /** @type {string[]} */ (tests);

  if (new Set(paths).size !== paths.length) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} entry ${name} lists a test more than once`,
    );
  }

  if (!isSorted(paths)) {
    throw new Test262FeatureManifestError(
      `${FEATURES_MANIFEST_FILE} entry ${name} must list its tests sorted`,
    );
  }

  return Object.freeze({
    name,
    probe,
    tests: Object.freeze([...paths]),
  });
}

/**
 * @param {Record<string, unknown>} record
 * @param {readonly string[]} keys
 * @param {string} subject
 * @returns {void}
 */
function requireExactKeys(record, keys, subject) {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      throw new Test262FeatureManifestError(
        `${subject} carry an unknown key: ${key}`,
      );
    }
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Test262FeatureManifestError(`${subject} must declare ${key}`);
    }
  }
}

/**
 * @param {readonly string[]} values
 * @returns {boolean}
 */
function isSorted(values) {
  return values.join('\u0000') === sortStrings([...values]).join('\u0000');
}

/**
 * @param {Test262FeatureManifest} manifest
 * @returns {string[]}
 */
export function featureNames(manifest) {
  return manifest.features.map((feature) => feature.name);
}

/**
 * Resolves which features a Test262 run should treat as supported. An explicit
 * CLI list — even an empty one — always wins outright, exactly like
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

  return featureNames(parseFeatureManifest(manifestText));
}

/**
 * Renders a feature's probe as a Test262 file: a `raw` test, so no harness code
 * runs and the probe is the only thing under test, tagged with the feature it
 * claims. Driven through the shared runner, this exercises the feature gate end
 * to end — the probe earns exactly the skip decision a real upstream test
 * carrying that tag would earn.
 *
 * @param {Test262SupportedFeature} feature
 * @returns {string}
 */
export function featureProbeTestSource(feature) {
  return [
    '/*---',
    `description: behavioural probe for supported feature ${feature.name}`,
    `features: [${feature.name}]`,
    'flags: [raw]',
    '---*/',
    feature.probe,
    '',
  ].join('\n');
}

/**
 * Executes a feature's probe against a real engine in a fresh realm and reports
 * what actually happened. This is the difference between a manifest that claims
 * support and one that demonstrates it: `completed` means the engine really ran
 * the probe, and every other outcome names how the claim failed.
 *
 * @param {{ engine: Test262Engine, feature: Test262SupportedFeature }} options
 * @returns {{ name: string, outcome: Test262ProbeOutcome, message: string }}
 */
export function runFeatureProbe(options) {
  const { engine, feature } = options;
  /** @type {{ type: string, value: unknown }} */
  let completion;

  try {
    completion = engine.evaluateScript(engine.createRealm(), feature.probe);
  } catch (error) {
    return {
      name: feature.name,
      outcome: error instanceof SyntaxError ? 'parse-error' : 'engine-error',
      message: describeError(error),
    };
  }

  if (completion.type === 'throw') {
    return {
      name: feature.name,
      outcome: 'threw',
      message: describeThrown(completion.value),
    };
  }

  return { name: feature.name, outcome: 'completed', message: '' };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeThrown(value) {
  return typeof value === 'string' ? value : String(value);
}
