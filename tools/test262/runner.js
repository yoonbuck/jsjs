/**
 * Portable Test262 execution semantics.
 *
 * This module owns everything that must behave identically on every host:
 * metadata-driven skips, variant expansion, harness include loading, negative
 * parse/runtime expectations, and record shapes. Which tests run is decided by
 * `selection.js`, which this module drives so no adapter has to. It touches no
 * host API — file access arrives through an injected `Test262Host`, and the
 * engine arrives through an injected Test262 engine bridge — so Node,
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
import {
  createSummaryRecord,
  createTestRecord,
  formatReportLines,
} from './report.js';
import {
  isTest262FixtureDependencyPath,
  resolveTest262Paths,
  sortStrings,
  sortTestPaths,
} from './selection.js';
import { resolveTest262ModulePath } from './module-paths.js';

export { DEFAULT_INCLUDES };

/**
 * @typedef {import('./metadata.js').Test262Metadata} Test262Metadata
 * @typedef {import('./metadata.js').Test262Variant} Test262Variant
 * @typedef {import('./report.js').Test262TestRecord} Test262TestRecord
 * @typedef {import('./report.js').Test262SummaryRecord} Test262SummaryRecord
 * @typedef {{ type: string, value: unknown }} CompletionRecord
 * @typedef {{
 *   processed: number,
 *   failures: readonly { error: unknown }[],
 * }} JobDrainReport
 *
 * @typedef {{
 *   readTest(file: string): string | Promise<string>,
 *   readInclude(name: string): string | Promise<string>,
 *   readModule(file: string, referrer: string | null): string | Promise<string>,
 *   readManifest?: () => string | Promise<string>,
 *   listTests?: () => readonly string[] | Promise<readonly string[]>,
 * }} Test262Host
 *
 * @typedef {{
 *   phase: null,
 * } | {
 *   phase: 'parse',
 *   error: Error,
 * } | {
 *   phase: 'resolution' | 'runtime',
 *   value: unknown,
 * }} ModuleTest262Outcome
 *
 * @typedef {{
 *   createRealm(): any,
 *   evaluateScript(realm: any, source: string): CompletionRecord,
 *   evaluateModule?: (
 *     realm: any,
 *     source: string,
 *     identifier: string,
 *     host: {
 *       resolve(specifier: string, referrer: string | null): string,
 *       load(identifier: string): string | Promise<string>,
 *     },
 *   ) => Promise<ModuleTest262Outcome>,
 *   installDone?: (realm: any, onDone: (value: unknown) => void) => void,
 *   runJobs?: (realm: any) => JobDrainReport,
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
 *
 * @typedef {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   paths?: readonly string[],
 *   includeMalformed?: boolean,
 *   supportedFeatures?: readonly string[],
 *   skipFeatures?: readonly string[],
 * }} Test262RunOptions
 */

/**
 * Flags describing behaviour this engine cannot honour yet. A test carrying
 * one of them is skipped rather than run, because running it would report a
 * failure that says nothing about the engine's actual conformance.
 */
export const UNSUPPORTED_FLAGS = Object.freeze([
  'CanBlockIsFalse',
  'CanBlockIsTrue',
  'non-deterministic',
]);

const STRICT_DIRECTIVE = '"use strict";\n';
const STRICT_SHELL_INCLUDE = 'sm/non262-strict-shell.js';
const STRICT_SHELL_GLOBAL_REFERENCES = Object.freeze([
  ['globalThis.completesNormally', 'global.completesNormally'],
  ['globalThis.raisesException', 'global.raisesException'],
]);

/**
 * The pinned SpiderMonkey strict harness is an IIFE with an existing `global`
 * parameter, but two initializers use the later `globalThis` spelling. Rewrite
 * only those harness-owned references. The test source is never transformed
 * and no `globalThis` binding is installed in its Realm.
 *
 * @param {string} name
 * @param {string} source
 * @returns {string}
 */
function prepareHarnessSource(name, source) {
  if (name !== STRICT_SHELL_INCLUDE) {
    return source;
  }

  let prepared = source;
  for (const [
    reference,
    compatibleReference,
  ] of STRICT_SHELL_GLOBAL_REFERENCES) {
    prepared = prepared.replace(reference, compatibleReference);
  }
  return prepared;
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

  if (metadata.flags.includes('module') && metadata.flags.includes('async')) {
    return {
      reason: 'unsupported-flag-combination',
      message: 'unsupported flag combination: module and async',
    };
  }

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
 * Selects, runs, and formats in one shared step: the whole of what an adapter
 * does beyond file access and printing. Adapters call this rather than
 * `runTest262Suite` so selection, execution, and report formatting can never
 * differ between hosts.
 *
 * @param {Test262RunOptions} options
 * @returns {Promise<{
 *   records: readonly Test262TestRecord[],
 *   summary: Test262SummaryRecord,
 *   lines: string[],
 *   failed: number,
 * }>}
 */
export async function runTest262(options) {
  const paths = await resolveTest262Paths({
    host: options.host,
    paths: options.paths,
    includeMalformed: options.includeMalformed,
  });
  const { records, summary } = await runTest262Suite({
    engine: options.engine,
    host: options.host,
    paths,
    supportedFeatures: options.supportedFeatures,
    skipFeatures: options.skipFeatures,
  });

  return {
    records,
    summary,
    lines: formatReportLines([...records, summary]),
    failed: summary.failed,
  };
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

  if (isTest262FixtureDependencyPath(file)) {
    return [];
  }

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

  if (metadata.flags.includes('module')) {
    return runModuleVariant({
      engine,
      host,
      file,
      source,
      metadata,
      variant,
      includes,
      realm,
    });
  }

  if (metadata.flags.includes('async')) {
    return runAsyncVariant({
      engine,
      host,
      file,
      source,
      metadata,
      variant,
      includes,
      realm,
    });
  }

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
      includeResult = engine.evaluateScript(
        realm,
        prepareHarnessSource(name, includeSource),
      );
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

  return recordSynchronousOutcome({
    file,
    variant,
    features,
    realm,
    negative: metadata.negative,
    outcome,
  });
}

/**
 * Runs a static-module test after normal harness files have populated the
 * module Realm's global object.
 *
 * @param {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   file: string,
 *   source: string,
 *   metadata: Test262Metadata,
 *   variant: Test262Variant,
 *   includes: readonly string[],
 *   realm: any,
 * }} options
 * @returns {Promise<Test262TestRecord>}
 */
async function runModuleVariant({
  engine,
  host,
  file,
  source,
  metadata,
  variant,
  includes,
  realm,
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

  if (typeof engine.evaluateModule !== 'function') {
    return failed(
      'engine-error',
      'module Test262 execution requires an evaluateModule engine hook',
    );
  }

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
      includeResult = engine.evaluateScript(
        realm,
        prepareHarnessSource(name, includeSource),
      );
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

  /** @type {Map<string, string | null>} */
  const referrers = new Map();
  /** @type {ModuleTest262Outcome} */
  let outcome;

  try {
    outcome = await engine.evaluateModule(realm, source, file, {
      resolve(specifier, referrer) {
        if (referrer === null) {
          return file;
        }

        const identifier = resolveTest262ModulePath(specifier, referrer);

        if (!referrers.has(identifier)) {
          referrers.set(identifier, referrer);
        }

        return identifier;
      },
      load(identifier) {
        return host.readModule(identifier, referrers.get(identifier) ?? null);
      },
    });
  } catch (error) {
    return failed('engine-error', describeHostError(error));
  }

  return recordSynchronousOutcome({
    file,
    variant,
    features,
    realm,
    negative: metadata.negative,
    outcome,
  });
}

/**
 * Applies Test262's ordinary and negative-expectation record rules to a
 * synchronous script or static-module outcome.
 *
 * @param {{
 *   file: string,
 *   variant: Test262Variant,
 *   features: readonly string[],
 *   realm: any,
 *   negative: Test262Metadata['negative'],
 *   outcome: {
 *     phase: 'parse' | 'resolution' | 'runtime' | null,
 *     error?: Error,
 *     value?: unknown,
 *   },
 * }} options
 * @returns {Test262TestRecord}
 */
function recordSynchronousOutcome({
  file,
  variant,
  features,
  realm,
  negative,
  outcome,
}) {
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
 * Runs the Test262 async protocol entirely inside the guest engine. The single
 * checkpoint is intentional: Agent.runJobs drains jobs appended while it runs,
 * so no host Promise or timer is needed to observe guest completion.
 *
 * @param {{
 *   engine: Test262Engine,
 *   host: Test262Host,
 *   file: string,
 *   source: string,
 *   metadata: Test262Metadata,
 *   variant: Test262Variant,
 *   includes: readonly string[],
 *   realm: any,
 * }} options
 * @returns {Promise<Test262TestRecord>}
 */
async function runAsyncVariant({
  engine,
  host,
  file,
  source,
  metadata,
  variant,
  includes,
  realm,
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

  if (
    typeof engine.installDone !== 'function' ||
    typeof engine.runJobs !== 'function'
  ) {
    return failed(
      'engine-error',
      'async Test262 execution requires installDone and runJobs engine hooks',
    );
  }

  let doneCount = 0;
  /** @type {unknown} */
  let doneValue;

  try {
    engine.installDone(realm, (value) => {
      doneCount += 1;
      doneValue = value;
    });
  } catch (error) {
    return failed('engine-error', describeHostError(error));
  }

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
      includeResult = engine.evaluateScript(
        realm,
        prepareHarnessSource(name, includeSource),
      );
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

  if (negative !== null) {
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
      const name =
        outcome.error instanceof Error ? outcome.error.name : 'Error';

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

  if (outcome.phase === 'parse') {
    return failed('parse-error', describeHostError(outcome.error));
  }

  if (outcome.phase === 'runtime') {
    return failed('unexpected-throw', describeGuestValue(outcome.value));
  }

  /** @type {JobDrainReport} */
  let jobReport;

  try {
    jobReport = engine.runJobs(realm);
  } catch (error) {
    return failed('engine-error', describeHostError(error));
  }

  if (
    jobReport === null ||
    typeof jobReport !== 'object' ||
    !Array.isArray(jobReport.failures)
  ) {
    return failed(
      'engine-error',
      'runJobs returned an invalid Job Drain report',
    );
  }

  if (jobReport.failures.length > 0) {
    return failed(
      'job-error',
      describeGuestValue(jobReport.failures[0]?.error),
    );
  }

  if (doneCount === 0) {
    return failed('async-incomplete', '$DONE was not called');
  }

  if (doneCount > 1) {
    return failed('async-duplicate', '$DONE was called more than once');
  }

  return doneValue === undefined
    ? createTestRecord({ file, variant, status: 'passed', features })
    : failed('async-error', describeGuestValue(doneValue));
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
