/**
 * The registry of portable test suites.
 *
 * Every suite listed here runs unchanged in Node, in headless Chromium, and in
 * the `jsc` shell, so all three runners (`run-node.js`, `run-browser.js`,
 * `run-jsc.js`) take their default work from this one list instead of each
 * keeping its own. The imports are static because the `jsc` shell has no
 * directory listing and no argument vector: a checked-in list is the only way
 * it can know what to run.
 *
 * Suites that need host APIs live in `test/node/` and are registered by
 * `run-node.js` alone. `test/node/repository-invariants.test.js` fails if a
 * suite file exists that no runner registers.
 */

import foundation from './foundation.test.js';
import parser from './parser.test.js';
import runtimeRecords from './runtime-records.test.js';
import objects from './objects.test.js';
import abstractOperations from './abstract-operations.test.js';
import environments from './environments.test.js';
import realms from './realms.test.js';
import evaluatorExpressions from './evaluator-expressions.test.js';
import evaluatorStatements from './evaluator-statements.test.js';
import functions from './functions.test.js';
import objectArrayLiterals from './object-array-literals.test.js';
import test262Runner from './test262-runner.test.js';
import errors from './errors.test.js';
import tryStatements from './try-statements.test.js';
import switchLabels from './switch-labels.test.js';
import updateAssignment from './update-assignment.test.js';
import inInstanceof from './in-instanceof.test.js';
import strictMode from './strict-mode.test.js';
import deleteOperator from './delete.test.js';
import nativeBuiltins from './native-builtins.test.js';
import objectBuiltins from './object-builtins.test.js';
import functionBuiltins from './function-builtins.test.js';
import arrayBuiltins from './array-builtins.test.js';
import primitiveWrappers from './primitive-wrappers.test.js';
import booleanBuiltins from './boolean-builtins.test.js';
import numberBuiltins from './number-builtins.test.js';
import numberFormatting from './number-formatting.test.js';
import stringBuiltins from './string-builtins.test.js';

/**
 * @typedef {import('./harness/runner.js').TestCase} TestCase
 * @typedef {{ file: string, tests: readonly TestCase[] }} TestSuite
 */

/** @type {readonly TestSuite[]} */
export const PORTABLE_SUITES = Object.freeze([
  Object.freeze({ file: 'test/foundation.test.js', tests: foundation }),
  Object.freeze({ file: 'test/parser.test.js', tests: parser }),
  Object.freeze({
    file: 'test/runtime-records.test.js',
    tests: runtimeRecords,
  }),
  Object.freeze({ file: 'test/objects.test.js', tests: objects }),
  Object.freeze({
    file: 'test/abstract-operations.test.js',
    tests: abstractOperations,
  }),
  Object.freeze({ file: 'test/environments.test.js', tests: environments }),
  Object.freeze({ file: 'test/realms.test.js', tests: realms }),
  Object.freeze({
    file: 'test/evaluator-expressions.test.js',
    tests: evaluatorExpressions,
  }),
  Object.freeze({
    file: 'test/evaluator-statements.test.js',
    tests: evaluatorStatements,
  }),
  Object.freeze({ file: 'test/functions.test.js', tests: functions }),
  Object.freeze({
    file: 'test/object-array-literals.test.js',
    tests: objectArrayLiterals,
  }),
  Object.freeze({
    file: 'test/test262-runner.test.js',
    tests: test262Runner,
  }),
  Object.freeze({ file: 'test/errors.test.js', tests: errors }),
  Object.freeze({
    file: 'test/try-statements.test.js',
    tests: tryStatements,
  }),
  Object.freeze({
    file: 'test/switch-labels.test.js',
    tests: switchLabels,
  }),
  Object.freeze({
    file: 'test/update-assignment.test.js',
    tests: updateAssignment,
  }),
  Object.freeze({
    file: 'test/in-instanceof.test.js',
    tests: inInstanceof,
  }),
  Object.freeze({
    file: 'test/strict-mode.test.js',
    tests: strictMode,
  }),
  Object.freeze({
    file: 'test/delete.test.js',
    tests: deleteOperator,
  }),
  Object.freeze({
    file: 'test/native-builtins.test.js',
    tests: nativeBuiltins,
  }),
  Object.freeze({
    file: 'test/object-builtins.test.js',
    tests: objectBuiltins,
  }),
  Object.freeze({
    file: 'test/function-builtins.test.js',
    tests: functionBuiltins,
  }),
  Object.freeze({
    file: 'test/array-builtins.test.js',
    tests: arrayBuiltins,
  }),
  Object.freeze({
    file: 'test/primitive-wrappers.test.js',
    tests: primitiveWrappers,
  }),
  Object.freeze({
    file: 'test/boolean-builtins.test.js',
    tests: booleanBuiltins,
  }),
  Object.freeze({
    file: 'test/number-builtins.test.js',
    tests: numberBuiltins,
  }),
  Object.freeze({
    file: 'test/number-formatting.test.js',
    tests: numberFormatting,
  }),
  Object.freeze({
    file: 'test/string-builtins.test.js',
    tests: stringBuiltins,
  }),
]);
