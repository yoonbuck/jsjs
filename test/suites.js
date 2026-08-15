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
import staticSemantics from './static-semantics.test.js';
import parser from './parser.test.js';
import runtimeRecords from './runtime-records.test.js';
import objects from './objects.test.js';
import objectHotPathIntegration from './object-hot-path-integration.test.js';
import abstractOperations from './abstract-operations.test.js';
import environments from './environments.test.js';
import identifierReadFastPath from './identifier-read-fast-path.test.js';
import realms from './realms.test.js';
import evaluatorExpressions from './evaluator-expressions.test.js';
import evaluatorStatements from './evaluator-statements.test.js';
import withStatements from './with-statement.test.js';
import functions from './functions.test.js';
import functionParameters from './function-parameters.test.js';
import objectArrayLiterals from './object-array-literals.test.js';
import spread from './spread.test.js';
import enhancedObjectLiterals from './enhanced-object-literals.test.js';
import templateLiterals from './template-literals.test.js';
import arrowFunctions from './arrow-functions.test.js';
import classes from './classes.test.js';
import test262Runner from './test262-runner.test.js';
import test262Async from './test262-async.test.js';
import es5Selection from './es5-selection.test.js';
import errors from './errors.test.js';
import tryStatements from './try-statements.test.js';
import switchLabels from './switch-labels.test.js';
import lexicalDeclarations from './lexical-declarations.test.js';
import stackOverflow from './stack-overflow.test.js';
import updateAssignment from './update-assignment.test.js';
import inInstanceof from './in-instanceof.test.js';
import strictMode from './strict-mode.test.js';
import evalCode from './eval.test.js';
import dynamicFunction from './dynamic-function.test.js';
import deleteOperator from './delete.test.js';
import dateArithmetic from './date-arithmetic.test.js';
import dateBuiltins from './date-builtins.test.js';
import nativeBuiltins from './native-builtins.test.js';
import objectBuiltins from './object-builtins.test.js';
import functionBuiltins from './function-builtins.test.js';
import arrayBuiltins from './array-builtins.test.js';
import primitiveWrappers from './primitive-wrappers.test.js';
import symbols from './symbols.test.js';
import booleanBuiltins from './boolean-builtins.test.js';
import numberBuiltins from './number-builtins.test.js';
import numberFormatting from './number-formatting.test.js';
import stringBuiltins from './string-builtins.test.js';
import stringSearch from './string-search.test.js';
import stringCase from './string-case.test.js';
import stringPattern from './string-pattern.test.js';
import regexpSyntax from './regexp-syntax.test.js';
import regexpBuiltins from './regexp-builtins.test.js';
import regexpExec from './regexp-exec.test.js';
import stringRegexp from './string-regexp.test.js';
import mathBuiltins from './math-builtins.test.js';
import numericGlobals from './numeric-globals.test.js';
import uriGlobals from './uri-globals.test.js';
import jsonParse from './json-parse.test.js';
import jsonStringify from './json-stringify.test.js';
import es2015ObjectFunction from './es2015-object-function.test.js';
import iterators from './iterators.test.js';
import forOf from './for-of.test.js';
import destructuring from './destructuring.test.js';
import es2015RuntimeIntegration from './es2015-runtime-integration.test.js';
import es2015SyntaxIntegration from './es2015-syntax-integration.test.js';
import benchmarkCore from './benchmark-core.test.js';
import profilingCore from './profiling-core.test.js';
import arrayIndex from './array-index.test.js';
import jobs from './jobs.test.js';
import functionRealm from './function-realm.test.js';
import promiseCore from './promise-core.test.js';
import promiseReactions from './promise-reactions.test.js';
import promiseCombinators from './promise-combinators.test.js';
import generatorRuntime from './generator-runtime.test.js';
import generatorYield from './generator-yield.test.js';
import generatorStack from './generator-stack.test.js';

/**
 * @typedef {import('./harness/runner.js').TestCase} TestCase
 * @typedef {{ file: string, tests: readonly TestCase[] }} TestSuite
 */

/** @type {readonly TestSuite[]} */
export const PORTABLE_SUITES = Object.freeze([
  Object.freeze({ file: 'test/foundation.test.js', tests: foundation }),
  Object.freeze({
    file: 'test/static-semantics.test.js',
    tests: staticSemantics,
  }),
  Object.freeze({ file: 'test/parser.test.js', tests: parser }),
  Object.freeze({
    file: 'test/runtime-records.test.js',
    tests: runtimeRecords,
  }),
  Object.freeze({ file: 'test/objects.test.js', tests: objects }),
  Object.freeze({
    file: 'test/object-hot-path-integration.test.js',
    tests: objectHotPathIntegration,
  }),
  Object.freeze({
    file: 'test/abstract-operations.test.js',
    tests: abstractOperations,
  }),
  Object.freeze({ file: 'test/environments.test.js', tests: environments }),
  Object.freeze({
    file: 'test/identifier-read-fast-path.test.js',
    tests: identifierReadFastPath,
  }),
  Object.freeze({ file: 'test/realms.test.js', tests: realms }),
  Object.freeze({
    file: 'test/evaluator-expressions.test.js',
    tests: evaluatorExpressions,
  }),
  Object.freeze({
    file: 'test/evaluator-statements.test.js',
    tests: evaluatorStatements,
  }),
  Object.freeze({
    file: 'test/with-statement.test.js',
    tests: withStatements,
  }),
  Object.freeze({ file: 'test/functions.test.js', tests: functions }),
  Object.freeze({
    file: 'test/function-parameters.test.js',
    tests: functionParameters,
  }),
  Object.freeze({
    file: 'test/object-array-literals.test.js',
    tests: objectArrayLiterals,
  }),
  Object.freeze({ file: 'test/spread.test.js', tests: spread }),
  Object.freeze({
    file: 'test/enhanced-object-literals.test.js',
    tests: enhancedObjectLiterals,
  }),
  Object.freeze({
    file: 'test/template-literals.test.js',
    tests: templateLiterals,
  }),
  Object.freeze({
    file: 'test/arrow-functions.test.js',
    tests: arrowFunctions,
  }),
  Object.freeze({ file: 'test/classes.test.js', tests: classes }),
  Object.freeze({
    file: 'test/test262-runner.test.js',
    tests: test262Runner,
  }),
  Object.freeze({
    file: 'test/test262-async.test.js',
    tests: test262Async,
  }),
  Object.freeze({
    file: 'test/es5-selection.test.js',
    tests: es5Selection,
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
    file: 'test/lexical-declarations.test.js',
    tests: lexicalDeclarations,
  }),
  Object.freeze({
    file: 'test/stack-overflow.test.js',
    tests: stackOverflow,
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
    file: 'test/eval.test.js',
    tests: evalCode,
  }),
  Object.freeze({
    file: 'test/dynamic-function.test.js',
    tests: dynamicFunction,
  }),
  Object.freeze({
    file: 'test/delete.test.js',
    tests: deleteOperator,
  }),
  Object.freeze({
    file: 'test/date-arithmetic.test.js',
    tests: dateArithmetic,
  }),
  Object.freeze({
    file: 'test/date-builtins.test.js',
    tests: dateBuiltins,
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
    file: 'test/symbols.test.js',
    tests: symbols,
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
  Object.freeze({
    file: 'test/string-search.test.js',
    tests: stringSearch,
  }),
  Object.freeze({
    file: 'test/string-case.test.js',
    tests: stringCase,
  }),
  Object.freeze({
    file: 'test/string-pattern.test.js',
    tests: stringPattern,
  }),
  Object.freeze({
    file: 'test/regexp-syntax.test.js',
    tests: regexpSyntax,
  }),
  Object.freeze({
    file: 'test/regexp-builtins.test.js',
    tests: regexpBuiltins,
  }),
  Object.freeze({
    file: 'test/regexp-exec.test.js',
    tests: regexpExec,
  }),
  Object.freeze({
    file: 'test/string-regexp.test.js',
    tests: stringRegexp,
  }),
  Object.freeze({
    file: 'test/math-builtins.test.js',
    tests: mathBuiltins,
  }),
  Object.freeze({
    file: 'test/numeric-globals.test.js',
    tests: numericGlobals,
  }),
  Object.freeze({
    file: 'test/uri-globals.test.js',
    tests: uriGlobals,
  }),
  Object.freeze({
    file: 'test/json-parse.test.js',
    tests: jsonParse,
  }),
  Object.freeze({
    file: 'test/json-stringify.test.js',
    tests: jsonStringify,
  }),
  Object.freeze({
    file: 'test/es2015-object-function.test.js',
    tests: es2015ObjectFunction,
  }),
  Object.freeze({
    file: 'test/iterators.test.js',
    tests: iterators,
  }),
  Object.freeze({
    file: 'test/for-of.test.js',
    tests: forOf,
  }),
  Object.freeze({
    file: 'test/destructuring.test.js',
    tests: destructuring,
  }),
  Object.freeze({
    file: 'test/es2015-runtime-integration.test.js',
    tests: es2015RuntimeIntegration,
  }),
  Object.freeze({
    file: 'test/es2015-syntax-integration.test.js',
    tests: es2015SyntaxIntegration,
  }),
  Object.freeze({
    file: 'test/benchmark-core.test.js',
    tests: benchmarkCore,
  }),
  Object.freeze({
    file: 'test/profiling-core.test.js',
    tests: profilingCore,
  }),
  Object.freeze({
    file: 'test/array-index.test.js',
    tests: arrayIndex,
  }),
  Object.freeze({ file: 'test/jobs.test.js', tests: jobs }),
  Object.freeze({
    file: 'test/function-realm.test.js',
    tests: functionRealm,
  }),
  Object.freeze({
    file: 'test/promise-core.test.js',
    tests: promiseCore,
  }),
  Object.freeze({
    file: 'test/promise-reactions.test.js',
    tests: promiseReactions,
  }),
  Object.freeze({
    file: 'test/promise-combinators.test.js',
    tests: promiseCombinators,
  }),
  Object.freeze({
    file: 'test/generator-runtime.test.js',
    tests: generatorRuntime,
  }),
  Object.freeze({
    file: 'test/generator-yield.test.js',
    tests: generatorYield,
  }),
  Object.freeze({
    file: 'test/generator-stack.test.js',
    tests: generatorStack,
  }),
]);
