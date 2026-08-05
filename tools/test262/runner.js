/**
 * Portable Test262 execution semantics.
 *
 * This module owns everything that must behave identically on every host:
 * metadata-driven skips, variant expansion, harness include loading, negative
 * parse/runtime expectations, and record shapes. It touches no host API — file
 * access arrives through an injected `Test262Host`, and the engine arrives
 * through an injected `{ createRealm, evaluateScript }` pair — so Node,
 * JavaScriptCore, and browser adapters can stay thin and cannot drift apart on
 * test semantics.
 *
 * Each (file, variant) pair runs in its own realm. Includes are evaluated as
 * separate scripts before the test source, in declaration order, so a broken
 * harness file is reported as a harness error instead of masquerading as a
 * test failure.
 */

import {
  DEFAULT_INCLUDES,
  Test262MetadataError,
  expandVariants,
  parseTest262Metadata,
  resolveIncludes,
} from './metadata.js';
import { createSummaryRecord, createTestRecord } from './report.js';

export { DEFAULT_INCLUDES };

/**
 * @typedef {import('./metadata.js').Test262Metadata} Test262Metadata
 * @typedef {import('./metadata.js').Test262Variant} Test262Variant
 * @typedef {import('./report.js').Test262TestRecord} Test262TestRecord
 * @typedef {import('./report.js').Test262SummaryRecord} Test262SummaryRecord
 *
 * @typedef {{
 *   readTest(file: string): string | Promise<string>,
 *   readInclude(name: string): string | Promise<string>,
 *   readManifest?: () => string | Promise<string>,
 *   listTests?: () => readonly string[] | Promise<readonly string[]>,
 * }} Test262Host
 *
 * @typedef {{
 *   createRealm(): any,
 *   evaluateScript(realm: any, source: string): { type: string, value: unknown },
 * }} Test262Engine
 *
 * @typedef {{
 *   supportedFeatures?: readonly string[],
 *   skipFeatures?: readonly string[],
 * }} Test262SkipOptions
 *
 * @typedef {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   paths: readonly string[],
 *   supportedFeatures?: readonly string[],
 *   skipFeatures?: readonly string[],
 * }} Test262SuiteOptions
 */

/**
 * Flags describing behaviour this engine cannot honour yet. A test carrying
 * one of them is skipped rather than run, because running it would report a
 * failure that says nothing about the engine's actual conformance.
 */
export const UNSUPPORTED_FLAGS = Object.freeze([
  'module',
  'async',
  'CanBlockIsFalse',
  'CanBlockIsTrue',
  'non-deterministic',
]);

const STRICT_DIRECTIVE = '"use strict";\n';

/**
 * Orders test paths by code unit. `Array.prototype.sort`'s default comparator
 * is already code-unit based, but it is spelled out here so the report order
 * never depends on a host's locale collation.
 *
 * @param {readonly string[]} paths
 * @returns {string[]}
 */
export function sortTestPaths(paths) {
  return sortStrings(paths);
}

/**
 * @param {readonly string[]} values
 * @returns {string[]}
 */
function sortStrings(values) {
  return [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

/**
 * Decides whether a test runs at all. Explicit exclusions win over the
 * supported-feature allowlist so a known-broken feature can be silenced
 * without editing the allowlist.
 *
 * @param {Test262Metadata} metadata
 * @param {Test262SkipOptions} [options]
 * @returns {{ reason: string, message: string } | null}
 */
export function decideSkip(metadata, options = {}) {
  const supportedFeatures = options.supportedFeatures ?? [];
  const skipFeatures = options.skipFeatures ?? [];
  const flag = metadata.flags.find((name) => UNSUPPORTED_FLAGS.includes(name));

  if (flag !== undefined) {
    return { reason: 'unsupported-flag', message: `unsupported flag: ${flag}` };
  }

  const excluded = sortStrings(
    metadata.features.filter((name) => skipFeatures.includes(name)),
  );

  if (excluded.length > 0) {
    return {
      reason: 'excluded-feature',
      message: `excluded features: ${excluded.join(', ')}`,
    };
  }

  const unsupported = sortStrings(
    metadata.features.filter((name) => !supportedFeatures.includes(name)),
  );

  if (unsupported.length > 0) {
    return {
      reason: 'unsupported-feature',
      message: `unsupported features: ${unsupported.join(', ')}`,
    };
  }

  return null;
}

/**
 * @param {Test262SuiteOptions} options
 * @returns {Promise<{ records: readonly Test262TestRecord[], summary: Test262SummaryRecord }>}
 */
export async function runTest262Suite(options) {
  /** @type {Test262TestRecord[]} */
  const records = [];

  for (const file of sortTestPaths(options.paths)) {
    const fileRecords = await runTest262File({ ...options, file });
    records.push(...fileRecords);
  }

  return {
    records: Object.freeze(records),
    summary: createSummaryRecord(records),
  };
}

/**
 * @param {Omit<Test262SuiteOptions, 'paths'> & { file: string }} options
 * @returns {Promise<Test262TestRecord[]>}
 */
export async function runTest262File(options) {
  const { engine, host, file } = options;
  /** @type {string} */
  let source;

  try {
    source = await host.readTest(file);
  } catch (error) {
    return [
      createTestRecord({
        file,
        status: 'failed',
        reason: 'load-error',
        message: describeHostError(error),
      }),
    ];
  }

  /** @type {Test262Metadata} */
  let metadata;

  try {
    metadata = parseTest262Metadata(source);
  } catch (error) {
    if (error instanceof Test262MetadataError) {
      return [
        createTestRecord({
          file,
          status: 'failed',
          reason: 'metadata-error',
          message: error.message,
        }),
      ];
    }

    throw error;
  }

  const skip = decideSkip(metadata, options);

  if (skip !== null) {
    return [
      createTestRecord({
        file,
        status: 'skipped',
        reason: skip.reason,
        message: skip.message,
        features: metadata.features,
      }),
    ];
  }

  const includes = resolveIncludes(metadata);
  /** @type {Test262TestRecord[]} */
  const records = [];

  for (const variant of expandVariants(metadata)) {
    records.push(
      await runVariant({
        engine,
        host,
        file,
        source,
        metadata,
        variant,
        includes,
      }),
    );
  }

  return records;
}

/**
 * @param {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   file: string,
 *   source: string,
 *   metadata: Test262Metadata,
 *   variant: Test262Variant,
 *   includes: readonly string[],
 * }} options
 * @returns {Promise<Test262TestRecord>}
 */
async function runVariant({
  engine,
  host,
  file,
  source,
  metadata,
  variant,
  includes,
}) {
  const features = metadata.features;
  /**
   * @param {string} reason
   * @param {string} message
   * @returns {Test262TestRecord}
   */
  const failed = (reason, message) =>
    createTestRecord({
      file,
      variant,
      status: 'failed',
      reason,
      message,
      features,
    });

  const realm = engine.createRealm();

  for (const name of includes) {
    /** @type {string} */
    let includeSource;

    try {
      includeSource = await host.readInclude(name);
    } catch (error) {
      return failed(
        'load-error',
        `cannot load include ${name}: ${describeHostError(error)}`,
      );
    }

    /** @type {{ type: string, value: unknown }} */
    let includeResult;

    try {
      includeResult = engine.evaluateScript(realm, includeSource);
    } catch (error) {
      return failed(
        'harness-error',
        `include ${name} failed: ${describeHostError(error)}`,
      );
    }

    if (includeResult.type === 'throw') {
      return failed(
        'harness-error',
        `include ${name} threw: ${describeGuestValue(includeResult.value)}`,
      );
    }
  }

  const testSource =
    variant === 'strict' ? `${STRICT_DIRECTIVE}${source}` : source;
  /** @type {{ phase: 'parse' | 'runtime' | null, error?: Error, value?: unknown }} */
  let outcome;

  try {
    const result = engine.evaluateScript(realm, testSource);
    outcome =
      result.type === 'throw'
        ? { phase: 'runtime', value: result.value }
        : { phase: null };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      return failed('engine-error', describeHostError(error));
    }

    outcome = { phase: 'parse', error };
  }

  const negative = metadata.negative;

  if (negative === null) {
    if (outcome.phase === null) {
      return createTestRecord({ file, variant, status: 'passed', features });
    }

    if (outcome.phase === 'parse') {
      return failed('parse-error', describeHostError(outcome.error));
    }

    return failed('unexpected-throw', describeGuestValue(outcome.value));
  }

  if (outcome.phase === null) {
    return failed(
      'expected-error-not-thrown',
      `expected a ${negative.phase}-phase ${negative.type}`,
    );
  }

  if (outcome.phase !== negative.phase) {
    return failed(
      'wrong-error-phase',
      `expected a ${negative.phase}-phase error, got a ${outcome.phase}-phase error`,
    );
  }

  if (outcome.phase === 'parse') {
    const name = outcome.error instanceof Error ? outcome.error.name : 'Error';

    return name === negative.type
      ? createTestRecord({ file, variant, status: 'passed', features })
      : failed('wrong-error-type', `expected ${negative.type}, got ${name}`);
  }

  const match = matchErrorType(realm, outcome.value, negative.type);

  if (match === 'unresolved') {
    return failed(
      'unresolved-error-type',
      `${negative.type} is not a constructor binding in the test realm`,
    );
  }

  return match === 'match'
    ? createTestRecord({ file, variant, status: 'passed', features })
    : failed(
        'wrong-error-type',
        `expected ${negative.type}, got ${describeGuestValue(outcome.value)}`,
      );
}

/**
 * Classifies a thrown guest value against a Test262 `negative.type` name.
 *
 * Test262 names the expected error by its *constructor binding* in the test
 * realm (`Test262Error` comes from `sta.js`, `TypeError` from the engine's
 * globals), so this resolves that binding and walks the thrown value's
 * prototype chain. It deliberately does not read a `name` property: ES5
 * function objects have no `name`, and a guest-controlled `name` could
 * otherwise turn a wrong error into a false pass.
 *
 * @param {any} realm
 * @param {unknown} value
 * @param {string} typeName
 * @returns {'match' | 'mismatch' | 'unresolved'}
 */
function matchErrorType(realm, value, typeName) {
  const globalObject = realm === null ? null : realm?.globalObject;

  if (!isGuestObject(globalObject)) {
    return 'unresolved';
  }

  const constructor = readGuestProperty(globalObject, typeName);

  if (!isGuestObject(constructor)) {
    return 'unresolved';
  }

  const prototype = readGuestProperty(constructor, 'prototype');

  if (!isGuestObject(prototype)) {
    return 'unresolved';
  }

  if (!isGuestObject(value)) {
    return 'mismatch';
  }

  let current = value.getPrototype();

  while (isGuestObject(current)) {
    if (current === prototype) {
      return 'match';
    }

    current = current.getPrototype();
  }

  return 'mismatch';
}

/**
 * @param {unknown} value
 * @returns {value is { get(name: string): unknown, getPrototype(): unknown }}
 */
function isGuestObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {any} */ (value).get) === 'function' &&
    typeof (/** @type {any} */ (value).getPrototype) === 'function'
  );
}

/**
 * @param {{ get(name: string): unknown }} object
 * @param {string} name
 * @returns {unknown}
 */
function readGuestProperty(object, name) {
  try {
    return object.get(name);
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeGuestValue(value) {
  if (isGuestObject(value)) {
    const message = readGuestProperty(value, 'message');

    return typeof message === 'string'
      ? `guest object with message: ${message}`
      : 'guest object';
  }

  return typeof value === 'string' ? `guest string: ${value}` : String(value);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeHostError(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
