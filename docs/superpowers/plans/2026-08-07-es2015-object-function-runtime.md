# ES2015 Object and Function Runtime Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement issue #38 — the ES2015 runtime-level updates to objects and functions (property-key ordering, function `name`/`length`, method `[[HomeObject]]`/`super`, non-constructible methods, `Object.setPrototypeOf`/`Object.is`) — using only already-ES5-parseable syntax plus one narrowly-scoped `super` grammar addition, while preserving full ES5 conformance.

**Architecture:** Each ES2015 semantic lands as a small, additive change to the existing runtime/evaluator/builtins layering described in `docs/architecture.md`: `EngineObject`/`EngineFunction` gain new internal behavior, `createFunctionObject` grows an additive `options` parameter so every existing call site keeps working unchanged until the task that updates it, and one new runtime module (`src/runtime/super-reference.js`) adds the receiver-aware property resolution `super` needs without touching ordinary `[[Get]]`/`[[Put]]`. The `super` keyword itself is unlocked by overriding exactly one Acorn tokenizer method so the text `super` becomes the `_super` keyword token at `ecmaVersion: 5` too — Acorn's own `Super`-node parsing, `allowSuper` scope tracking (already true inside `get`/`set` accessor bodies via `parseMethod`), and early errors are otherwise untouched, so no other ES6 grammar becomes reachable.

**Tech Stack:** Plain ES2020 JavaScript with JSDoc types, Acorn (vendored, `ecmaVersion: 5`), Node's built-in test harness convention used by this repo (`test/harness/runner.js`, `test/harness/assert.js`), Test262 (pinned checkout at `vendor/test262`, already present in this workspace at the pinned revision `b363f29d3c43c626dc852744ad64a0b48a003693`).

## Global Constraints

- Every file under `src/` must stay host-neutral: no `node:`/browser/`jsc`-specific API, and the parser is reached only through `src/parser-dependency.js` (enforced by `test/node/repository-invariants.test.js`).
- ES5 conformance must not regress: every existing suite in `test/suites.js`, the Test262 fixture suite, and the pinned upstream ES5 subset must keep passing.
- Do not touch `tools/test262/es5-selection.json`, `tools/test262/upstream-subset.json`, or the parser's global `ecmaVersion` — those are shared with sibling issues #41/#43 and reconciled later in #45.
- No new runtime dependency; only the already-vendored Acorn build.
- Follow the existing code style: JSDoc on every exported function/class, `throwOnError`-style guest-error rejection via `GuestErrorSignal`, and no placeholder comments.
- Every task ends with `npm run test:node` passing (fast local signal); the final task additionally runs `npm run test:browser`, `npm run test:jsc`, and `npm run ci:contract`.
- `vendor/test262` already exists in this workspace at the pinned revision (verified: `git -C vendor/test262 rev-parse HEAD` reports `b363f29d3c43c626dc852744ad64a0b48a003693`, matching `package.json`'s `test262.revision`). Do not delete it.
- Commit after each task with a `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` trailer.

---

## File Map

| File                                             | Change                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/runtime/object.js`                          | `EngineObject#ownPropertyKeys()` ES2015 ordering; new `EngineObject#setPrototypeOf`                    |
| `src/runtime/function-object.js`                 | `EngineFunction` gains `name`, `isMethod`, `homeObject`; `length`/`name` become `configurable: true`   |
| `src/builtins/shared.js`                         | `NativeFunction`'s `length`/`name` become `configurable: true`                                         |
| `src/evaluator/declarations.js`                  | `createFunctionObject` gains an `options` parameter; `evaluateVariableDeclaration` NamedEvaluation     |
| `src/evaluator/expressions.js`                   | Assignment/object-literal NamedEvaluation; method `[[HomeObject]]` wiring; `super` property evaluation |
| `src/builtins/function.js`                       | `BoundFunction`'s name becomes `"bound " + target.name`                                                |
| `src/parser.js`                                  | New Acorn plugin: `super` tokenizes as a keyword at `ecmaVersion: 5`                                   |
| `src/parser-dependency.js`                       | Re-export `tokTypes` alongside `parse`/`Parser`                                                        |
| `src/runtime/super-reference.js`                 | **New.** Receiver-aware property get/set used only by `super.prop`                                     |
| `src/builtins/object.js`                         | `Object.setPrototypeOf`, `Object.is`                                                                   |
| `test/es2015-object-function.test.js`            | **New.** Portable suite for every behavior above                                                       |
| `test/suites.js`                                 | Registers the new suite                                                                                |
| `test/ci/es2015-object-function-test262.test.js` | **New.** Focused upstream Test262 coverage                                                             |
| `test/run-ci-contract.js`                        | Registers the new Test262 suite                                                                        |
| `docs/conformance.md`                            | New "ES2015 focused coverage" section                                                                  |
| `docs/architecture.md`                           | Document `[[HomeObject]]`, `super`, the new ordering, and `Object.setPrototypeOf`/`is`                 |

---

### Task 1: ES2015 own-property-key order

**Files:**

- Modify: `src/runtime/object.js` (`EngineObject#ownPropertyKeys`, around line 66-70)
- Test: Create `test/es2015-object-function.test.js`
- Modify: `test/suites.js`

**Interfaces:**

- Consumes: nothing new (uses the existing `_properties` Map).
- Produces: `EngineObject#ownPropertyKeys()` now returns array-index string keys first (ascending numeric order), then every other key in creation order. Every caller (`Object.keys`, `Object.getOwnPropertyNames`, `enumerableKeysForIn`, `JSON.stringify`) is unchanged and inherits the new order automatically.

- [ ] **Step 1: Create the new test suite file with a failing test for key order**

```js
import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const result = evaluateScript(createRealm(), source);

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return result.value;
}

const tests = [
  {
    name: 'own property keys list array indices ascending before other keys, in creation order',
    run() {
      assertSame(
        run(
          "var o = {}; o.p1 = 'a'; o.p2 = 'b'; o[2] = 'c'; o[0] = 'd'; o[1] = 'e'; " +
            'Object.keys(o).join(",");',
        ),
        '0,1,2,p1,p2',
      );
    },
  },
];

export default tests;
```

- [ ] **Step 2: Register the suite**

Add the import and registry entry to `test/suites.js`, following the existing alphabetical-by-topic pattern (place it near `objects`/`object-array-literals`):

```js
import es2015ObjectFunction from './es2015-object-function.test.js';
```

```js
  Object.freeze({
    file: 'test/es2015-object-function.test.js',
    tests: es2015ObjectFunction,
  }),
```

Add this `Object.freeze({...})` entry as the last element of the `PORTABLE_SUITES` array (right after the `json-stringify` entry), so every existing entry stays untouched.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:node`
Expected: FAIL — `Object.keys(o).join(",")` currently returns `'p1,p2,2,0,1'` (raw `Map` insertion order), not `'0,1,2,p1,p2'`.

- [ ] **Step 4: Implement ES2015 key ordering in `EngineObject#ownPropertyKeys`**

In `src/runtime/object.js`, replace:

```js
  /**
   * @returns {PropertyKey[]}
   */
  ownPropertyKeys() {
    return [...this._properties.keys()];
  }
```

with:

```js
  /**
   * Implements ECMA-262 9.1.12 `OrdinaryOwnPropertyKeys`'s key order: every
   * array-index string key first, in ascending numeric order, then every
   * other key (this engine has no symbols yet, so that is exactly the
   * remaining string keys) in the order they were created. ES5 left this
   * order implementation-defined; ES2015 fixed it, and `Object.keys`,
   * `Object.getOwnPropertyNames`, `for-in` (via `enumerableKeysForIn`), and
   * `JSON.stringify` all read through this method, so they inherit the new
   * order without any change of their own. The non-index bucket needs no
   * extra sort: a `Map` already iterates in insertion order, so filtering it
   * preserves the relative creation order of the keys kept.
   *
   * @returns {PropertyKey[]}
   */
  ownPropertyKeys() {
    /** @type {PropertyKey[]} */
    const indexKeys = [];
    /** @type {PropertyKey[]} */
    const otherKeys = [];

    for (const key of this._properties.keys()) {
      if (isArrayIndexKey(key)) {
        indexKeys.push(key);
      } else {
        otherKeys.push(key);
      }
    }

    indexKeys.sort((left, right) => Number(left) - Number(right));

    return [...indexKeys, ...otherKeys];
  }
```

Add this module-level helper near the bottom of `src/runtime/object.js`, alongside the other free functions (e.g. right after `isPrimitive`):

```js
/**
 * Whether `key` is an ES2015 6.1.7 "array index": a String that is the
 * canonical decimal representation of an integer in `[0, 2^32 - 2]` (the
 * upper bound is exclusive of `4294967295`, which is a valid `length` value
 * but not a valid index). `String(index) === key` rejects non-canonical
 * forms — leading zeros other than `"0"` itself, `"1.0"`, `"-1"` — the same
 * way `toArrayIndex` in `array-object.js` does; this engine has no symbols
 * yet, so a non-string key is never an array index.
 *
 * @param {PropertyKey} key
 * @returns {boolean}
 */
function isArrayIndexKey(key) {
  if (typeof key !== 'string') {
    return false;
  }

  const index = Number(key);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 4294967295 &&
    String(index) === key
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/runtime/object.js test/es2015-object-function.test.js test/suites.js
git commit -m "feat: order own property keys per ES2015 OrdinaryOwnPropertyKeys

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Function `name`/`length` attributes

**Files:**

- Modify: `src/runtime/function-object.js` (`EngineFunction` constructor, `EngineFunctionOptions` typedef)
- Modify: `src/builtins/shared.js` (`NativeFunction` constructor)
- Modify: `src/evaluator/declarations.js` (`createFunctionObject`)
- Test: `test/es2015-object-function.test.js`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `EngineFunctionOptions` gains optional `name` (`string`, default `''`) and `isMethod` (`boolean`, default `false`). `EngineFunction` gets an own `name` property (`{value, writable:false, enumerable:false, configurable:true}`) and its `length`/`name` (and `NativeFunction`'s) both go from `configurable:false` to `configurable:true`. `createFunctionObject(node, scope, context, options = {})` — a new 4th parameter — accepts `{ name, isMethod, homeObject }` (all optional); `options.name` overrides the default (`node.id.name` if present, else `''`); every existing call site (which passes nothing) is unaffected. Later tasks consume `options.name`, `options.isMethod`, and `options.homeObject`.

- [ ] **Step 1: Write failing tests for name/length**

Append to the `tests` array in `test/es2015-object-function.test.js` (keep the existing entry above):

```js
  {
    name: 'function declarations and named expressions get a name property; anonymous expressions get ""',
    run() {
      assertSame(run('function f() {} f.name;'), 'f');
      assertSame(run('(function g() {}).name;'), 'g');
      assertSame(run('(function () {}).name;'), '');
    },
  },
  {
    name: 'name and length are configurable but not writable or enumerable',
    run() {
      assertSame(
        run(
          'function f(a, b) {} var d = Object.getOwnPropertyDescriptor(f, "name"); ' +
            'd.writable + "," + d.enumerable + "," + d.configurable;',
        ),
        'false,false,true',
      );
      assertSame(
        run(
          'function f(a, b) {} var d = Object.getOwnPropertyDescriptor(f, "length"); ' +
            'd.value + "," + d.writable + "," + d.enumerable + "," + d.configurable;',
        ),
        '2,false,false,true',
      );
    },
  },
  {
    name: 'the dynamic Function constructor names its function "anonymous"',
    run() {
      assertSame(run('(new Function("return 1;")).name;'), 'anonymous');
    },
  },
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL — `EngineFunction` has no `name` own property yet, so `f.name` is `undefined`, and `length`'s descriptor is `configurable: false`.

- [ ] **Step 3: Add `name`/`isMethod` to `EngineFunction`**

In `src/runtime/function-object.js`, update the `EngineFunctionOptions` typedef:

```js
 * @typedef {{
 *   realm: Realm,
 *   parameterNames: readonly string[],
 *   scope: EnvironmentRecordLike,
 *   strict: boolean,
 *   execute: FunctionBodyExecutor,
 *   name?: string,
 *   isMethod?: boolean,
 * }} EngineFunctionOptions
```

Update the constructor:

```js
  constructor({
    realm,
    parameterNames,
    scope,
    strict,
    execute,
    name = '',
    isMethod = false,
  }) {
    super(realm.intrinsics.functionPrototype, 'Function');

    /** @type {Realm} */
    this.realm = realm;
    /** @type {readonly string[]} */
    this.parameterNames = parameterNames;
    /** @type {EnvironmentRecordLike} */
    this.scope = scope;
    /** @type {boolean} */
    this.strict = strict;
    /** @type {boolean} */
    this._isConstructor = !isMethod;
    /** @type {FunctionBodyExecutor} */
    this._execute = execute;
    /** @type {EngineObject | undefined} */
    this.homeObject = undefined;

    this.defineOwnProperty('length', {
      value: parameterNames.length,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    this.defineOwnProperty('name', {
      value: name,
      writable: false,
      enumerable: false,
      configurable: true,
    });
```

(Leave the rest of the constructor — `prototype`, strict `caller`/`arguments` poison pills — unchanged; only the two `defineOwnProperty` calls shown change their `configurable` value and a `name` property is added right after `length`. `this.homeObject = undefined` is new state used starting in Task 5; leaving it here now keeps the field declared in one place.)

- [ ] **Step 4: Add `configurable: true` to `NativeFunction`**

In `src/builtins/shared.js`, in the `NativeFunction` constructor, change both:

```js
this.defineOwnProperty('length', {
  value: length,
  writable: false,
  enumerable: false,
  configurable: false,
});
this.defineOwnProperty('name', {
  value: name,
  writable: false,
  enumerable: false,
  configurable: false,
});
```

to `configurable: true` in both blocks (only the `configurable` value changes).

- [ ] **Step 5: Add the `options` parameter to `createFunctionObject`**

In `src/evaluator/declarations.js`, replace:

```js
export function createFunctionObject(node, scope, context) {
  /** @type {string[]} */
  const parameterNames = [];

  for (const parameter of node.params) {
    if (parameter.type !== 'Identifier') {
      // ES5 formal parameters are always plain identifiers; anything else
      // (destructuring, defaults, rest) is a later-edition form this
      // engine does not implement.
      throw createUnsupportedNodeError(parameter);
    }

    parameterNames.push(parameter.name);
  }

  // A function is strict when its enclosing scope is already strict OR when
  // the function's own body opens with a "use strict" directive prologue
  // (ECMA-262 10.1.1 — "once strict, always strict" applies transitively).
  const strict = context.strict || hasUseStrictDirective(node.body.body);

  return new EngineFunction({
    realm: context.realm,
    parameterNames,
    scope,
    strict,
    execute: (functionObject, thisValue, args) =>
      executeFunctionBody(node, functionObject, thisValue, args),
  });
}
```

with:

```js
/**
 * @typedef {{
 *   name?: string,
 *   isMethod?: boolean,
 *   homeObject?: import('../runtime/object.js').EngineObject,
 * }} CreateFunctionObjectOptions
 */

/**
 * @param {any} node
 * @param {import('../runtime/environment.js').EnvironmentRecordLike} scope
 * @param {EvaluationContext} context
 * @param {CreateFunctionObjectOptions} [options={}]
 * @returns {EngineFunction}
 */
export function createFunctionObject(node, scope, context, options = {}) {
  /** @type {string[]} */
  const parameterNames = [];

  for (const parameter of node.params) {
    if (parameter.type !== 'Identifier') {
      // ES5 formal parameters are always plain identifiers; anything else
      // (destructuring, defaults, rest) is a later-edition form this
      // engine does not implement.
      throw createUnsupportedNodeError(parameter);
    }

    parameterNames.push(parameter.name);
  }

  // A function is strict when its enclosing scope is already strict OR when
  // the function's own body opens with a "use strict" directive prologue
  // (ECMA-262 10.1.1 — "once strict, always strict" applies transitively).
  const strict = context.strict || hasUseStrictDirective(node.body.body);
  const name = options.name ?? (node.id ? node.id.name : '');

  const functionObject = new EngineFunction({
    realm: context.realm,
    parameterNames,
    scope,
    strict,
    name,
    isMethod: options.isMethod ?? false,
    execute: (functionObject, thisValue, args) =>
      executeFunctionBody(node, functionObject, thisValue, args),
  });

  if (options.homeObject !== undefined) {
    functionObject.homeObject = options.homeObject;
  }

  return functionObject;
}
```

(This is additive: every existing call — `instantiateFunctionObject`, `evalDeclarationInstantiation`, `evaluateFunctionExpression` in `expressions.js` ×2, the object-literal accessor in `evaluateObjectExpression`, and `createDynamicFunction` in `dynamic-function.js` — passes no 4th argument, so `options` defaults to `{}` and behavior is unchanged except that named functions/declarations now get a real `name` property from `node.id.name` and anonymous ones get `''`.)

Note why the dynamic-`Function` test in Step 1 already passes once this lands with no `dynamic-function.js` change: `createDynamicFunction` parses the synthesized source `` `function anonymous(${parameterText}\n) {\n${bodyText}\n}` `` (see `parseDynamicFunction` in `src/evaluator/dynamic-function.js`), so the resulting `FunctionDeclaration` node's `id.name` is literally `"anonymous"`, and the default-naming branch above (`node.id ? node.id.name : ''`) picks it up for free.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/runtime/function-object.js src/builtins/shared.js src/evaluator/declarations.js test/es2015-object-function.test.js
git commit -m "feat: add ES2015 function name/length attributes

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: `NamedEvaluation` for var declarators, assignment, and object-literal properties

**Files:**

- Modify: `src/evaluator/declarations.js` (`evaluateVariableDeclaration`; new `isAnonymousFunctionExpression` export)
- Modify: `src/evaluator/expressions.js` (`evaluateAssignmentExpression`, `evaluateObjectExpression`)
- Test: `test/es2015-object-function.test.js`

**Interfaces:**

- Consumes: `createFunctionObject(node, scope, context, options)` from Task 2.
- Produces: `isAnonymousFunctionExpression(node)` exported from `src/evaluator/declarations.js`, returning `node.type === 'FunctionExpression' && !node.id`. Used by both `declarations.js` and `expressions.js`.

- [ ] **Step 1: Write failing tests**

Append to `test/es2015-object-function.test.js`:

```js
  {
    name: 'NamedEvaluation infers a name for an anonymous function assigned to a variable',
    run() {
      assertSame(run('var f = function () {}; f.name;'), 'f');
      assertSame(run('var g = function named() {}; g.name;'), 'named');
    },
  },
  {
    name: 'NamedEvaluation infers a name for an anonymous function in a simple assignment',
    run() {
      assertSame(run('var f; f = function () {}; f.name;'), 'f');
      assertSame(
        run('var target; function assignIt() { target = function () {}; } assignIt(); target.name;'),
        'target',
      );
    },
  },
  {
    name: 'NamedEvaluation infers a name for an anonymous function used as an object literal property value',
    run() {
      assertSame(run('({foo: function () {}}).foo.name;'), 'foo');
      assertSame(run('({foo: function named() {}}).foo.name;'), 'named');
      assertSame(run('var o = {1: function () {}}; o[1].name;'), '1');
    },
  },
```

The first assertion (`f = function () {}` as a bare `ExpressionStatement` at top level) is `'f'`, not `''`: even though the statement's own value is discarded, the assignment still runs through `evaluateAssignmentExpression`, and a plain `=` assignment to a simple `Identifier` qualifies for `NamedEvaluation` regardless of whether anything uses the expression's result.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL on all three new tests (functions stay anonymous).

- [ ] **Step 3: Add `isAnonymousFunctionExpression` and wire the variable-declarator case**

In `src/evaluator/declarations.js`, add this export near `createFunctionObject` (e.g. right before it):

```js
/**
 * ECMA-262's `IsAnonymousFunctionDefinition`, restricted to the one AST shape
 * this ES5-syntax engine can produce it for: a `FunctionExpression` with no
 * `id`. (Arrow functions and class expressions, the grammar's other two
 * anonymous-definition shapes, are not implemented yet — see issue #25.)
 *
 * @param {any} node
 * @returns {boolean}
 */
export function isAnonymousFunctionExpression(node) {
  return node.type === 'FunctionExpression' && !node.id;
}
```

Then replace `evaluateVariableDeclaration`'s body:

```js
export function evaluateVariableDeclaration(node, context) {
  for (const declarator of node.declarations) {
    if (declarator.init) {
      // ES5.1 §12.2.1: evaluate the Identifier to a Reference *before* the
      // Initialiser, so a `with`-bound target captured here survives a
      // property the initializer deletes and PutValue writes back through it.
      const reference = getIdentifierReference(
        context.env,
        declarator.id.name,
        context.strict,
      );
      const value = isAnonymousFunctionExpression(declarator.init)
        ? createFunctionObject(declarator.init, context.env, context, {
            name: declarator.id.name,
          })
        : evaluateExpressionValue(declarator.init, context);
      putValue(reference, value);
    }
  }

  return createNormalCompletion(EMPTY);
}
```

(Only the `const value = ...` line changes from a single `evaluateExpressionValue` call to the conditional above; everything else in the function is unchanged.)

- [ ] **Step 4: Wire the assignment-expression case**

In `src/evaluator/expressions.js`, add `isAnonymousFunctionExpression` to the existing import from `./declarations.js`:

```js
import {
  createFunctionObject,
  isAnonymousFunctionExpression,
} from './declarations.js';
```

Then in `evaluateAssignmentExpression`, replace:

```js
if (node.operator === '=') {
  const value = evaluateExpressionValue(node.right, context);
  putValue(reference, value);
  return value;
}
```

with:

```js
if (node.operator === '=') {
  const value =
    node.left.type === 'Identifier' && isAnonymousFunctionExpression(node.right)
      ? createFunctionObject(node.right, context.env, context, {
          name: node.left.name,
        })
      : evaluateExpressionValue(node.right, context);
  putValue(reference, value);
  return value;
}
```

- [ ] **Step 5: Wire the object-literal `init`-kind property case**

In `src/evaluator/expressions.js`, in `evaluateObjectExpression`, replace:

```js
    if (property.kind === 'init') {
      object.defineOwnProperty(key, {
        value: evaluateExpressionValue(property.value, context),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      continue;
    }
```

with:

```js
    if (property.kind === 'init') {
      const value = isAnonymousFunctionExpression(property.value)
        ? createFunctionObject(property.value, context.env, context, {
            name: key,
          })
        : evaluateExpressionValue(property.value, context);

      object.defineOwnProperty(key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      continue;
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/evaluator/declarations.js src/evaluator/expressions.js test/es2015-object-function.test.js
git commit -m "feat: infer names for anonymous functions per NamedEvaluation

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: `Function.prototype.bind` name

**Files:**

- Modify: `src/builtins/function.js` (`BoundFunction` constructor)
- Test: `test/es2015-object-function.test.js`

**Interfaces:**

- Consumes: `EngineFunction`/`NativeFunction` `name` property from Task 2.
- Produces: no new exports; `BoundFunction`'s `name` is now `"bound " + <target's name, or "" if not a string>` instead of the fixed literal `"bound"`.

- [ ] **Step 1: Write failing tests**

Append to `test/es2015-object-function.test.js`:

```js
  {
    name: 'bound functions are named "bound " followed by the target function\'s name',
    run() {
      assertSame(run('function f() {} f.bind(null).name;'), 'bound f');
      assertSame(run('(function () {}).bind(null).name;'), 'bound ');
      assertSame(run('Function.prototype.bind.name;'), 'bind');
    },
  },
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL — `f.bind(null).name` is currently `'bound'` (no trailing name, no space+name).

- [ ] **Step 3: Compute the bound name from the target**

In `src/builtins/function.js`, in the `BoundFunction` constructor, replace:

```js
    super(realm, {
      name: 'bound',
      length,
```

with:

```js
    const targetName = target instanceof EngineObject ? target.get('name') : undefined;
    const boundName = `bound ${typeof targetName === 'string' ? targetName : ''}`;

    super(realm, {
      name: boundName,
      length,
```

(Everything else in the constructor — `call`, `construct`, the fields set after `super(...)` — is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/builtins/function.js test/es2015-object-function.test.js
git commit -m "feat: name bound functions per SetFunctionName's bound prefix

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Method `[[HomeObject]]` and non-constructible get/set methods

**Files:**

- Modify: `src/evaluator/expressions.js` (`evaluateObjectExpression`)
- Test: `test/es2015-object-function.test.js`

**Interfaces:**

- Consumes: `EngineFunction`'s `isMethod`/`homeObject` support and `createFunctionObject`'s `options` parameter (Task 2).
- Produces: object-literal `get`/`set` accessor functions now have `functionObject.homeObject === <the object literal>`, `isConstructor(accessor) === false`, and `name === "get " + key` / `"set " + key`. `EngineFunction.homeObject` (already declared as a field in Task 2) is consumed starting here; no further public API changes.

- [ ] **Step 1: Write failing tests**

Append to `test/es2015-object-function.test.js`:

```js
  {
    name: 'object literal accessor methods are named "get "/"set " + the key and are not constructors',
    run() {
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor({get x() { return 1; }}, "x"); d.get.name;',
        ),
        'get x',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor({set x(v) {}}, "x"); d.set.name;',
        ),
        'set x',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor({get x() { return 1; }}, "x"); ' +
            'var threw = false; try { new d.get(); } catch (e) { threw = e.name === "TypeError"; } threw;',
        ),
        true,
      );
    },
  },
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL — accessor functions are currently unnamed (`''`) and constructible (`new` on one currently succeeds, producing an object rather than throwing).

- [ ] **Step 3: Wire `isMethod`, `homeObject`, and the `get `/`set ` name prefix**

In `src/evaluator/expressions.js`, in `evaluateObjectExpression`, replace:

```js
const accessor = createFunctionObject(property.value, context.env, context);
object.defineOwnProperty(key, {
  ...(property.kind === 'get' ? { get: accessor } : { set: accessor }),
  enumerable: true,
  configurable: true,
});
```

with:

```js
const accessor = createFunctionObject(property.value, context.env, context, {
  name: `${property.kind} ${key}`,
  isMethod: true,
  homeObject: object,
});
object.defineOwnProperty(key, {
  ...(property.kind === 'get' ? { get: accessor } : { set: accessor }),
  enumerable: true,
  configurable: true,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/evaluator/expressions.js test/es2015-object-function.test.js
git commit -m "feat: give accessor methods a home object and make them non-constructible

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: `super` keyword parser plugin

**Files:**

- Modify: `src/parser-dependency.js` (re-export `tokTypes`)
- Modify: `src/parser.js` (new plugin; wire it into both parser variants)
- Test: `test/parser.test.js`

**Interfaces:**

- Consumes: nothing new.
- Produces: `parseScript`/`parseEval` now parse `super.prop` and `super[expr]` (only where Acorn's own `allowSuper` scope tracking already permits it — inside a `get`/`set` accessor body) into a `MemberExpression` whose `object` is `{ type: 'Super' }`. `super` anywhere else (bare, as a binding, followed by `(`) still raises exactly the same errors it does today (`super()` specifically still raises Acorn's own "super() call outside constructor of a subclass", since `allowDirectSuper` is never enabled). No other ES6 grammar becomes parseable.

- [ ] **Step 1: Write failing tests**

Append to the `tests` array in `test/parser.test.js` (open the file first to match its existing `run`/`parseScript` import style; if it does not already import `parseScript`, add `import { parseScript } from '../src/parser.js';` at the top):

```js
  {
    name: 'super.prop parses inside an object literal accessor as a Super-based MemberExpression',
    run() {
      const program = parseScript(
        'var o = { get x() { return super.y; } };',
      );
      const getter = program.body[0].declarations[0].init.properties[0].value;
      const returnArgument = getter.body.body[0].argument;

      assertSame(returnArgument.type, 'MemberExpression');
      assertSame(returnArgument.object.type, 'Super');
      assertSame(returnArgument.property.name, 'y');
    },
  },
  {
    name: 'super outside a method still raises a SyntaxError',
    run() {
      assertThrows(() => parseScript('super.x;'), SyntaxError);
      assertThrows(() => parseScript('function f() { return super.x; }'), SyntaxError);
    },
  },
  {
    name: 'super not followed by . or [ still raises a SyntaxError',
    run() {
      assertThrows(
        () => parseScript('var o = { get x() { return super; } };'),
        SyntaxError,
      );
    },
  },
```

(`assertThrows` already exists in `test/harness/assert.js` and is used elsewhere in this repo's test suites; import it too if `test/parser.test.js` does not already.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL on the first test with something like `The keyword 'super' is reserved` (a `SyntaxError`, so it fails by not reaching the assertions rather than by a wrong value) — confirming `super` is not yet tokenized as a keyword.

- [ ] **Step 3: Re-export `tokTypes` from the parser dependency boundary**

In `src/parser-dependency.js`, change:

```js
export { parse, Parser } from '../vendor/acorn/acorn.mjs';
```

to:

```js
export { parse, Parser, tokTypes } from '../vendor/acorn/acorn.mjs';
```

- [ ] **Step 4: Add the `super`-keyword plugin**

In `src/parser.js`, add the import and the new plugin function right after the existing `withEscapedReservedWordCheck` plugin (i.e., after its closing `}` around line 77, before the `scriptParser` memoization):

```js
import { Parser, tokTypes } from './parser-dependency.js';
```

(Update the existing `import { Parser } from './parser-dependency.js';` at the top of the file to also import `tokTypes`, as shown.)

```js
/**
 * An Acorn plugin that restores the `super` keyword at `ecmaVersion: 5`.
 *
 * Acorn only adds `"super"` to its keyword-matching regex when
 * `ecmaVersion >= 6` (its internal `keywords$1` table); below that version
 * the text `super` tokenizes as an ordinary identifier `name` token, so it
 * never reaches Acorn's own `case types$1._super:` branch in
 * `parseExprAtom` — the branch that already builds the correct `Super` AST
 * node, requires the next token to be `.`, `[`, or `(`, and checks
 * `this.allowSuper` (a scope flag Acorn already sets while parsing a
 * `get`/`set` accessor body via `parseMethod`, regardless of
 * `ecmaVersion` — ES5's own accessor grammar goes through the same
 * `parseMethod` path ES6 methods do). Instead it falls through to the
 * ordinary identifier path and is rejected by the ES5.1 future-reserved-word
 * check (`withEscapedReservedWordCheck`'s sibling, Acorn's own
 * `checkUnreserved`).
 *
 * This override corrects only the token *type* for the exact text `super`,
 * immediately after the base `readWord` has already run (so every other
 * word, and every other keyword, is tokenized exactly as before). Every
 * other ES6 keyword (`class`, `const`, `let`, `extends`, ...) still
 * tokenizes as an ordinary `name` and is still rejected the same way it is
 * today — this plugin touches nothing but the one word `super`.
 *
 * @param {typeof Parser} Base
 * @returns {typeof Parser}
 */
function withSuperKeywordAtEs5(Base) {
  const baseProto = /** @type {any} */ (Base).prototype;

  return class extends Base {
    /**
     * @returns {void}
     */
    readWord() {
      baseProto.readWord.call(this);

      const self = /** @type {any} */ (this);

      if (self.value === 'super' && self.type === tokTypes.name) {
        self.type = tokTypes._super;
      }
    }
  };
}
```

- [ ] **Step 5: Wire the plugin into both parser variants**

In `src/parser.js`, change:

```js
function getScriptParser() {
  if (scriptParser === undefined) {
    scriptParser = Parser.extend(withEscapedReservedWordCheck);
  }

  return scriptParser;
}
```

to:

```js
function getScriptParser() {
  if (scriptParser === undefined) {
    scriptParser = Parser.extend(
      withEscapedReservedWordCheck,
      withSuperKeywordAtEs5,
    );
  }

  return scriptParser;
}
```

and in `getStrictParser`, change:

```js
    strictParser = Parser.extend(
      withEscapedReservedWordCheck,
      (Base) =>
```

to:

```js
    strictParser = Parser.extend(
      withEscapedReservedWordCheck,
      withSuperKeywordAtEs5,
      (Base) =>
```

(Only the plugin list passed to `Parser.extend` changes in each case; nothing else in either function changes.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 7: Confirm ES5 conformance did not regress**

Run: `npm run test262:fixtures`
Expected: PASS (no change expected, but this is the fastest broad signal that the new keyword didn't disturb anything else the parser accepts)

- [ ] **Step 8: Commit**

```bash
git add src/parser-dependency.js src/parser.js test/parser.test.js
git commit -m "feat: parse super.prop / super[expr] inside methods at ecmaVersion 5

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: `super` property read/write at runtime

**Files:**

- Create: `src/runtime/super-reference.js`
- Modify: `src/evaluator/expressions.js` (`evaluateMemberExpression`)
- Modify: `src/evaluator/declarations.js` (`executeFunctionBody`)
- Modify: `src/evaluator/index.js` (`EvaluationContext` typedef — add `homeObject`)
- Test: `test/es2015-object-function.test.js`

**Interfaces:**

- Consumes: the `Super` AST node from Task 6; `context.homeObject`, threaded per-activation from `functionObject.homeObject` (Task 2/5).
- Produces: `SuperReferenceBase` (a class satisfying the `isPropertyReferenceBase` duck type already used by `src/runtime/reference.js`'s `getValue`/`putValue`) and `setPropertyWithReceiver(startObject, receiver, name, value, throwOnError)`, both exported from `src/runtime/super-reference.js`. `context.homeObject: EngineObject | undefined`, set every function call.

- [ ] **Step 1: Write failing tests**

Append to `test/es2015-object-function.test.js`:

```js
  {
    name: 'super.prop reads through the home object\'s prototype with the receiver as this',
    run() {
      assertSame(
        run(
          'var proto = { _x: 42, get x() { return "proto" + this._x; } }; ' +
            'var object = { get x() { return super.x; } }; ' +
            'Object.setPrototypeOf(object, proto); object.x;',
        ),
        'proto42',
      );
    },
  },
  {
    name: 'super.prop = value writes through the home object\'s prototype with the receiver as this',
    run() {
      assertSame(
        run(
          'var proto = { _x: 0, set x(v) { this._x = v; } }; ' +
            'var object = { set x(v) { super.x = v; } }; ' +
            'Object.setPrototypeOf(object, proto); ' +
            'object.x = 1; object._x + "," + Object.getPrototypeOf(object)._x;',
        ),
        '1,0',
      );
    },
  },
  {
    name: 'super[expr] resolves a computed key the same way super.prop does',
    run() {
      assertSame(
        run(
          'var proto = { y: 7 }; var object = { get x() { return super["y"]; } }; ' +
            'Object.setPrototypeOf(object, proto); object.x;',
        ),
        7,
      );
    },
  },
  {
    name: "super.prop on an accessor whose home object's prototype lacks the key reads undefined",
    run() {
      assertSame(
        run('var object = { get x() { return super.y; } }; object.x;'),
        undefined,
      );
    },
  },
```

(A bare `super.prop` reachable with no enclosing method at all is not something a guest script can construct through this engine's parser: Task 6's grammar only ever produces a `Super` node inside a `get`/`set` accessor body, where Acorn's own `allowSuper` check already requires it. The runtime `ReferenceError` guard added in Step 5 below is defense in depth for that unreachable case, not something this suite can exercise end-to-end — it is implicitly covered by the fact that every other test here _does_ have a home object and never hits that branch.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL — `evaluateMemberExpression` does not yet special-case a `Super` object, so it currently throws (`node.object` of type `'Super'` is not in `EXPRESSION_TYPES`, so `evaluateExpressionValue` throws `UnsupportedNodeError`).

- [ ] **Step 3: Create `src/runtime/super-reference.js`**

```js
import { EngineObject, callAccessor } from './object.js';
import { isAccessorDescriptor, isDataDescriptor } from './descriptors.js';
import { GuestErrorSignal } from './completion.js';

/**
 * @typedef {import('./descriptors.js').PropertyKey} PropertyKey
 */

/**
 * A `Reference` base (ECMA-262 8.7) for `super.prop`/`super[expr]`,
 * satisfying the duck-typed `isPropertyReferenceBase` interface
 * `src/runtime/reference.js`'s `getValue`/`putValue` already dispatch to
 * (`getReferencedValue`/`setReferencedValue`). It implements
 * `MakeSuperPropertyReference` (ECMA-262 12.3.5.1): the property lookup
 * starts at the method's `[[HomeObject]]`'s prototype, but accessors are
 * invoked with the method's `this` (the `receiver`) rather than with the
 * object the lookup happened to find the property on — the one way a
 * `super` reference differs from an ordinary property reference on the home
 * object's prototype directly.
 */
export class SuperReferenceBase {
  /**
   * @param {EngineObject} homeObject
   * @param {unknown} receiver
   */
  constructor(homeObject, receiver) {
    /** @type {EngineObject} */
    this.homeObject = homeObject;
    /** @type {unknown} */
    this.receiver = receiver;
  }

  /**
   * @param {PropertyKey} name
   * @returns {unknown}
   */
  getReferencedValue(name) {
    const superBase = this.homeObject.getPrototype();

    if (superBase === null) {
      return undefined;
    }

    const descriptor = superBase.getProperty(name);

    if (descriptor === undefined) {
      return undefined;
    }

    if (isDataDescriptor(descriptor)) {
      return descriptor.value;
    }

    return descriptor.get === undefined
      ? undefined
      : callAccessor(descriptor.get, this.receiver, []);
  }

  /**
   * @param {PropertyKey} name
   * @param {unknown} value
   * @param {boolean} [strict=false]
   * @returns {void}
   */
  setReferencedValue(name, value, strict = false) {
    setPropertyWithReceiver(
      this.homeObject.getPrototype(),
      this.receiver,
      name,
      value,
      strict,
    );
  }
}

/**
 * Implements ECMA-262 9.1.9 `OrdinarySet` with an explicit `Receiver`,
 * distinct from the object the lookup started at. Ordinary (non-`super`)
 * property assignment never needs this — `EngineObject#put` always uses the
 * same object as both the lookup start and the receiver — so this is kept
 * as its own free function rather than folded into `EngineObject#put`,
 * used only by `SuperReferenceBase#setReferencedValue`.
 *
 * @param {EngineObject | null} startObject
 * @param {unknown} receiver
 * @param {PropertyKey} name
 * @param {unknown} value
 * @param {boolean} throwOnError
 * @returns {boolean}
 */
export function setPropertyWithReceiver(
  startObject,
  receiver,
  name,
  value,
  throwOnError,
) {
  const ownDescriptor =
    startObject === null ? undefined : startObject.getOwnProperty(name);

  if (ownDescriptor === undefined) {
    const parent = startObject === null ? null : startObject.getPrototype();

    if (parent !== null) {
      return setPropertyWithReceiver(
        parent,
        receiver,
        name,
        value,
        throwOnError,
      );
    }

    return createDataPropertyOnReceiver(
      receiver,
      name,
      value,
      throwOnError,
      false,
    );
  }

  if (isDataDescriptor(ownDescriptor)) {
    if (!ownDescriptor.writable) {
      return reject(
        throwOnError,
        'Cannot assign to a read-only property inherited through super',
      );
    }

    return createDataPropertyOnReceiver(
      receiver,
      name,
      value,
      throwOnError,
      true,
    );
  }

  if (!isAccessorDescriptor(ownDescriptor) || ownDescriptor.set === undefined) {
    return reject(
      throwOnError,
      'Cannot assign to a property with no setter inherited through super',
    );
  }

  callAccessor(ownDescriptor.set, receiver, [value]);
  return true;
}

/**
 * @param {unknown} receiver
 * @param {PropertyKey} name
 * @param {unknown} value
 * @param {boolean} throwOnError
 * @param {boolean} checkExistingOwnProperty
 * @returns {boolean}
 */
function createDataPropertyOnReceiver(
  receiver,
  name,
  value,
  throwOnError,
  checkExistingOwnProperty,
) {
  if (!(receiver instanceof EngineObject)) {
    return reject(
      throwOnError,
      'Cannot create a property on a non-object super receiver',
    );
  }

  if (checkExistingOwnProperty) {
    const existing = receiver.getOwnProperty(name);

    if (existing !== undefined) {
      if (isAccessorDescriptor(existing)) {
        return reject(
          throwOnError,
          'Cannot assign a data value over an inherited accessor through super',
        );
      }

      if (existing.writable === false) {
        return reject(
          throwOnError,
          'Cannot assign to a read-only own property through super',
        );
      }

      return receiver.defineOwnProperty(name, { value }, throwOnError);
    }
  }

  return receiver.defineOwnProperty(
    name,
    { value, writable: true, enumerable: true, configurable: true },
    throwOnError,
  );
}

/**
 * @param {boolean} throwOnError
 * @param {string} message
 * @returns {false}
 */
function reject(throwOnError, message) {
  if (throwOnError) {
    throw new GuestErrorSignal('TypeError', message);
  }

  return false;
}
```

- [ ] **Step 4: Thread `homeObject` through the evaluation context**

In `src/evaluator/index.js`, add `homeObject` to the `EvaluationContext` typedef:

```js
 * @typedef {{
 *   realm: import('../runtime/realm.js').Realm,
 *   env: import('../runtime/environment.js').EnvironmentRecordLike,
 *   variableEnv: import('../runtime/environment.js').EnvironmentRecordLike,
 *   strict: boolean,
 *   thisValue: unknown,
 *   homeObject?: import('../runtime/object.js').EngineObject | undefined,
 * }} EvaluationContext
```

In `src/evaluator/declarations.js`, in `executeFunctionBody`, replace:

```js
function executeFunctionBody(node, functionObject, thisValue, args) {
  const env = newDeclarativeEnvironment(functionObject.scope);
  /** @type {EvaluationContext} */
  const context = {
    realm: functionObject.realm,
    env,
    variableEnv: env,
    strict: functionObject.strict,
    thisValue,
  };
```

with:

```js
function executeFunctionBody(node, functionObject, thisValue, args) {
  const env = newDeclarativeEnvironment(functionObject.scope);
  /** @type {EvaluationContext} */
  const context = {
    realm: functionObject.realm,
    env,
    variableEnv: env,
    strict: functionObject.strict,
    thisValue,
    homeObject: functionObject.homeObject,
  };
```

(Every nested scope built via `{ ...context, env: newEnv }` — see `withContext`/`catchContext` in `src/evaluator/statements.js` — already carries `homeObject` through automatically via the object spread, so no other file needs a change for propagation into blocks, `if`/loop bodies, or `try`/`catch`.)

- [ ] **Step 5: Recognize `Super` in `evaluateMemberExpression`**

In `src/evaluator/expressions.js`, add the import:

```js
import { SuperReferenceBase } from '../runtime/super-reference.js';
```

Replace `evaluateMemberExpression`:

```js
function evaluateMemberExpression(node, context) {
  const baseValue = evaluateExpressionValue(node.object, context);
  const propertyKey = node.computed
    ? evaluateExpressionValue(node.property, context)
    : node.property.name;

  checkObjectCoercible(baseValue);

  return new Reference(
    toObjectBase(context.realm, baseValue),
    toString(propertyKey),
    context.strict,
    baseValue,
  );
}
```

with:

```js
function evaluateMemberExpression(node, context) {
  if (node.object.type === 'Super') {
    return evaluateSuperMemberExpression(node, context);
  }

  const baseValue = evaluateExpressionValue(node.object, context);
  const propertyKey = node.computed
    ? evaluateExpressionValue(node.property, context)
    : node.property.name;

  checkObjectCoercible(baseValue);

  return new Reference(
    toObjectBase(context.realm, baseValue),
    toString(propertyKey),
    context.strict,
    baseValue,
  );
}

/**
 * Evaluates a `super.prop`/`super[expr]` `MemberExpression` (ECMA-262
 * 12.3.5): resolves ES2015 `GetSuperBase` off the currently executing
 * method's `[[HomeObject]]` and builds a `SuperReferenceBase` so
 * `GetValue`/`PutValue` read and write through the home object's
 * *prototype* while keeping the method's own `this` as the receiver. A
 * missing `homeObject` (an ordinary function, reached only if some future
 * syntax addition parses `super` somewhere Acorn's own `allowSuper` check
 * should have already rejected) is defense in depth: it throws the same
 * guest `ReferenceError` a real engine's static early error would have
 * produced, documented as an intentional runtime fallback for what the
 * specification instead catches at parse time.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {Reference}
 */
function evaluateSuperMemberExpression(node, context) {
  const homeObject = context.homeObject;

  if (!(homeObject instanceof EngineObject)) {
    throw new GuestErrorSignal(
      'ReferenceError',
      "'super' keyword is only valid inside a method",
    );
  }

  const propertyKey = node.computed
    ? toString(evaluateExpressionValue(node.property, context))
    : node.property.name;

  return new Reference(
    new SuperReferenceBase(homeObject, context.thisValue),
    propertyKey,
    context.strict,
    context.thisValue,
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/runtime/super-reference.js src/evaluator/expressions.js src/evaluator/declarations.js src/evaluator/index.js test/es2015-object-function.test.js
git commit -m "feat: resolve super.prop/super[expr] through the home object's prototype

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: `Object.setPrototypeOf` and `Object.is`

**Files:**

- Modify: `src/runtime/object.js` (`EngineObject#setPrototypeOf`)
- Modify: `src/builtins/object.js` (`installObjectReflectionMethods`)
- Test: `test/es2015-object-function.test.js`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `EngineObject#setPrototypeOf(value)` (returns `boolean`); guest globals `Object.setPrototypeOf(target, proto)` and `Object.is(value1, value2)`.

- [ ] **Step 1: Write failing tests**

Append to `test/es2015-object-function.test.js`:

```js
  {
    name: 'Object.setPrototypeOf changes an object\'s prototype and rejects a cycle',
    run() {
      assertSame(
        run(
          'var a = {}; var b = { x: 1 }; Object.setPrototypeOf(a, b); a.x;',
        ),
        1,
      );
      assertSame(
        run('var a = {}; Object.setPrototypeOf(a, null); Object.getPrototypeOf(a);'),
        null,
      );
      assertSame(
        run(
          'var a = {}; var b = {}; Object.setPrototypeOf(b, a); ' +
            'var name; try { Object.setPrototypeOf(a, b); } catch (e) { name = e.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Object.is implements SameValue, distinguishing NaN and -0 from ===',
    run() {
      assertSame(run('Object.is(NaN, NaN);'), true);
      assertSame(run('Object.is(0, -0);'), false);
      assertSame(run('Object.is(1, 1);'), true);
      assertSame(run('Object.is({}, {});'), false);
    },
  },
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:node`
Expected: FAIL — `Object.setPrototypeOf` and `Object.is` do not exist yet (`TypeError: ... is not a function` inside the guest, surfaced as a guest throw or `undefined` callee).

- [ ] **Step 3: Add `EngineObject#setPrototypeOf`**

In `src/runtime/object.js`, add this method to the `EngineObject` class, right after `preventExtensions`:

```js
  /**
   * Implements ECMA-262 9.1.2 `OrdinarySetPrototypeOf`: same-value is a
   * trivial success, a non-null non-object candidate or a non-extensible
   * receiver rejects, and a candidate that would introduce a cycle (walking
   * its own prototype chain and finding `this`) rejects too. Otherwise
   * replaces `_prototype`.
   *
   * @param {EngineObject | null} value
   * @returns {boolean}
   */
  setPrototypeOf(value) {
    if (value === this._prototype) {
      return true;
    }

    if (value !== null && !(value instanceof EngineObject)) {
      return false;
    }

    if (!this._extensible) {
      return false;
    }

    for (
      let current = /** @type {EngineObject | null} */ (value);
      current !== null;
      current = current.getPrototype()
    ) {
      if (current === this) {
        return false;
      }
    }

    this._prototype = value;
    return true;
  }
```

- [ ] **Step 4: Add `Object.setPrototypeOf` and `Object.is`**

In `src/builtins/object.js`, in `installObjectReflectionMethods`, add (right after the existing `getPrototypeOf` registration):

```js
defineNativeMethod(
  realm,
  objectConstructor,
  'setPrototypeOf',
  2,
  (_this, args) => {
    const target = requireObjectArgument(args[0]);
    const proto = args[1];

    if (proto !== null && !(proto instanceof EngineObject)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Object prototype may only be an object or null',
      );
    }

    if (!target.setPrototypeOf(proto)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Object.setPrototypeOf could not set the requested prototype',
      );
    }

    return target;
  },
);
defineNativeMethod(realm, objectConstructor, 'is', 2, (_this, args) =>
  Object.is(args[0], args[1]),
);
```

(`Object.is` on the right-hand side is the _host_'s `Object.is`, correct here because this engine represents every guest primitive as the identical host primitive and every guest object as one `EngineObject` instance — see the existing internal uses of host `Object.is` for `-0` detection in `src/runtime/date.js`, `src/builtins/math.js`, and `src/runtime/object.js` itself.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/runtime/object.js src/builtins/object.js test/es2015-object-function.test.js
git commit -m "feat: add Object.setPrototypeOf and Object.is

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Focused Test262 coverage

**Files:**

- Create: `test/ci/es2015-object-function-test262.test.js`
- Modify: `test/run-ci-contract.js`
- Modify: `docs/conformance.md`

**Interfaces:**

- Consumes: `runTest262`, `createNodeTest262Host` (existing, from `tools/test262/runner.js` and `tools/test262/adapters/node.js`); `readTest262Pin` (existing, from `tools/test262/upstream-run.js`).
- Produces: nothing new consumed elsewhere; this is a leaf test suite.

- [ ] **Step 1: Confirm the upstream checkout is in place and at the pinned revision**

Run: `git -C vendor/test262 rev-parse HEAD`
Expected: `b363f29d3c43c626dc852744ad64a0b48a003693` (already true in this workspace; if it were ever missing, `git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262 && git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693` restores it — see `docs/testing.md`'s Troubleshooting section).

- [ ] **Step 2: Write the failing suite**

```js
/**
 * Focused upstream Test262 coverage for issue #38 (ES2015 object/function
 * runtime updates). This is a hand-picked file list, not the ES5
 * `upstream-subset.json`/`es5-selection.json` pipeline — that pipeline is
 * scoped to an ES5.1 engine and is shared with the parallel lexical-
 * declarations (#41) and Symbols (#43) branches, so this suite stays
 * separate until #45 integrates all three. It lives in `test/ci/` rather
 * than `test/node/` because, like `exclusions-check.test.js`, it needs a
 * real upstream Test262 checkout at `vendor/test262` (see `docs/testing.md`).
 *
 * Two of the picked files carry a Test262 `features` tag that does not
 * match anything this engine implements broadly (`arrow-function` on the
 * `getOwnPropertyNames` ordering test, `for-in-order` on the `Object.keys`
 * ordering test) even though neither test body actually exercises that
 * feature — an upstream labelling artifact. Declaring both names in
 * `supportedFeatures` only prevents *this* focused run from skipping those
 * two files; it does not add either feature to the engine or to
 * `tools/test262/features.json`.
 */

import { createRealm, evaluateScript } from '../../src/index.js';
import { runTest262 } from '../../tools/test262/runner.js';
import { createNodeTest262Host } from '../../tools/test262/adapters/node.js';
import {
  assertPinnedCheckout,
  readTest262Pin,
} from '../../tools/test262/upstream-run.js';

/**
 * Repository-relative paths, sorted, matching `docs/conformance.md`. All
 * twelve were confirmed present in the pinned checkout
 * (`b363f29d3c43c626dc852744ad64a0b48a003693`) before this suite was written.
 */
const FOCUSED_PATHS = Object.freeze([
  'test/built-ins/Function/prototype/bind/length.js',
  'test/built-ins/Function/prototype/bind/name.js',
  'test/built-ins/Object/getOwnPropertyNames/order-after-define-property.js',
  'test/built-ins/Object/is/not-same-value-x-y-object.js',
  'test/built-ins/Object/keys/return-order.js',
  'test/built-ins/Object/setPrototypeOf/property-descriptor.js',
  'test/language/expressions/function/name.js',
  'test/language/expressions/object/getter-prop-desc.js',
  'test/language/expressions/object/getter-super-prop.js',
  'test/language/expressions/object/setter-prop-desc.js',
  'test/language/expressions/object/setter-super-prop.js',
  'test/language/statements/function/name.js',
]);

export default [
  {
    name: 'focused ES2015 object/function upstream Test262 files all pass',
    run: async () => {
      const pin = await readTest262Pin();

      await assertPinnedCheckout(pin);

      const host = createNodeTest262Host({ root: pin.checkoutPath });
      const { summary, records } = await runTest262({
        engine: { createRealm, evaluateScript },
        host,
        paths: FOCUSED_PATHS,
        supportedFeatures: ['arrow-function', 'for-in-order'],
        skipFeatures: [],
      });

      if (summary.failed > 0 || summary.skipped > 0) {
        const problems = records.filter((record) => record.status !== 'passed');

        throw new Error(
          `Expected every focused file to pass, got: ${JSON.stringify(problems)}`,
        );
      }
    },
  },
];
```

- [ ] **Step 3: Run the test to verify it passes**

All twelve `FOCUSED_PATHS` above were confirmed present in the pinned checkout before this plan was written (`ls vendor/test262/test/built-ins/Object/is/`, etc.), and every behavior they exercise was already implemented by Tasks 1-8. This step is a verification run, not a red/green TDD step — it should pass immediately, and existing purely as a checkpoint that the harness wiring itself (paths, `supportedFeatures`, `assertPinnedCheckout`) is correct before it gets folded into the CI contract.

Run:

```sh
node --experimental-vm-modules -e "
import('./test/ci/es2015-object-function-test262.test.js').then(async (m) => {
  for (const t of m.default) { await t.run(); }
  console.log('OK');
}).catch((e) => { console.log(e.message); process.exit(1); });
"
```

Expected: prints `OK`. If it instead reports a failing/skipped record for one of the twelve files, that means an earlier task's implementation has a gap Test262 catches that the hand-written local tests didn't — fix the implementation (do not loosen this suite to work around it) and re-run.

- [ ] **Step 4: Register the suite in the CI contract runner**

In `test/run-ci-contract.js`, add the import:

```js
import es2015ObjectFunctionTest262 from './ci/es2015-object-function-test262.test.js';
```

and add an entry to `CI_CONTRACT_SUITES` (after the `exclusionsCheck` entry):

```js
  Object.freeze({
    file: 'test/ci/es2015-object-function-test262.test.js',
    tests: es2015ObjectFunctionTest262,
  }),
```

- [ ] **Step 5: Document the focused coverage in `docs/conformance.md`**

Open `docs/conformance.md`, find the `<!-- test262-coverage:begin -->`/`<!-- test262-coverage:end -->` block (generated — do not hand-edit inside it), and add a new section immediately before it:

```markdown
## ES2015 focused coverage

Issue #38 (ES2015 object/function runtime updates) is covered by a small,
hand-picked set of upstream Test262 files, run via `test/ci/es2015-object-function-test262.test.js`
(part of `npm run ci:contract`) rather than folded into the ES5
`upstream-subset.json`/`es5-selection.json` pipeline above, which stays
scoped to the ES5.1 engine and shared with the parallel lexical-declarations
(#41) and Symbols (#43) branches:

- `test/language/expressions/function/name.js`, `test/language/statements/function/name.js`,
  `test/built-ins/Function/prototype/bind/{name,length}.js` — function `name`/`length` semantics
- `test/built-ins/Object/keys/return-order.js`, `test/built-ins/Object/getOwnPropertyNames/order-after-define-property.js` —
  ES2015 own-property-key order
- `test/language/expressions/object/{getter,setter}-prop-desc.js`,
  `test/language/expressions/object/{getter,setter}-super-prop.js` — method `[[HomeObject]]`/`super`
- `test/built-ins/Object/setPrototypeOf/**`, `test/built-ins/Object/is/**` — the two new `Object` statics

Reproduce locally: `node test/run-ci-contract.js` (requires the pinned
upstream checkout at `vendor/test262`; see the Test262 section above).
```

- [ ] **Step 6: Run the full CI contract to verify the new suite passes in place**

Run: `npm run ci:contract`
Expected: PASS (this also re-runs `vendor:check`, `format`, `lint`, `typecheck`, `test:node`, `test:browser`, `test262:fixtures`, `test262:upstream`, and `exclusions-check`, so it is the strongest signal available; if `test262:upstream` or `vendor:check`/`format`/`lint` fail for reasons unrelated to this task, fix those failures before proceeding — see Task 10, which re-runs this same command as its final check)

- [ ] **Step 7: Commit**

```bash
git add test/ci/es2015-object-function-test262.test.js test/run-ci-contract.js docs/conformance.md
git commit -m "test: add focused Test262 coverage for issue #38

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Documentation and full validation pass

**Files:**

- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes: nothing new; this task only documents and validates the completed feature set.
- Produces: nothing consumed by other tasks; this is the final task.

- [ ] **Step 1: Document the new runtime behavior in `docs/architecture.md`**

In `docs/architecture.md`, in the "Values, objects, environments, references, completions" section, add a new subsection right after the existing "### Descriptors (`src/runtime/descriptors.js`)" subsection:

```markdown
### Own-property-key order (`src/runtime/object.js`)

`EngineObject#ownPropertyKeys()` returns keys in ECMA-262 9.1.12
`OrdinaryOwnPropertyKeys` order: array-index string keys first in ascending
numeric order, then every other key in creation order (this engine has no
symbols yet, so the symbol bucket ES2015 defines is currently always empty).
`Object.keys`, `Object.getOwnPropertyNames`, `for-in` (`enumerableKeysForIn`),
and `JSON.stringify` all read through this one method, so they share the
order automatically.

### Method `[[HomeObject]]` and `super` (`src/runtime/function-object.js`, `src/runtime/super-reference.js`)

Object-literal `get`/`set` accessors carry an ES2015 `[[HomeObject]]`
internal slot (`EngineFunction#homeObject`) pointing at the object literal
they were defined in, and are created non-constructible
(`createFunctionObject(..., { isMethod: true, ... })` sets
`EngineFunction#_isConstructor = false`, matching ES2015 `FunctionCreate`'s
`Method` kind). `super.prop`/`super[expr]` inside such an accessor resolves
through `SuperReferenceBase` (`src/runtime/super-reference.js`): the property
lookup starts at `homeObject.getPrototype()`, but the accessor's own `this`
stays the receiver for both the read and the write — implemented by
`setPropertyWithReceiver`, a receiver-aware sibling of `EngineObject#put`
used only by this path. Parsing `super` at all requires a narrowly-scoped
Acorn plugin in `src/parser.js` that restores the `super` keyword token at
`ecmaVersion: 5` (Acorn's own `Super`-node handling, `allowSuper` scope
tracking, and early errors are otherwise unchanged); no other ES6 grammar is
reachable through it. `super(...)` (`SuperCall`) is not implemented — it is
only valid in a derived class constructor, and classes are issue #25.
```

In the "Function objects" area — find where `EngineFunction`/`function-object.js` is currently described (search for "13.2" or "Creating Function Objects" in the file if it appears; if the class is only described in `src/runtime/function-object.js`'s own docstring and not duplicated in `architecture.md`, skip this paragraph and only add the subsection above) add one sentence noting: "`EngineFunction`'s `name`/`length` own properties are `configurable: true` (ES2015 changed this from ES5's `false`), and `name` is assigned per `SetFunctionName`/`NamedEvaluation` — including anonymous-function inference for `var`/assignment/object-literal-property targets — in `src/evaluator/declarations.js` and `src/evaluator/expressions.js`."

Add a bullet for the two new `Object` statics to the "Built-in families" table row for `object.js`: append `, Object.setPrototypeOf, Object.is` to that row's description if the table lists specific methods, or leave the table as-is if it only lists the module (check the existing row's format before editing — match its style exactly, since the table is column-aligned Markdown).

- [ ] **Step 2: Run the fast local suite**

Run: `npm run test:node`
Expected: PASS

- [ ] **Step 3: Run typecheck, lint, and format**

Run: `npm run typecheck && npm run lint && npm run format`
Expected: PASS. If `typecheck` reports errors from the new JSDoc, fix the annotations (common issues: a `@param`/`@returns` type that doesn't match the actual runtime shape, or a missing `@typedef` import) rather than suppressing them. If `format` fails, run `npx prettier --write` on the changed files and re-run.

- [ ] **Step 4: Run the browser suite**

Run: `npm run test:browser`
Expected: PASS (installs the headless Chromium shell first if needed: `npx playwright install --with-deps --only-shell chromium`, per `docs/testing.md`)

- [ ] **Step 5: Run the JSC suite**

Run: `PATH="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers:$PATH" npm run test:jsc` (macOS path from `docs/testing.md`; on a host without a `jsc` binary on `PATH`, note this in the PR description rather than skipping it silently — CI does not run this job, per `docs/testing.md`'s "JSC in CI" section, so a local-only gap here is expected and already documented as such)
Expected: PASS

- [ ] **Step 6: Run the full CI contract**

Run: `npm run ci:contract`
Expected: PASS — this is the authoritative "every CI job, for real" signal (`vendor:check`, `format`, `lint`, `typecheck`, `test:node`, `test:browser`, `test262:fixtures`, `test262:upstream`, `exclusions-check`, and the new focused-Test262 suite from Task 9)

- [ ] **Step 7: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: describe ES2015 object/function runtime updates

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

## Post-plan: finishing the branch

Once every task above is committed and Task 10's full validation passes, use the `superpowers:requesting-code-review` skill for a review pass, address any findings, then `superpowers:finishing-a-development-branch` to push the branch and open the pull request against `main`, referencing "Closes #38" in the description and summarizing the same non-goals list the design doc (`docs/superpowers/specs/2026-08-07-es2015-object-function-runtime-design.md`) already states, so a reviewer knows Symbols/#43, lexical declarations/#41, and classes/arrow-functions/concise-methods/#25 are deliberately out of scope for this PR.
