# ES2015 Syntax Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement issue #25's ES2015 arrows, classes, templates, destructuring, default/rest/spread, enhanced object literals, and computed property names on the shared runtime delivered by #26.

**Architecture:** Keep Acorn 8 at `ecmaVersion: 6` and make the post-parse validator a recursive, shape-aware capability boundary. Add shared pattern, property-name, iterable-list, function-instantiation, lexical-function-environment, and class-construction semantics; each syntax family then enables only its own AST shapes. Preserve realm/Agent ownership and route all guest behavior through engine objects, references, environments, completions, and iterator operations.

**Tech Stack:** Plain ES2020 JavaScript modules, strict JSDoc/check-JS, Acorn 8.18.0 ESTree ASTs, engine-owned runtime records, Node.js, Chromium/Playwright, JavaScriptCore `jsc`, and pinned Test262 revision `b363f29d3c43c626dc852744ad64a0b48a003693`.

## Global Constraints

- Start from `origin/main` commit `100e5d1d3d9ac4bd4c8d88fa80157e35563c42b6`; preserve the committed approved design at `b35bdcc`.
- Preserve ES5 behavior and reuse #26's realms, environments, property keys, Symbols, function metadata, `super` property references, and iterator operations.
- Keep `src/` host-neutral: no host modules, host `eval`, host `Function`, or host objects/iteration as guest semantic shortcuts.
- Keep parser configuration at `ecmaVersion: 6`, `sourceType: "script"`.
- Validate supported AST node shapes and flags recursively; do not admit a node merely because its `type` is recognized.
- Explicitly reject generators/`yield`, async/`await`, modules/import/export, `new.target`, object rest/spread, post-ES2015 classes, binary/octal literals, Unicode code-point escapes, and every unimplemented neighboring shape.
- Arrow functions have no own `[[HomeObject]]`, `this`, `arguments`, or `super`; they resolve those through the enclosing execution/function environment.
- Non-simple parameter lists use the ES2015 parameter-environment/body-variable-environment separation and unmapped arguments rules.
- `ClassDeclaration` uses a mutable uninitialized lexical binding; a named `ClassExpression` uses an immutable inner name binding.
- Class constructor and static-`prototype` restrictions use static non-computed `PropName`; computed names evaluating to those strings remain allowed ordinary methods.
- Run targeted local Test262 only. Generate Test262 selection/report/documentation artifacts with `TZ=UTC`; use pinned CI for broad coverage.
- Use strict TDD: record RED before changing production behavior, then GREEN, then focused verification.
- Execute every task with a fresh GPT-5.6-family implementer. After its implementation commit, run a fresh specification-compliance review and a fresh code-quality review; reproduce accepted findings with RED tests, fix them, rerun focused gates, and commit review fixes before starting the next task.
- Do not use Claude Opus 5. Final whole-branch review uses GPT-5.6 Sol at maximum effort.

## File and Interface Map

| File                                                     | Responsibility                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/parser.js`                                          | Acorn entry point and iterative, cycle-safe syntax capability validation                     |
| `src/evaluator/static-semantics.js`                      | Iterative declaration/pattern `BoundNames` and lexical/var declaration classification        |
| `src/evaluator/patterns.js`                              | Binding initialization and destructuring assignment over object/array patterns               |
| `src/evaluator/property-name.js`                         | Computed/non-computed `PropertyKey` evaluation and ES2015 function-name formatting           |
| `src/evaluator/iteration.js`                             | Engine-iterator-to-list consumption shared by spread/default derived construction            |
| `src/evaluator/declarations.js`                          | Function creation/instantiation, parameter environments, declaration-pattern initialization  |
| `src/evaluator/expressions.js`                           | Expression dispatch for spread, objects, templates, arrows, class expressions, and `super()` |
| `src/evaluator/statements.js`                            | Class declarations and destructuring loop heads                                              |
| `src/evaluator/classes.js`                               | Class definition evaluation, method installation, heritage, and default constructors         |
| `src/runtime/function-object.js`                         | Function internal metadata, mapped/unmapped arguments, call/construct protocol               |
| `src/runtime/environment.js`                             | Function execution environment with lexical-this/super/new-target and derived-this state     |
| `src/runtime/realm.js`                                   | Realm-scoped parse-site template-object cache                                                |
| `test/*.test.js`                                         | Portable focused regressions registered in `test/suites.js`                                  |
| `test/ci/es2015-syntax-test262.test.js`                  | Narrow pinned upstream Test262 smoke selection for new syntax                                |
| `tools/test262/features.json`                            | Exact executable feature probes                                                              |
| `tools/test262/es5-selection.json`                       | Prefix/tag claims for the now-supported ES2015 language surface                              |
| `tools/test262/upstream-subset.json`                     | UTC-generated pinned selection                                                               |
| `docs/{architecture,conformance,limitations,testing}.md` | Public grammar, semantics, coverage, and remaining limitations                               |

---

### Task 1: Shape-Aware Parser Gate and Pattern Static Semantics

**Files:**

- Modify: `src/parser.js:208-307,565-648`
- Modify: `src/evaluator/static-semantics.js:34-75,219-475`
- Modify: `test/parser.test.js`
- Modify: `test/static-semantics.test.js`
- No production syntax family is enabled by this task.

**Interfaces:**

- Consumes: Acorn ESTree nodes and the existing iterative/cycle-safe parser walk.
- Produces: internal `unsupportedEs2015Message(node, parent, parentKey): string | undefined`; expanded `boundNames(node): string[]` supporting binding patterns and `ClassDeclaration`.

- [ ] **Step 1: Add parser-policy RED tests**

Add custom-AST tests proving the validator rejects shape flags even when a node
type is otherwise familiar:

```js
const unsupportedProperties = [
  {
    type: 'Property',
    kind: 'unsupported',
    computed: false,
    method: false,
    shorthand: false,
    key: { type: 'Identifier', name: 'x' },
    value: { type: 'Literal', value: 1 },
  },
  {
    type: 'FunctionExpression',
    id: null,
    params: [],
    generator: false,
    async: false,
    expression: false,
    body: { type: 'Literal', value: 1 },
  },
];
```

Wrap each in a valid custom `Program` and assert `parseScript(..., { parse })`
throws `SyntaxError`. Retain existing real-source assertions that every issue
#25 family is still rejected at this task boundary.

- [ ] **Step 2: Run parser RED**

Run:

```bash
node test/run-node.js test/parser.test.js
```

Expected: FAIL because the current blacklist accepts an unknown `Property.kind`
and a function whose body is not a `BlockStatement`.

- [ ] **Step 3: Add static-semantics RED tests**

Add exact `boundNames` cases:

```js
assertSame(
  boundNames({
    type: 'ArrayPattern',
    elements: [
      { type: 'Identifier', name: 'a' },
      {
        type: 'AssignmentPattern',
        left: {
          type: 'ObjectPattern',
          properties: [
            {
              type: 'Property',
              kind: 'init',
              computed: false,
              key: { type: 'Identifier', name: 'x' },
              value: { type: 'Identifier', name: 'b' },
            },
          ],
        },
        right: { type: 'Literal', value: 1 },
      },
      {
        type: 'RestElement',
        argument: { type: 'Identifier', name: 'rest' },
      },
    ],
  }).join(','),
  'a,b,rest',
);
assertSame(
  boundNames({
    type: 'ClassDeclaration',
    id: { type: 'Identifier', name: 'C' },
  }).join(','),
  'C',
);
```

- [ ] **Step 4: Run static-semantics RED**

Run:

```bash
node test/run-node.js test/static-semantics.test.js
```

Expected: FAIL with `Unsupported AST node: ArrayPattern`.

- [ ] **Step 5: Implement recursive shape policy without enabling syntax**

Refactor `checkUnsupportedEs2015Node` to delegate to a context-aware policy:

```js
function unsupportedEs2015Message(node, parent, parentKey) {
  if (node.type === 'Property') {
    if (node.method || node.computed || node.shorthand) {
      return 'computed, shorthand, and method object properties are not supported';
    }
  }
  if (isFunctionNode(node) && (node.generator || node.async)) {
    return node.async
      ? 'async functions are not supported'
      : 'generators and `yield` are not supported';
  }
  return UNSUPPORTED_ES2015_NODE_MESSAGES.get(node.type);
}
```

Thread `parent` and `parentKey` through the existing iterative AST worklist.
Keep all issue #25 types rejected in this task. Keep traversal cycle-safe and
skip location/range metadata.

- [ ] **Step 6: Implement iterative pattern `BoundNames`**

Extend `boundNames` with an explicit worklist that handles:

```js
case 'ClassDeclaration':
  return [node.id.name];
case 'AssignmentPattern':
  // descend into .left only
case 'RestElement':
  // descend into .argument only
case 'ArrayPattern':
  // descend through non-null .elements in source order
case 'ObjectPattern':
  // descend through each Property.value or RestElement
```

Do not include computed keys or default expressions in bound names. Preserve
duplicates and source order.

- [ ] **Step 7: Run GREEN and regression gates**

Run:

```bash
node test/run-node.js test/parser.test.js test/static-semantics.test.js
npm run typecheck
git diff --check
```

Expected: all pass; real issue #25 syntax remains explicitly rejected.

- [ ] **Step 8: Commit**

```bash
git add src/parser.js src/evaluator/static-semantics.js test/parser.test.js test/static-semantics.test.js
git commit -m "refactor: gate ES2015 syntax by AST shape" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 9: Run task review gates**

Dispatch a fresh specification reviewer against Task 1 and the approved design,
then a fresh code-quality reviewer against the Task 1 diff. For each accepted
finding, add the narrowest failing parser/static-semantics regression, observe
RED, fix, rerun Step 7, and commit:

```bash
git commit -am "fix: address parser gate review" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Destructuring Declarations, Assignment, and Loop Bindings

**Files:**

- Create: `src/evaluator/patterns.js`
- Create: `src/evaluator/property-name.js`
- Modify: `src/parser.js`
- Modify: `src/evaluator/declarations.js:736-817`
- Modify: `src/evaluator/expressions.js:97-114,511-547`
- Modify: `src/evaluator/statements.js:451-850`
- Modify: `test/suites.js`
- Create: `test/destructuring.test.js`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: `boundNames`, `getIterator`, `iteratorStep`, `iteratorValue`, `iteratorClose`, `Reference`, `putValue`, `toObject`, and `toPropertyKey`.
- Produces:

```js
export function evaluatePropertyName(node, computed, context) {}
export function initializeBindingPattern(pattern, value, env, context) {}
export function assignPattern(pattern, value, context) {}
```

`evaluatePropertyName` returns `string | symbol`; the two pattern functions
return `void`.

- [ ] **Step 1: Add portable destructuring RED tests**

Create `test/destructuring.test.js` with a `val(realm, source)` helper and cases
covering:

```js
var log = [];
var source = {
  get first() {
    log.push('first');
    return 1;
  },
  get second() {
    log.push('second');
    return undefined;
  },
};
var { first: a, second: b = 2 } = source;
log.join(',') + ':' + a + ':' + b;
// "first,second:1:2"
```

```js
var nextCalls = 0,
  returnCalls = 0;
var iterable = {};
iterable[Symbol.iterator] = function () {
  return {
    next: function () {
      nextCalls += 1;
      return { value: nextCalls, done: false };
    },
    return: function () {
      returnCalls += 1;
      return {};
    },
  };
};
var [head] = iterable;
head + ':' + nextCalls + ':' + returnCalls;
// "1:1:1"
```

Also test nested patterns, holes, array rest, computed object keys, destructuring
assignment return value, member-expression assignment targets, `var`/`let`/
`const`, `for`/`for-in`/`for-of` heads, default-on-`undefined` only, and original
throw precedence when iterator `return` throws.

- [ ] **Step 2: Register and run RED**

Register the suite in `PORTABLE_SUITES`, then run:

```bash
node test/run-node.js test/destructuring.test.js
```

Expected: FAIL at parse time with `destructuring patterns are not supported`.

- [ ] **Step 3: Add parser boundary tests**

Assert accepted real source for declaration, assignment, and loop patterns.
Assert rejected source for object rest/spread and invalid rest placement:

```js
parseScript('var {x: y} = value; [a, ...rest] = values;');
assertThrows(() => parseScript('var {...rest} = value;'), SyntaxError);
assertThrows(() => parseScript('var [a, ...rest, last] = value;'), SyntaxError);
```

- [ ] **Step 4: Implement property-name evaluation**

In `src/evaluator/property-name.js`, evaluate computed keys exactly once:

```js
export function evaluatePropertyName(node, computed, context) {
  return computed
    ? toPropertyKey(evaluateExpressionValue(node, context))
    : node.type === 'Identifier'
      ? node.name
      : toPropertyKey(node.value);
}
```

Reject regex literals and unsupported nodes explicitly.

- [ ] **Step 5: Implement pattern initialization and assignment**

Use one recursive semantic dispatcher with explicit stack-guard accounting:

```js
export function initializeBindingPattern(pattern, value, env, context) {
  applyPattern(pattern, value, context, (target, nextValue) => {
    const reference = getIdentifierReference(env, target.name, context.strict);
    const record = /** @type {DeclarativeEnvironmentRecord} */ (reference.base);
    record.initializeBinding(target.name, nextValue);
  });
}

export function assignPattern(pattern, value, context) {
  applyPattern(pattern, value, context, (target, nextValue) => {
    const reference = /** @type {Reference} */ (
      evaluateExpression(target, context)
    );
    putValue(reference, nextValue);
  });
}
```

For array patterns, acquire the iterator once, consume left to right, collect
rest into a realm-owned `EngineArray`, and close on normal early exhaustion of
the pattern. If pattern processing throws, close with `completionIsThrow: true`
and rethrow the original error. Do not close when `IteratorStep` or
`IteratorValue` itself throws.

- [ ] **Step 6: Wire declarations, assignments, and loops**

Replace direct `.id.name` paths with `boundNames` plus
`initializeBindingPattern`/`assignPattern`. For `var`, create an assignment
mode that resolves existing bindings rather than initializing them. For
destructuring assignment, evaluate the right side once, assign the pattern, and
return the original right-side value.

- [ ] **Step 7: Enable only supported pattern shapes**

Permit object/array/assignment/rest nodes only in declaration, assignment, and
loop binding/assignment contexts. Continue rejecting patterns in parameters
until Task 3 and object rest everywhere.

- [ ] **Step 8: Run GREEN and focused regressions**

Run:

```bash
node test/run-node.js test/destructuring.test.js test/lexical-declarations.test.js test/for-of.test.js test/parser.test.js test/static-semantics.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/evaluator/patterns.js src/evaluator/property-name.js src/parser.js src/evaluator/declarations.js src/evaluator/expressions.js src/evaluator/statements.js test/destructuring.test.js test/parser.test.js test/suites.js
git commit -m "feat: implement ES2015 destructuring" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 10: Run task review gates**

Run fresh spec and quality reviewers. Pin every accepted ordering,
IteratorClose, TDZ, or assignment-target finding with RED in
`test/destructuring.test.js`, fix it, rerun Step 8, and commit review fixes.

---

### Task 3: Default, Rest, and Destructuring Parameters

**Files:**

- Modify: `src/parser.js`
- Modify: `src/evaluator/declarations.js:261-372,598-734`
- Modify: `src/runtime/function-object.js:12-125,410-509`
- Modify: `src/evaluator/dynamic-function.js`
- Modify: `test/suites.js`
- Create: `test/function-parameters.test.js`
- Modify: `test/functions.test.js`
- Modify: `test/dynamic-function.test.js`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: Task 2 pattern initialization and `boundNames`.
- Produces expanded `EngineFunctionOptions`:

```js
/**
 * @typedef {{
 *   realm: Realm,
 *   formalParameters: readonly any[],
 *   parameterNames: readonly string[],
 *   expectedArgumentCount: number,
 *   simpleParameterList: boolean,
 *   scope: EnvironmentRecordLike,
 *   strict: boolean,
 *   execute: FunctionBodyExecutor,
 *   name?: string,
 *   isMethod?: boolean,
 *   createPrototype?: boolean,
 * }} EngineFunctionOptions
 */
```

`createArgumentsObject(functionObject, args, env, mapped)` receives an explicit
boolean mapping decision.

- [ ] **Step 1: Add parameter RED tests**

Create focused cases for:

```js
(function (a = 1, b = a + 1, { c } = { c: b + 1 }, ...rest) {
  return [a, b, c, rest.join(','), arguments.length].join(':');
})(undefined, undefined, undefined, 4, 5);
// "1:2:3:4,5:5"
```

```js
var a = 9;
(function (
  a = function () {
    return a;
  },
) {
  return a() === a;
})();
// true
```

```js
(function (a = x) {
  var x = 1;
  return a;
})();
// ReferenceError: the body var environment is not visible to parameter defaults
```

Also assert function `length`, rest array realm/prototype, defaults'
left-to-right TDZ, destructuring parameters, non-simple unmapped `arguments`,
simple sloppy mapped `arguments`, strict unmapped arguments, duplicate-simple
sloppy acceptance, duplicate non-simple rejection, and dynamic `Function`
support.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/function-parameters.test.js
```

Expected: parse-time failure for default/rest/pattern parameters.

- [ ] **Step 3: Pin parser early errors**

Add:

```js
assertThrows(
  () => parseScript('function f(a = 1) { "use strict"; }'),
  SyntaxError,
);
assertThrows(() => parseScript('function f(a = 1, a) {}'), SyntaxError);
parseScript('function f(a, a) {}');
```

Retain generator/async parameter forms as explicit unsupported errors.

- [ ] **Step 4: Add formal-parameter metadata**

In `createFunctionObject`, derive:

```js
const parameterNames = node.params.flatMap(boundNames);
const simpleParameterList = node.params.every(
  (parameter) => parameter.type === 'Identifier',
);
const expectedArgumentCount = firstOptionalIndex(node.params);
```

Pass the AST list and metadata into `EngineFunction`. Define `length` from
`expectedArgumentCount`, not flattened names.

- [ ] **Step 5: Generalize function declaration instantiation**

Implement ES2015 parameter setup in this order:

1. create all parameter bindings uninitialized;
2. create mapped arguments only for non-strict simple lists;
3. evaluate parameters left to right through `initializeBindingPattern`;
4. put rest arguments in `EngineArray`;
5. for non-simple lists, create a distinct body variable environment and copy
   parameter values only where ES2015 function-declaration/`var` rules require;
6. instantiate body functions, `var`s, and lexical declarations in their
   specification environments.

Do not create an own `arguments` binding when the eventual Task 7
`functionKind` is `arrow`.

- [ ] **Step 6: Enable parameter shapes and dynamic functions**

Allow `AssignmentPattern`, array/object patterns, and final `RestElement` under
ordinary function parameter arrays. Dynamic `Function` parameter text already
routes through the parser; update only assumptions that parameter ASTs are
identifiers.

- [ ] **Step 7: Run GREEN and focused regressions**

```bash
node test/run-node.js test/function-parameters.test.js test/functions.test.js test/function-builtins.test.js test/dynamic-function.test.js test/lexical-declarations.test.js test/parser.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

- [ ] **Step 8: Commit**

```bash
git add src/parser.js src/evaluator/declarations.js src/runtime/function-object.js src/evaluator/dynamic-function.js test/function-parameters.test.js test/functions.test.js test/dynamic-function.test.js test/parser.test.js test/suites.js
git commit -m "feat: implement ES2015 function parameters" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 9: Run task review gates**

Require reviewers to inspect parameter/body environment separation, arguments
mapping, duplicate/strict early errors, closure capture, and function `length`.
Fix accepted findings test-first and rerun Step 7.

---

### Task 4: Iterable Spread in Arrays, Calls, and Construction

**Files:**

- Create: `src/evaluator/iteration.js`
- Modify: `src/parser.js`
- Modify: `src/evaluator/expressions.js:595-760,677-689,986-1021`
- Modify: `test/suites.js`
- Create: `test/spread.test.js`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: #26 `getIterator`, `iteratorStep`, `iteratorValue`; realm-owned `EngineArray`.
- Produces:

```js
export function iterableToList(realm, value) {}
```

Return type is `unknown[]`. `evaluateArguments(nodes, context)` expands
`SpreadElement` nodes through this helper.

- [ ] **Step 1: Add spread RED tests**

Cover:

```js
var order = [];
function mark(name, value) {
  order.push(name);
  return value;
}
function f() {
  return Array.prototype.join.call(arguments, ',');
}
var result = f(mark('a', 1), ...mark('spread', [2, 3]), mark('b', 4));
order.join(',') + ':' + result;
// "a,spread,b:1,2,3,4"
```

```js
var a = [0, ...'𝌆', 2];
a.length + ':' + a[1] + ':' + a[2];
// "3:𝌆:2"
```

Also test multiple spreads, holes versus `undefined`, custom iterator next
lookup once, non-iterable TypeError,
iterator-step/value abrupt propagation, `new C(...args)`, and spread into bound
and ordinary functions.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/spread.test.js
```

Expected: parse-time `spread elements are not supported`.

- [ ] **Step 3: Implement `iterableToList`**

```js
export function iterableToList(realm, value) {
  const iterator = getIterator(realm, value);
  const values = [];
  while (true) {
    const step = iteratorStep(iterator);
    if (step === false) return values;
    values.push(iteratorValue(step));
  }
}
```

Do not call `IteratorClose` for iterator-step/value failures; the specification
does not close in those paths.

- [ ] **Step 4: Expand spread at each consumer**

Update `evaluateArguments` to preserve left-to-right evaluation:

```js
for (const argument of nodes) {
  if (argument.type === 'SpreadElement') {
    args.push(
      ...iterableToList(
        context.realm,
        evaluateExpressionValue(argument.argument, context),
      ),
    );
  } else {
    args.push(evaluateExpressionValue(argument, context));
  }
}
```

Avoid host argument spreading when invoking guest calls if it could hit host
argument limits; store the expanded values in the array and pass that array to
`callFunction`/`constructFunction`. Build array literals by a running guest
index, not `node.elements.length`.

- [ ] **Step 5: Enable spread only in ES2015 contexts**

Permit `SpreadElement` in call arguments, `new` arguments, and array elements.
Continue rejecting object spread and any custom AST placement outside those
arrays.

- [ ] **Step 6: Run GREEN and focused regressions**

```bash
node test/run-node.js test/spread.test.js test/object-array-literals.test.js test/functions.test.js test/iterators.test.js test/parser.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

- [ ] **Step 7: Commit and review**

Commit:

```bash
git add src/evaluator/iteration.js src/evaluator/expressions.js src/parser.js test/spread.test.js test/parser.test.js test/suites.js
git commit -m "feat: implement ES2015 spread syntax" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Then run fresh spec/quality reviews, fix accepted findings test-first, and rerun
Step 6.

---

### Task 5: Enhanced Object Literals and Computed Property Names

**Files:**

- Modify: `src/parser.js`
- Modify: `src/evaluator/property-name.js`
- Modify: `src/evaluator/declarations.js:598-663`
- Modify: `src/evaluator/expressions.js:875-984`
- Modify: `src/runtime/object.js:50-115`
- Modify: `test/suites.js`
- Create: `test/enhanced-object-literals.test.js`
- Modify: `test/object-array-literals.test.js`
- Modify: `test/es2015-object-function.test.js`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: `evaluatePropertyName`, `createFunctionObject`, `EngineObject#defineOwnProperty`, `EngineObject#setPrototypeOf`, and #26 HomeObject/super support.
- Produces:

```js
export function functionNameFromPropertyKey(key, prefix = '') {}
```

Return type is `string`; Symbol keys use `[description]` formatting.

- [ ] **Step 1: Add enhanced-object RED tests**

Cover:

```js
var x = 1,
  key = 'k',
  calls = 0;
var o = {
  x,
  [key + ++calls]: function () {},
  m(a) {
    return super.value + a;
  },
  get [key]() {
    return 2;
  },
  set [key](value) {
    x = value;
  },
};
```

Assert shorthand value, one computed-key evaluation, inferred anonymous
function name, concise method/accessor descriptors, non-constructibility,
string and Symbol computed keys, `super` receiver behavior, and left-to-right
overwrite behavior.

Add `__proto__` cases:

```js
var proto = { inherited: 1 };
var a = { __proto__: proto };
var b = { ['__proto__']: proto };
var c = {
  __proto__() {
    return 1;
  },
};
```

Assert only `a` changes prototype; `b` and `c` have ordinary own properties.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/enhanced-object-literals.test.js
```

Expected: parse-time computed/shorthand/method rejection.

- [ ] **Step 3: Implement property names and method creation**

Use `evaluatePropertyName` before evaluating each value. For data properties,
perform NamedEvaluation for anonymous function/class values. For concise
methods/accessors, call:

```js
createFunctionObject(property.value, context.env, context, {
  name: functionNameFromPropertyKey(
    key,
    property.kind === 'init' ? '' : property.kind,
  ),
  isMethod: true,
  homeObject: object,
  createPrototype: false,
});
```

Methods/accessors remain non-constructible. Merge getter/setter descriptors
without losing the paired accessor.

- [ ] **Step 4: Implement ES2015 `__proto__` literal semantics**

For a non-computed, non-shorthand, non-method `init` property whose static key
is `"__proto__"`, evaluate the value and call `setPrototypeOf` only for
`EngineObject` or `null`; ignore primitive values. Never apply this rule to a
computed key or method.

- [ ] **Step 5: Enable exact object property shapes**

Allow shorthand, computed properties, and non-generator concise methods.
Continue rejecting generators and any object `SpreadElement`.

- [ ] **Step 6: Run GREEN and focused regressions**

```bash
node test/run-node.js test/enhanced-object-literals.test.js test/object-array-literals.test.js test/es2015-object-function.test.js test/parser.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

- [ ] **Step 7: Commit and review**

Commit the task, then run fresh spec and quality reviews. Review must explicitly
check `__proto__`, computed Symbol names, HomeObject, method constructibility,
descriptor attributes, and evaluation order. Fix accepted findings test-first.

---

### Task 6: Template Literals and Tagged Template Objects

**Files:**

- Modify: `src/parser.js`
- Modify: `src/evaluator/expressions.js`
- Modify: `src/runtime/realm.js`
- Modify: `src/runtime/object.js`
- Modify: `src/builtins/object.js`
- Modify: `test/suites.js`
- Create: `test/template-literals.test.js`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: `toString`, `Reference` call receiver logic, `EngineArray`, realm intrinsics, and engine property descriptors.
- Produces shared integrity helper and realm method:

```js
export function setIntegrityLevel(object, level) {}
getTemplateObject(node) {}
```

`setIntegrityLevel` accepts `"sealed" | "frozen"` and returns the object after
applying descriptor changes and `preventExtensions`. `getTemplateObject`
returns one frozen realm-owned `EngineArray` per `TemplateLiteral` AST node
identity in that realm and stores the cache in `Realm#templateObjects`.

- [ ] **Step 1: Add template RED tests**

Cover untagged conversion/order:

```js
var log = [];
var x = {
  toString: function () {
    log.push('x');
    return 'X';
  },
};
var y = {
  toString: function () {
    log.push('y');
    return 'Y';
  },
};
var result = `a${x}b${y}c`;
result + ':' + log.join(',');
// "aXbYc:x,y"
```

Cover tag receiver/order, raw/cooked values, descriptors, frozen/non-extensible
arrays, and identity:

```js
function tag(strings) {
  return strings;
}
function site() {
  return tag`a\n${1}b`;
}
var first = site(),
  second = site();
first === second;
// true
```

Assert a second syntactic site is distinct and evaluating the same function AST
in another realm produces another template object.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/template-literals.test.js
```

Expected: parse-time template rejection.

- [ ] **Step 3: Implement untagged templates**

Add `TemplateLiteral` to `EXPRESSION_TYPES`. Start with the first cooked quasi,
then for each expression append `ToString(value)` and the next cooked quasi.
Reject a missing cooked value for untagged templates.

- [ ] **Step 4: Implement realm-scoped template cache**

Initialize:

```js
/** @type {WeakMap<object, EngineArray>} */
this.templateObjects = new WeakMap();
```

Extract the existing `Object.seal`/`Object.freeze` descriptor loops from
`src/builtins/object.js` into `setIntegrityLevel` in `src/runtime/object.js`,
then make those built-ins call the helper so template objects and guest
`Object.freeze` share exactly one integrity algorithm.

Build cooked and raw `EngineArray` objects with non-writable,
non-enumerable/non-configurable `raw`, correct indexed descriptors and `length`,
then freeze both using engine integrity operations. Cache by AST node identity
on the realm.

- [ ] **Step 5: Implement tagged calls**

Evaluate the tag to a reference/value first, derive its call receiver with the
same `referenceThisValue` logic as ordinary calls, retrieve the cached template
object, evaluate substitutions left to right, validate callability, and invoke
with `[templateObject, ...substitutions]`. Preserve `undefined` cooked entries
for invalid tagged escapes when Acorn supplies them.

- [ ] **Step 6: Enable template AST shapes**

Allow `TemplateLiteral`, `TemplateElement`, and `TaggedTemplateExpression`.
Continue rejecting templates containing any separately unsupported nested AST
shape.

- [ ] **Step 7: Run GREEN and focused regressions**

```bash
node test/run-node.js test/template-literals.test.js test/evaluator-expressions.test.js test/object-builtins.test.js test/parser.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

- [ ] **Step 8: Commit and review**

Commit, then run fresh spec/quality reviews focused on parse-site/realm identity,
tag receiver, invalid escapes, raw/cooked descriptors, freezing, and order. Fix
accepted findings test-first and rerun Step 7.

---

### Task 7: Arrow Functions and Lexical Function Environments

**Files:**

- Modify: `src/parser.js`
- Modify: `src/evaluator/index.js:5-36`
- Modify: `src/evaluator/declarations.js:598-734`
- Modify: `src/evaluator/expressions.js:97-178,875-901`
- Modify: `src/runtime/environment.js`
- Modify: `src/runtime/function-object.js:12-268`
- Modify: `test/suites.js`
- Create: `test/arrow-functions.test.js`
- Modify: `test/function-parameters.test.js`
- Modify: `test/parser.test.js`

**Interfaces:**

- Consumes: Task 3 parameter instantiation and Task 5 function-name inference.
- Produces execution/function-environment helpers:

```js
export function createFunctionExecutionEnvironment(options) {}
export function getThisBinding(functionEnvironment) {}
export function bindThisValue(functionEnvironment, value) {}
export function getSuperHomeObject(functionEnvironment) {}
```

Arrow `EngineFunction` objects carry a reference to the enclosing function
environment; they do not own a HomeObject.

- [ ] **Step 1: Add arrow RED tests**

Cover:

```js
var holder = {
  value: 4,
  method: function () {
    var arrow = (add = 1, ...rest) =>
      this.value + add + rest.length + arguments[0];
    return arrow(undefined, 7, 8);
  },
};
holder.method(3);
// 4 + 1 + 2 + 3 = 10
```

Add concise/block bodies, empty/single/parenthesized params, destructuring and
rest/default params, lexical strictness, inferred names, no `prototype`,
`new arrow()` TypeError, lexical `arguments`, lexical `this`, and an arrow nested
in an object concise method using `super.value`.

- [ ] **Step 2: Run RED**

```bash
node test/run-node.js test/arrow-functions.test.js
```

Expected: parse-time arrow rejection.

- [ ] **Step 3: Introduce function execution environment metadata**

Represent the active function semantics separately from an arrow:

```js
/**
 * @typedef {{
 *   outer: FunctionExecutionEnvironment | undefined,
 *   thisStatus: 'lexical' | 'uninitialized' | 'initialized',
 *   thisValue: unknown,
 *   homeObject?: EngineObject,
 *   newTarget?: unknown,
 *   superConstructor?: unknown,
 * }} FunctionExecutionEnvironment
 */
```

Ordinary/method functions create a new record. Arrows retain the enclosing
record unchanged. `getThisBinding` and `getSuperHomeObject` walk through lexical
records; they throw the existing guest errors for missing/uninitialized values.
Do not add `homeObject` to an arrow.

- [ ] **Step 4: Generalize function runtime options**

Add `functionKind: "normal" | "method" | "arrow" | "classConstructor"`,
`thisMode: "global" | "strict" | "lexical"`, `constructible`, and
`createPrototype`. Arrows use lexical mode, `constructible: false`,
`createPrototype: false`; ordinary methods remain non-constructible with their
own HomeObject-bearing function environment.

- [ ] **Step 5: Create and execute arrows**

Add `ArrowFunctionExpression` dispatch. Reuse Task 3 parameters. For expression
bodies, return:

```js
createReturnCompletion(evaluateExpressionValue(node.body, context));
```

For block bodies, run declaration instantiation and statement evaluation.
Skip own `arguments` creation. Inferred names use the same NamedEvaluation paths
as anonymous function expressions.

- [ ] **Step 6: Enable arrow shapes**

Permit non-generator/non-async `ArrowFunctionExpression`, including supported
parameter shapes and expression/block bodies. Continue rejecting `new.target`
and any generator/async/custom unsupported flags.

- [ ] **Step 7: Run GREEN and focused regressions**

```bash
node test/run-node.js test/arrow-functions.test.js test/function-parameters.test.js test/functions.test.js test/enhanced-object-literals.test.js test/es2015-object-function.test.js test/parser.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

- [ ] **Step 8: Commit and review**

Commit, then run fresh spec/quality reviews. Review must reject any design where
an arrow owns HomeObject/this/arguments/super and inspect nested arrows,
accessor/method super, call/construct metadata, and name/length. Fix findings
test-first.

---

### Task 8: Classes, Methods, Heritage, and Derived Construction

**Files:**

- Create: `src/evaluator/classes.js`
- Modify: `src/parser.js`
- Modify: `src/evaluator/static-semantics.js`
- Modify: `src/evaluator/declarations.js`
- Modify: `src/evaluator/expressions.js`
- Modify: `src/evaluator/statements.js`
- Modify: `src/evaluator/index.js`
- Modify: `src/runtime/environment.js`
- Modify: `src/runtime/function-object.js`
- Modify: `src/runtime/descriptors.js`
- Modify: `src/builtins/shared.js`
- Modify: `test/suites.js`
- Create: `test/classes.test.js`
- Modify: `test/parser.test.js`
- Modify: `test/lexical-declarations.test.js`

**Interfaces:**

- Consumes: Task 7 function execution environments, Task 5 property names and
  method creation, Task 4 argument expansion, #26 super property references.
- Produces:

```js
export function evaluateClassDefinition(node, context, bindingName) {}
```

It returns the class constructor `EngineFunction`.
`constructFunction(args = [], newTarget = this)` is supported by every
constructor-like engine object. `EvaluationContext` carries the active function
environment, not class-specific globals.

- [ ] **Step 1: Add class parser/static-error RED tests**

Pin class strictness and static `PropName` distinctions:

```js
assertThrows(
  () => parseScript('class C { constructor() {} constructor(a) {} }'),
  SyntaxError,
);
assertThrows(
  () => parseScript('class C { static prototype() {} }'),
  SyntaxError,
);
parseScript('class C { ["constructor"]() {} static ["prototype"]() {} }');
```

Also pin generator methods unsupported, invalid `super()` placement, duplicate
constructor restrictions, accessor constructor restrictions, and class-body
strict errors such as `class C { m(eval) {} }`.

- [ ] **Step 2: Add base-class RED tests**

Cover class declaration TDZ and post-initialization mutability:

```js
var before;
try {
  C;
} catch (error) {
  before = error.name;
}
class C {
  constructor(value) {
    this.value = value;
  }
  method() {
    return this.value;
  }
  static make(value) {
    return new this(value);
  }
}
var instance = C.make(4);
var original = C;
C = 1;
[before, instance.method(), instance instanceof original, C].join(':');
// "ReferenceError:4:true:1"
```

Test named class-expression inner immutable name, outer non-leakage, exact
constructor/prototype/method descriptors, class ordinary-call TypeError,
computed instance `"constructor"` method allowed, computed static `"prototype"`
method allowed, static and instance inheritance, computed-name order, accessors,
and default base constructor.

- [ ] **Step 3: Add derived-class RED tests**

Cover:

```js
class Base {
  constructor(a, b) {
    this.sum = a + b;
  }
  value() {
    return this.sum;
  }
}
class Derived extends Base {
  constructor(a, b) {
    super(a, b);
    this.extra = 1;
  }
  value() {
    return super.value() + this.extra;
  }
}
new Derived(2, 3).value();
// 6
```

Add uninitialized `this`, `super()` exactly once, derived object return without
super, undefined return requiring initialized this, primitive return TypeError,
default derived forwarding, `extends null`, invalid non-constructor heritage,
and super-property receiver behavior.

- [ ] **Step 4: Run RED**

```bash
node test/run-node.js test/classes.test.js test/parser.test.js
```

Expected: class parse-time rejection.

- [ ] **Step 5: Integrate class lexical declarations**

Class declarations join lexical declaration lists. Declaration instantiation
creates mutable uninitialized bindings (`createMutableBinding`, not immutable).
Statement evaluation computes the class then initializes the binding. Named
class expressions create a fresh inner environment with an immutable
uninitialized binding, evaluate the class in it, then initialize it.

- [ ] **Step 6: Generalize construction**

Update callable/constructor JSDoc and every native/bound constructor to accept
an optional `newTarget`. For `EngineFunction`:

- ordinary constructors allocate from `newTarget.prototype`;
- class base constructors allocate/bind `this` before the body;
- class constructors reject `callFunction`;
- derived constructors begin with `thisStatus: "uninitialized"`;
- `super(...)` calls the active superclass constructor with the current
  `newTarget`, then `bindThisValue` exactly once;
- derived return completion applies object/undefined/primitive rules.

No guest-visible `new.target` expression is enabled.

- [ ] **Step 7: Implement class definition evaluation**

In `evaluateClassDefinition`:

1. create/use the class-name environment;
2. evaluate heritage under class-name TDZ;
3. validate heritage and choose constructor/instance prototypes;
4. create explicit or default base/derived constructor;
5. define non-writable `prototype` on the constructor and non-writable
   `constructor` on the prototype with ES2015 attributes;
6. evaluate computed keys left to right;
7. define strict, non-constructible instance/static methods/accessors with
   correct HomeObject and names; and
8. set constructor inheritance for `extends`.

Only non-computed static `PropName` determines the constructor role or static
`prototype` early error. Computed runtime values remain ordinary definitions.

- [ ] **Step 8: Enable exact class shapes**

Allow ES2015 `ClassDeclaration`, `ClassExpression`, `ClassBody`, and
non-generator/non-async `MethodDefinition` shapes. Continue rejecting fields,
private names, static blocks, decorators, generators, and `new.target`.

- [ ] **Step 9: Run GREEN and focused regressions**

```bash
node test/run-node.js test/classes.test.js test/arrow-functions.test.js test/enhanced-object-literals.test.js test/function-parameters.test.js test/lexical-declarations.test.js test/es2015-object-function.test.js test/parser.test.js
npm run typecheck
npm run lint -- --quiet
git diff --check
```

- [ ] **Step 10: Commit and review**

Commit, then run fresh spec and quality reviews. Review must explicitly inspect
class-name TDZ/mutability, named-expression immutability, strict bodies, static
PropName rules, descriptors, constructor call rejection, base/derived returns,
uninitialized/once-only `this`, default derived forwarding, heritage, super
calls/properties, and new-target non-exposure. Fix every accepted finding
test-first and rerun Step 9.

---

### Task 9: Targeted Test262 Policy, UTC Artifacts, and Documentation

**Files:**

- Create: `test/ci/es2015-syntax-test262.test.js`
- Modify: `test/run-ci-contract.js`
- Modify: `tools/test262/features.json`
- Modify: `tools/test262/es5-selection.json`
- Modify generated: `tools/test262/upstream-subset.json`
- Modify generated: `docs/test262-report.jsonl`
- Modify: `docs/conformance.md`
- Modify: `docs/architecture.md`
- Modify: `docs/limitations.md`
- Modify: `docs/testing.md`
- Modify: `README.md`
- Modify: `test/es5-selection.test.js`
- Modify: `test/ci/full-contract.test.js`

**Interfaces:**

- Consumes: all implemented syntax families and Test262 selection/probe tooling.
- Produces exact feature probes for:

```text
arrow-function
class
computed-property-names
default-parameters
destructuring-assignment
destructuring-binding
rest-parameters
spread-syntax
template
```

Use only feature names confirmed in the pinned Test262 metadata inventory.

- [ ] **Step 1: Establish targeted upstream inventory**

Create the pinned checkout if it is absent, using the documented exact commands:

```bash
git clone --filter=blob:none https://github.com/tc39/test262.git vendor/test262
git -C vendor/test262 checkout b363f29d3c43c626dc852744ad64a0b48a003693
```

List candidate files without running the complete subset:

```bash
git -C vendor/test262 rev-parse HEAD
rg -l 'features: \\[.*arrow-function' vendor/test262/test/language | head -40
rg -l 'features: \\[.*class' vendor/test262/test/language | head -40
rg -l 'features: \\[.*template' vendor/test262/test/language | head -40
rg -l 'features: \\[.*destructuring' vendor/test262/test/language | head -80
rg -l 'features: \\[.*(default-parameters|rest-parameters|spread-syntax|computed-property-names)' vendor/test262/test/language | head -120
```

Expected pinned revision:
`b363f29d3c43c626dc852744ad64a0b48a003693`.

- [ ] **Step 2: Add feature-policy RED tests**

In `test/es5-selection.test.js`, assert the old excluded language directories
for computed properties, destructuring, and rest parameters are removed and
that exact language feature areas are claimed. In
`test/ci/full-contract.test.js`, assert each feature probe executes and each
claimed prefix contains no unclaimed neighboring feature.

Run:

```bash
node test/run-node.js test/es5-selection.test.js
```

Expected: FAIL because the policy still excludes the new syntax and has no
probes.

- [ ] **Step 3: Add executable feature probes**

Each probe must exercise its semantics, not `typeof` alone. Examples:

```js
// arrow-function
var receiver = {
  value: 1,
  method: function () {
    return (() => this.value)();
  },
};
if (receiver.method() !== 1) throw new Error('arrow lexical this failed');

// class
class Base {
  value() {
    return 1;
  }
}
class Derived extends Base {
  value() {
    return super.value() + 1;
  }
}
if (new Derived().value() !== 2) throw new Error('class semantics failed');

// destructuring-binding
var [a, { b = 2 }] = [1, {}];
if (a !== 1 || b !== 2) throw new Error('destructuring binding failed');
```

Create equivalently specific probes for every confirmed feature name.

- [ ] **Step 4: Add a narrow focused Test262 suite**

Select a reviewable list of positive and negative files per family, including
ordering/abrupt-completion cases and the computed class-name distinctions. Run
only:

```bash
TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js
```

Expected before policy/exclusion fixes: exact failures recorded by file and
phase. Add a classified exclusion only for a proven missing out-of-scope
dependency; do not weaken semantics or claim its feature.

- [ ] **Step 5: Update policy and regenerate under UTC**

Add exact prefix/tag feature areas and remove only obsolete excluded directories.
Generate:

```bash
TZ=UTC npm run test262:select
```

Do not run the complete local upstream suite. Then prove deterministic output:

```bash
TZ=UTC npm run test262:select:check
npm run test262:exclusions:check
git diff --check
```

- [ ] **Step 6: Update documentation**

Document the new grammar and execution flow, parameter/function/class
environments, template cache ownership, supported Test262 features, targeted CI
suite, and remaining explicit syntax rejections. Remove the obsolete broad
"all ES2015 syntax rejected" limitation and replace it with the exact out-of-
scope list.

- [ ] **Step 7: Run focused GREEN gates**

```bash
node test/run-node.js test/es5-selection.test.js
TZ=UTC node test/run-node.js test/ci/es2015-syntax-test262.test.js
TZ=UTC npm run test262:select:check
npm run test262:exclusions:check
npm run ci:contract
npm run typecheck
git diff --check
```

- [ ] **Step 8: Commit and review**

Commit policy, generated artifacts, tests, and docs. Run fresh spec/quality
reviews focused on claim precision, feature-probe strength, unsupported-neighbor
filtering, UTC determinism, and documentation accuracy. Fix accepted findings
test-first and rerun Step 7.

---

### Task 10: Integration, Portability, CI, Review, PR, and Release

**Files:**

- Create: `test/es2015-syntax-integration.test.js`
- Modify: `test/suites.js`
- Modify: `docs/conformance.md`
- No production file change is planned; a preserved integration RED must name
  the owning source file before a review-fix commit adds it to this task.

**Interfaces:**

- Consumes: every syntax family, shared runtime foundations, generated Test262 selection, and repository CI.
- Produces: one reviewed/pushed PR, green required CI, squash merge, closed #25, updated #24, and newly unblocked #28.

- [ ] **Step 1: Add cross-family integration RED tests**

Create combinations rather than duplicate unit cases:

```js
class Counter {
  constructor(start = 0) {
    this.values = [start];
  }
  addAll(...items) {
    items.forEach((item) => this.values.push(item));
    return this;
  }
  summary(tag = `${this.values.length}`) {
    var [first, ...rest] = this.values;
    return { [tag]: `${first}:${rest.join(',')}` };
  }
}
var key = 'result';
new Counter().addAll(...[1, 2]).summary(key)[key];
// "0:1,2"
```

Add a tagged-template method containing an arrow that resolves enclosing
`this`/`super`, destructured non-simple class method parameters, computed Symbol
methods, derived default forwarding with spread, direct eval of each supported
family, and dynamic `Function` for supported function-body forms.

- [ ] **Step 2: Run integration RED**

```bash
node test/run-node.js test/es2015-syntax-integration.test.js
```

Expected: if all isolated features compose correctly, the first run may already
be GREEN. If so, retain the integration suite as proof and do not invent a
production change. If it fails, record the exact case and fix only after the
failure is preserved.

- [ ] **Step 3: Run focused portable hosts**

```bash
node test/run-node.js \
  test/destructuring.test.js \
  test/function-parameters.test.js \
  test/spread.test.js \
  test/enhanced-object-literals.test.js \
  test/template-literals.test.js \
  test/arrow-functions.test.js \
  test/classes.test.js \
  test/es2015-syntax-integration.test.js
npm run test:browser
npm run test:jsc
```

Browser/JSC run the portable registry because their runners do not accept the
Node selector. Expected: zero failures and equivalent portable totals.

- [ ] **Step 4: Run repository gates without complete local Test262**

```bash
npm run vendor:check
npm run format
npm run lint
npm run typecheck
TZ=UTC npm run test262:fixtures
TZ=UTC npm run test262:select:check
npm run test262:exclusions:check
npm run ci:check
npm run ci:contract
npm run benchmark:smoke
git diff --check
```

Do not run `npm run test262:upstream` locally. Required CI owns broad pinned
Test262 execution.

- [ ] **Step 5: Commit integration proof**

```bash
git add test/es2015-syntax-integration.test.js test/suites.js src docs
git commit -m "test: cover ES2015 syntax integration" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 6: Run Task 10 spec and quality reviews**

Dispatch fresh reviewers over Task 10 and the complete integration behavior.
Fix accepted findings test-first, rerun affected Step 3/4 gates, and commit.

- [ ] **Step 7: Run maximum-capability whole-branch review**

Dispatch a read-only `code-review` agent with:

```text
model: gpt-5.6-sol
reasoning_effort: max
scope: origin/main...HEAD
```

Provide issue #25, roadmap #24, approved spec `b35bdcc`, this plan, validation
results, explicit out-of-scope syntax, and require high-confidence correctness,
conformance, portability, Test262-policy, or release-gate findings only. For
each accepted finding: reproduce RED, fix, rerun affected gates, commit, and ask
the same reviewer to re-review until no high-confidence finding remains.

- [ ] **Step 8: Push and open the PR**

```bash
git status --short --branch
git push -u origin HEAD
```

Open a PR titled `Implement ES2015 syntax features` with `Closes #25`, scope,
unsupported forms, targeted local evidence, and the CI-owned broad Test262
statement.

- [ ] **Step 9: Monitor required CI while doing independent release work**

Use `gh pr checks --watch` only after independently preparing issue/roadmap
release evidence and reviewing the PR diff/metadata. Required CI must include
Node, Chromium, JSC, pinned Test262, static gates, selection/exclusions, and
repository contracts. Fix failures test-first, push, and repeat review for
changed code.

- [ ] **Step 10: Squash merge and delete the branch**

After required checks and review gates are green:

```bash
gh pr merge --squash --delete-branch
```

Confirm the merge commit is on `origin/main`.

- [ ] **Step 11: Publish issue and roadmap proof**

Comment on #25 with PR/merge link, syntax families, explicit remaining
rejections, Node/Chromium/JSC totals, targeted Test262 result, UTC generated
selection count, CI run URL, exclusions/static/benchmark results, and final
review outcome. Close #25 only after merge if `Closes #25` did not close it.

Comment on #24 that milestone 4 is complete with the same acceptance proof.
Comment on #28:

```text
Runtime foundations #26 and syntax milestone #25 are complete; #28 is now fully unblocked.
```

Verify:

```bash
gh issue view 25 --repo yoonbuck/jsjs --json state,closedAt,url
gh issue view 28 --repo yoonbuck/jsjs --json state,blockedBy,url
gh issue view 24 --repo yoonbuck/jsjs --json state,subIssuesSummary,url
```

Expected: #25 `CLOSED`, #28 open with no open blockers, roadmap progress updated.
