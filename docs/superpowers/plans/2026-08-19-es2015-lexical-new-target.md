# ES2015 Lexical Grammar and `new.target` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete issue #77 by admitting the exact ES2015 binary/octal and Unicode code-point lexical forms and implementing context-correct `new.target` parsing and evaluation.

**Architecture:** Keep pinned Acorn 8.18.0 at `ecmaVersion: 6` as the lexical authority, remove only P0's explicit post-parse refusals, and promote exact `MetaProperty(new.target)` through the parser capability boundary. Represent syntax availability separately from value with `FunctionExecutionEnvironment.newTargetStatus`, create that record before parameter instantiation, and reuse the record lexically for arrows and direct eval.

**Tech Stack:** Plain ES2020 JavaScript, JSDoc checked by TypeScript, Acorn 8.18.0, the portable Node/Chromium/JavaScriptCore harness, pinned Test262 `b363f29d3c43c626dc852744ad64a0b48a003693`, deterministic taxonomy tooling, GitHub Actions, and CodeQL.

## Global Constraints

- Start from exact `origin/main` `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`.
- Preserve `PARSER_OPTIONS.ecmaVersion: 6`; numeric separators and later syntax remain rejected.
- Do not preprocess source, fork Acorn, or add a second numeric/Unicode decoder.
- The authoritative core P0 ledger is 83 roots / 164 variants with SHA-256 `b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4`.
- Run only that exact ledger or smaller focused fixtures locally under `TZ=UTC`; never run broad local Test262.
- Keep the one Annex B path separate and non-blocking.
- Passing P0 roots lose their blocker; non-P0 semantic failures move by reviewed exact path to an existing owner.
- Do not add broad feature tags or change whole-tree taxonomy denominators.
- Every task is strict RED-first and receives a fresh specification review and fresh quality review before the next task.
- Review agents use GPT-5.6-family models or Claude Opus 4.8 or lower; never Claude Opus 5.
- Every commit includes `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`.

## File Responsibility Map

- `src/parser.js`: trusted/untrusted AST capability, context-sensitive early errors, exact `MetaProperty` shape, and removal of P0 lexical refusals.
- `src/runtime/environment.js`: `newTargetStatus`, `newTarget`, and the read helper for the nearest retained function record.
- `src/runtime/function-object.js`: ordinary call/construct/class environment creation and exact active-new-target propagation.
- `src/evaluator/expressions.js`: synchronous `MetaProperty` evaluation.
- `src/evaluator/generator-expression-frames.js`: resumable `MetaProperty` evaluation.
- `src/evaluator/eval.js`: direct-eval parser capability inheritance without losing the retained function environment.
- `src/evaluator/dynamic-function.js`: dynamic Function/GeneratorFunction parsing remains function-code aware through ordinary runtime paths.
- `src/evaluator/declarations.js`: parameter initialization already consumes the passed function environment; tests pin creation order and retained-record behavior.
- `src/api.js`, `src/evaluator/modules.js`: synthetic script/module records explicitly carry `newTargetStatus: "absent"`.
- `test/parser.test.js`: lexical matrices, locations, source/reusable/custom AST shape and context.
- `test/functions.test.js`, `test/function-parameters.test.js`, `test/classes.test.js`, `test/arrow-functions.test.js`: ordinary, parameter, class/super, method, and lexical-arrow runtime coverage.
- `test/eval.test.js`, `test/dynamic-function.test.js`, `test/generator-function.test.js`, `test/function-realm.test.js`: eval, dynamic constructor, generator, and cross-Realm coverage.
- `tools/test262/es2015-audit-evidence.json`: exact execution records and reviewed blocker removals/reassignments.
- `tools/test262/es2015-taxonomy.json`: deterministic generated post-P0 taxonomy.
- `docs/conformance.md`, `docs/testing.md`: only update if generated counts or P0 workflow prose changes.

---

### Task 1: Promote Exact ES2015 Lexical Forms

**Files:**

- Modify: `test/parser.test.js`
- Modify: `test/template-literals.test.js`
- Modify: `src/parser.js:4564-4586`
- Modify: `src/parser.js:7569-7607`
- Modify: `src/parser.js:7667-7702`

**Interfaces:**

- Consumes: Acorn `Literal.value`, `Literal.raw`, `Identifier.name`, source spans, and `TemplateElement.value.{raw,cooked}`.
- Produces: unchanged ESTree values/locations for valid ES2015 forms; no engine-owned decoder.

- [ ] **Step 1: Add the failing numeric and Unicode parser matrix**

Add focused cases to `test/parser.test.js` that directly inspect values, raw text,
names, and locations:

```js
{
  name: 'ES2015 binary and octal literals retain exact values, raw text, and locations',
  run() {
    const program = parseScript('0b101; 0B101; 0o17; 0O17;');
    const literals = program.body.map((statement) => statement.expression);
    assertSame(
      JSON.stringify(
        literals.map(({ value, raw, start, end }) => [
          value,
          raw,
          start,
          end,
        ]),
      ),
      JSON.stringify([
        [5, '0b101', 0, 5],
        [5, '0B101', 7, 12],
        [15, '0o17', 14, 18],
        [15, '0O17', 20, 24],
      ]),
    );
  },
},
{
  name: 'ES2015 Unicode code-point escapes preserve decoded values and identifier contexts',
  run() {
    const program = parseScript(
      '"\\u{0}\\u{10ffff}"; var \\u{41}\\u{30} = 1; ({ \\u{69}f: 2 });',
    );
    assertSame(program.body[0].expression.value, '\0\uDBFF\uDFFF');
    assertSame(program.body[1].declarations[0].id.name, 'A0');
    assertSame(program.body[2].expression.properties[0].key.name, 'if');
  },
},
```

Add rejection loops for numeric separators, strict legacy octal preservation,
identifier-start/continue boundaries, escaped reserved BindingIdentifiers,
out-of-range escapes, incomplete escapes, and surrogate escapes in identifier
positions. Separately assert that `"\u{d800}"` is a valid one-code-unit string
and that a template cooks it to the same lone surrogate:

```js
for (const source of [
  '1_0;',
  '0b1_0;',
  '0o1_0;',
  '"\\u{110000}";',
  '"\\u{";',
  'var \\u{30}x = 1;',
  'var \\u{d800} = 1;',
  'var \\u{63}lass = 1;',
]) {
  assertThrows(() => parseScript(source), SyntaxError);
}
assertThrows(() => parseScript('"use strict"; 010;'), SyntaxError);
assertSame(parseScript('"\\u{d800}";').body[0].expression.value.length, 1);
```

Add `test/template-literals.test.js` assertions for untagged and tagged
`raw`/`cooked` identity at U+0000 and U+10FFFF.

- [ ] **Step 2: Run the focused suites and verify RED**

Run:

```bash
node test/run-node.js test/parser.test.js test/template-literals.test.js
```

Expected: the valid binary/octal and code-point cases fail with the current
`binary and octal numeric literals are not supported` or
`unicode code-point escapes ... are not supported` parse errors. Invalid and
later forms remain parse errors.

- [ ] **Step 3: Remove only the P0 lexical refusal layer**

In `checkUnsupportedEs2015Node`, delete the three rejection branches for:

```js
/^0[bBoO]/.test(node.raw);
hasCodePointEscape(node.raw);
hasCodePointEscape(source.slice(node.start, node.end));
hasCodePointEscape(node.value.raw);
```

Delete `hasCodePointEscape` if it has no remaining callers. Update the nearby
capability documentation to state that Acorn owns binary/octal and valid
code-point decoding while the engine preserves the returned AST.

Do not change `PARSER_OPTIONS`, `MODULE_PARSER_OPTIONS`, Acorn, or any token
reader.

- [ ] **Step 4: Run the focused suites and verify GREEN**

Run:

```bash
node test/run-node.js test/parser.test.js test/template-literals.test.js
node test/run-browser-playwright.js test/parser.test.js test/template-literals.test.js
```

Expected: PASS. Numeric separators, malformed escapes, escaped reserved binding
names, and strict legacy octal still fail at parse phase.

- [ ] **Step 5: Request fresh task reviews and fix findings**

Give a fresh specification reviewer the approved spec plus Task 1 diff and ask
whether every accepted/rejected lexical form is in P0 without later widening.
Then give a different fresh quality reviewer the same diff and ask for lexical
correctness, raw/cooked/location parity, and accidental decoder duplication.
Fix every confirmed finding and rerun Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/parser.js test/parser.test.js test/template-literals.test.js
git commit -m "feat: admit ES2015 lexical literal forms" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Admit Exact `MetaProperty(new.target)` Contexts

**Files:**

- Modify: `test/parser.test.js`
- Modify: `src/parser.js:103-123`
- Modify: `src/parser.js:2480-2523`
- Modify: `src/parser.js:2592-2753`
- Modify: `src/parser.js:2811-2885`
- Modify: `src/parser.js:2940-3160`
- Modify: `src/parser.js:4275-4338`
- Modify: `src/parser.js:5550-5646`
- Modify: `src/parser.js:6506-6546`
- Modify: `src/parser.js:6606-6880`
- Modify: `src/parser.js:7500-7608`

**Interfaces:**

- Consumes: ESTree
  `{ type: "MetaProperty", meta: Identifier("new"), property: Identifier("target") }`.
- Produces: `newTargetAllowedForChild(parent, key, inherited)` and exact
  parse-phase acceptance/rejection for source, reusable, and custom ASTs.

- [ ] **Step 1: Add failing source-context tests**

Add this source matrix to `test/parser.test.js`:

```js
for (const source of [
  'function f(a = new.target) { return new.target; }',
  'function* g(a = new.target) { yield new.target; }',
  '({ m(a = new.target) { return new.target; } });',
  'class C { constructor(a = new.target) { this.value = new.target; } }',
  'function outer() { return (a = new.target) => new.target; }',
  'function outer() { return ({ [new.target.name]: 1 }); }',
  'function outer() { return class extends new.target {}; }',
]) {
  parseScript(source);
}

for (const source of [
  'new.target;',
  '(() => new.target);',
  '({ [new.target]: function () {} });',
  'class C extends new.target {}',
]) {
  assertThrows(() => parseScript(source), SyntaxError);
}
```

Also prove a nested ordinary function resets the lexical context while an arrow
inherits it, and prove computed method names/class heritage accept `new.target`
only when the surrounding source is already inside function code.

- [ ] **Step 2: Add failing reusable/custom AST shape tests**

Use both `CUSTOM_SCRIPT_AST_ENTRIES` and an Acorn-produced function AST:

```js
const parsed = parseScript('function f(){ return new.target; }');
const meta = parsed.body[0].body.body[0].argument;

function programForFunctionReturn(argument) {
  const functionNode = parseScript('function f(){ return 0; }').body[0];
  functionNode.body.body[0].argument = argument;
  return {
    type: 'Program',
    sourceType: 'script',
    body: [functionNode],
  };
}

for (const entry of CUSTOM_SCRIPT_AST_ENTRIES) {
  parseCustomScript(entry, parsed);
  for (const malformed of [
    { ...meta, meta: { type: 'Identifier', name: 'notNew' } },
    { ...meta, property: { type: 'Identifier', name: 'notTarget' } },
    { ...meta, meta: null },
    { ...meta, property: { type: 'Literal', value: 'target' } },
  ]) {
    assertThrows(
      () => parseCustomScript(entry, programForFunctionReturn(malformed)),
      SyntaxError,
    );
  }
}
```

Add hostile cases with accessor/inherited `meta` or `property`, extra typed AST
children in metadata, a direct self-cycle, wrong expression parent positions,
top-level custom arrows, computed method names, and class heritage. Assert a
normalized `SyntaxError` with a stable `name`, position where available, and no
evaluator execution.

- [ ] **Step 3: Run the parser suite and verify RED**

Run:

```bash
node test/run-node.js test/parser.test.js
```

Expected: source forms that Acorn accepts fail on the current unsupported
`MetaProperty` gate; custom/reused forms also fail before the new exact shape
and context logic exists.

- [ ] **Step 4: Promote `MetaProperty` through the capability tables**

In `src/parser.js`:

1. Remove `MetaProperty` from `UNSUPPORTED_ES2015_NODE_MESSAGES`.
2. Add `MetaProperty` to `SUPPORTED_EXPRESSION_TYPES`.
3. Keep it in `RECOGNIZED_AST_NODE_TYPES`.
4. Add `meta` to `AST_CHILD_PROPERTY_KEYS`; `property` is already present.
5. Replace the no-op scalar validator with
   `validateMetaPropertyScalarSyntax`.
6. Add evaluator child-edge validation requiring exact own data-property
   Identifier children.

The validator must return an error unless:

```js
node.meta?.type === 'Identifier' &&
  node.meta.name === 'new' &&
  node.property?.type === 'Identifier' &&
  node.property.name === 'target';
```

Use the existing descriptor-safe helpers so accessors and inherited fields fail
without invoking user code.

- [ ] **Step 5: Add lexical function-code context propagation**

Extend `SyntaxWalkItem`, `syntaxValidationContextKey`, `pushChild`, array-child
propagation, and `checkUnsupportedEs2015Node` with `newTargetAllowed`.

Add:

```js
function newTargetAllowedForChild(parent, key, inherited) {
  if (!isFunctionNode(parent)) {
    return inherited;
  }
  if (parent.type === 'ArrowFunctionExpression') {
    return inherited;
  }
  return key === 'params' || key === 'body';
}
```

Apply the same function-code rule to individual parameter nodes reached through
the `params` array. Do not grant the capability to `id`, object/class method
keys, class heritage, or any other definition-time expression. When visiting a
`MetaProperty`, throw `unsupportedEs2015Error` unless `newTargetAllowed` is
true.

Extend `parseEval` root context to:

```js
{
  superAllowed: boolean,
  superCallAllowed: boolean,
  newTargetAllowed: boolean,
}
```

Scripts/modules default to false. Direct eval supplies the caller's function
record status in Task 4. Because Acorn checks its own `allowNewDotTarget`
accessor before producing the AST, extend the selected eval parser with an
`allowNewDotTarget` getter that returns true only for a root context whose
`newTargetAllowed` is true. Cache or compose the strict/direct-super/new-target
parser variants without changing ordinary script parsing.

- [ ] **Step 6: Run the parser matrix and verify GREEN**

Run:

```bash
node test/run-node.js test/parser.test.js
node test/run-browser-playwright.js test/parser.test.js
```

Expected: exact source/reusable/custom acceptance passes; wrong names, shapes,
parents, cycles, top-level usage, computed names, and heritage contexts fail as
normalized parse-phase `SyntaxError`s.

- [ ] **Step 7: Request fresh task reviews and fix findings**

Use separate fresh specification and quality reviewers. Require explicit
answers for parameter-list capability, arrow inheritance, nested non-arrow
reset, definition-time context, own-data descriptors, source-independent
reusable nodes, hidden metadata AST nodes, and cycle safety. Fix confirmed
findings and rerun Step 6.

- [ ] **Step 8: Commit**

```bash
git add src/parser.js test/parser.test.js
git commit -m "feat: validate new.target syntax contexts" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Thread `newTarget` Through Function Execution

**Files:**

- Modify: `test/environments.test.js`
- Modify: `test/functions.test.js`
- Modify: `test/function-parameters.test.js`
- Modify: `test/classes.test.js`
- Modify: `test/arrow-functions.test.js`
- Modify: `src/runtime/environment.js:798-910`
- Modify: `src/runtime/function-object.js:217-516`
- Modify: `src/evaluator/expressions.js:115-210`
- Modify: `src/evaluator/expressions.js:928-953`
- Modify: `src/evaluator/declarations.js:926-952`
- Modify: `src/api.js:58-70`
- Modify: `src/evaluator/modules.js:690-704`

**Interfaces:**

- Produces:
  `FunctionExecutionEnvironment.newTargetStatus: "absent" | "present"`,
  `FunctionExecutionEnvironment.newTarget: unknown`, and
  `getNewTarget(functionEnvironment): unknown`.
- Consumes: the exact `newTarget` argument passed to
  `EngineFunction.constructFunction(args, newTarget, callerRealm)`.

- [ ] **Step 1: Add failing environment and ordinary call/construct tests**

In `test/environments.test.js`, assert explicit absent/present states:

```js
const absent = createFunctionExecutionEnvironment({
  thisStatus: 'initialized',
  thisValue: undefined,
  newTargetStatus: 'absent',
});
const present = createFunctionExecutionEnvironment({
  thisStatus: 'initialized',
  thisValue: undefined,
  newTargetStatus: 'present',
  newTarget: undefined,
});
assertThrows(() => getNewTarget(absent), GuestErrorSignal);
assertSame(getNewTarget(present), undefined);
```

In `test/functions.test.js`, prove call, `new`, and the internal alternate-new-
target API:

```js
assertSame(run('(function F(){ return new.target; })();'), undefined);
assertSame(
  run('var F = function F(){ this.same = new.target === F; }; new F().same;'),
  true,
);

const realm = createRealm();
const target = evaluateScript(
  realm,
  '(function Target(){ this.seen = new.target; })',
).value;
const alternate = evaluateScript(realm, '(function Alternate(){})').value;
const result = target.constructFunction([], alternate, realm);
assertSame(result.get('seen'), alternate);
```

Correct the guest-source construction sample to bind the function before `new`,
and cover member/tagged/template-substitution positions.

- [ ] **Step 2: Add failing parameter, arrow, class, and bound tests**

Add focused assertions:

```js
function ordinary(a = new.target) {
  return a;
}
function outer() {
  return (a = new.target) => a;
}
class Base {
  constructor(a = new.target) {
    this.base = a;
  }
}
class Derived extends Base {
  constructor(a = new.target) {
    super();
    this.derived = a;
  }
}
```

Cover destructuring/computed defaults and direct eval from a default:

```js
function F({ value = new.target } = {}, key = eval('new.target')) {
  this.values = [value, key];
}
```

Assert normal calls expose `undefined`, construction exposes the exact target,
arrows retain the enclosing record, a nested ordinary function resets to its
own call value, `new bound()` exposes the corrected bound target, an explicit
alternate target propagates, and base/derived `super` keep the active target.

- [ ] **Step 3: Run the runtime suites and verify RED**

Run:

```bash
node test/run-node.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js
```

Expected: parser acceptance from Task 2 reaches evaluator/runtime failures
because `MetaProperty` is not dispatched and ordinary construction still calls
`callFunction`, which creates a call environment and loses the active target.

- [ ] **Step 4: Add explicit environment state and read helper**

Change the typedef and constructor in `src/runtime/environment.js` so every
record has:

```js
newTargetStatus: 'absent' | 'present',
newTarget: unknown,
```

Add:

```js
export function getNewTarget(functionEnvironment) {
  let current = functionEnvironment;
  while (current !== undefined) {
    if (current.newTargetStatus === 'present') {
      return current.newTarget;
    }
    current = current.outer;
  }
  throw new GuestErrorSignal(
    'ReferenceError',
    'new.target is not available outside function code',
  );
}
```

All synthetic script/module/dynamic-constructor creation contexts pass
`newTargetStatus: "absent"`. Non-arrow EngineFunction calls pass `"present"`
with `undefined`. Arrows return their enclosing record unchanged.

- [ ] **Step 5: Refactor ordinary invocation without losing construction state**

Refactor `EngineFunction.callFunction`'s post-environment execution into one
private method that accepts an already-created `FunctionExecutionEnvironment`.
Use it from both call and ordinary construction.

The essential flow is:

```js
// call
const environment = this.functionExecutionEnvironment(thisValue, undefined);
return this.executeInvocation(args, environment, activeRealm);

// ordinary construct
const instance = ordinaryCreateFromConstructor(newTarget, ...);
const environment = this.functionExecutionEnvironment(instance, newTarget);
const result = this.executeInvocation(args, environment, activeRealm);
return result instanceof EngineObject ? result : instance;
```

Do not call `callFunction` from ordinary `constructFunction`. Preserve the
single construct call chain, caller/owner Realm linking, argument linking,
completion conversion, stack guard, generator factory behavior, and class
constructor branch.

Class environments use `"present"` with the exact `newTarget`. Parameter
instantiation continues receiving this already-created record through
`createFunctionBodyContext` before `functionDeclarationInstantiation`.

- [ ] **Step 6: Dispatch synchronous `MetaProperty`**

Add `MetaProperty` to `EXPRESSION_TYPES` and `evaluateExpression`:

```js
case 'MetaProperty':
  return getNewTarget(context.functionEnvironment);
```

No coercion, reference creation, or object property access is involved.

- [ ] **Step 7: Run focused runtime suites and verify GREEN**

Run:

```bash
node test/run-node.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js
node test/run-browser-playwright.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js
```

Expected: PASS with parameters observing an already-created record, arrows
retaining it by identity, and ordinary/class/bound/super construction exposing
the exact active target.

- [ ] **Step 8: Request fresh task reviews and fix findings**

Require separate reviewers to trace call, ordinary construct, base class,
derived `super`, bound correction, alternate target, parameter instantiation,
arrow retained-record identity, cross-Realm linking, and Realm-owned errors.
Fix findings and rerun Step 7.

- [ ] **Step 9: Commit**

```bash
git add \
  src/runtime/environment.js \
  src/runtime/function-object.js \
  src/evaluator/expressions.js \
  src/evaluator/declarations.js \
  src/api.js \
  src/evaluator/modules.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js
git commit -m "feat: propagate active new.target through functions" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Complete Eval, Dynamic, Generator, and Realm Contexts

**Files:**

- Modify: `test/eval.test.js`
- Modify: `test/dynamic-function.test.js`
- Modify: `test/generator-function.test.js`
- Modify: `test/function-realm.test.js`
- Modify: `src/evaluator/eval.js:90-161`
- Modify: `src/evaluator/dynamic-function.js:62-90`
- Modify: `src/evaluator/generator-expression-frames.js:450-576`
- Modify: `src/evaluator/generator-expression-frames.js:740-770`

**Interfaces:**

- Consumes: `newTargetStatus`, `getNewTarget`, retained arrow environment, and
  `parseEval(..., { newTargetAllowed })`.
- Produces: direct/strict eval inheritance, dynamic function behavior, and
  resumable `MetaProperty` parity.

- [ ] **Step 1: Add failing eval tests**

Add cases that prove:

```js
function F(a = eval('new.target')) {
  return [a, eval('"use strict"; new.target')];
}
```

- `F()` returns `[undefined, undefined]`;
- `new F()` observes `F` in both values;
- a direct eval inside a lexical arrow observes the enclosing ordinary
  invocation;
- direct eval in a top-level arrow is a parse-phase guest `SyntaxError`;
- indirect eval `(0, eval)('new.target')` is a parse-phase guest `SyntaxError`;
- strict eval's fresh lexical environment retains the function record; and
- eval parse failures use the caller Realm's `SyntaxError`.

- [ ] **Step 2: Add failing dynamic and generator tests**

Add to `test/dynamic-function.test.js`:

```js
var F = Function('return new.target;');
var called = F();
var constructed = new F();
called === undefined && constructed instanceof F;
```

Also inspect the constructed result's recorded target with:

```js
var F = Function('this.target = new.target;');
new F().target === F;
```

Prove global-environment isolation and cross-Realm Function parse/runtime errors
remain owned by the dynamic constructor's Realm.

Add to `test/generator-function.test.js`:

```js
var GeneratorFunction = function* () {}.constructor;
var g = GeneratorFunction('yield new.target;');
var first = g().next();
first.value === undefined && first.done === false;
```

Cover generator declaration/method parameter defaults, creation-time parameter
instantiation, resume retention, and non-constructibility.

- [ ] **Step 3: Run focused suites and verify RED**

Run:

```bash
node test/run-node.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js
```

Expected: eval lacks parser capability inheritance and generator resume lacks
`MetaProperty` frame dispatch.

- [ ] **Step 4: Thread direct-eval syntax capability**

In `performEval`, call:

```js
parseEval(x, inheritedStrict, {
  superAllowed: callerContext.functionEnvironment?.homeObject !== undefined,
  superCallAllowed:
    callerContext.functionEnvironment?.activeConstructor !== undefined,
  newTargetAllowed:
    callerContext.functionEnvironment?.newTargetStatus === 'present',
});
```

Continue assigning the same `callerContext.functionEnvironment` to
`evalContext`, including strict eval. The fallback synthetic record is
`newTargetStatus: "absent"`.

Dynamic-function creation context is also `"absent"` because it parses the
wrapper as function source; the returned EngineFunction creates its own
`"present"` call/construct environment when invoked. Preserve global scope and
Realm selection.

- [ ] **Step 5: Add resumable `MetaProperty` dispatch**

In `generator-expression-frames.js`, add `MetaProperty` to the synchronous
frame group or create a zero-child frame whose result is:

```js
getNewTarget(frame.context.functionEnvironment);
```

It must not suspend, create a Reference, or copy the environment. Generator
creation retains the environment already passed into `createGeneratorObject`;
resume uses that same context.

- [ ] **Step 6: Run focused suites and verify GREEN**

Run:

```bash
node test/run-node.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js
node test/run-browser-playwright.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js
```

Expected: PASS for direct/strict eval, indirect rejection, dynamic call/new,
generator call/default/resume, cross-Realm value propagation, and Realm-owned
errors.

- [ ] **Step 7: Run full portable JSC once**

The JSC runner has no suite selector. Run the entire portable registry:

```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -m test/run-jsc.js
```

Expected: all JSON-line records have `"status":"passed"` and the process exits
zero.

- [ ] **Step 8: Request fresh task reviews and fix findings**

Use separate fresh reviewers for spec coverage and quality. Require traces for
direct/indirect/strict eval, parameter-initializer eval, dynamic Function global
scope, dynamic GeneratorFunction, generator retained environment, cross-Realm
ownership, and non-constructible generator behavior. Fix findings and rerun
Steps 6-7.

- [ ] **Step 9: Commit**

```bash
git add \
  src/evaluator/eval.js \
  src/evaluator/dynamic-function.js \
  src/evaluator/generator-expression-frames.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js
git commit -m "feat: complete new.target execution contexts" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Execute and Reclassify the Exact P0 Ledger

**Files:**

- Modify: `tools/test262/es2015-audit-evidence.json`
- Regenerate: `tools/test262/es2015-taxonomy.json`
- Modify if counts/prose change: `docs/conformance.md`
- Modify if focused command changes: `docs/testing.md`

**Interfaces:**

- Consumes: exact 83-path core ledger, focused execution records, and existing
  blocker owner names.
- Produces: zero core `blocked:lexical-grammar-and-new-target` records through
  passing evidence or reviewed exact reassignment.

- [ ] **Step 1: Reconstruct and verify the durable ledger**

Run:

```bash
jq -r '
  .classifications[]
  | select(
      .partition == "core"
      and .status == "blocked:lexical-grammar-and-new-target"
    )
  | .path
' tools/test262/es2015-taxonomy.json > /tmp/jsjs-P0.paths.txt
test "$(wc -l < /tmp/jsjs-P0.paths.txt | tr -d ' ')" = 83
test "$(shasum -a 256 /tmp/jsjs-P0.paths.txt | awk '{print $1}')" = \
  b2657db74331391b156f87e1e831665ef4ae3a738d48836e476c13828b1aeff4
```

Expected: both `test` commands succeed.

- [ ] **Step 2: Run only the exact focused ledger**

Run:

```bash
TZ=UTC node tools/test262/es2015-audit.js \
  --paths-file=/tmp/jsjs-P0.paths.txt \
  --write-execution
```

Expected: exactly 83 roots / 164 variants execute. Do not substitute a
directory, glob, selected subset, release suite, or `test262:upstream`.

- [ ] **Step 3: Review each non-passing record and update exact ownership**

List focused failures:

```bash
jq --rawfile paths /tmp/jsjs-P0.paths.txt -r '
  ($paths | split("\n") | map(select(length > 0))) as $wanted
  | .auditRecords[]
  | select((.file as $file | $wanted | index($file)) != null)
  | select(.status != "passed")
  | [.file, .variant, .status, (.reason // ""), (.message // "")]
  | @tsv
' tools/test262/es2015-audit-evidence.json
```

For each root:

- delete its `blockers[path]` entry when every executable variant passes;
- otherwise replace only that exact entry with the already-defined owner whose
  missing semantics caused the failure, such as
  `proxy-and-reflect-metaobject`,
  `early-errors-and-declaration-instantiation`,
  `remaining-language-runtime-semantics`, or another existing taxonomy owner;
- never invent a broader P0 scope and never modify `tools/test262/features.json`.

Keep
`test/annexB/built-ins/escape/escape-above-astral.js` separately classified; it
is not in `/tmp/jsjs-P0.paths.txt`.

- [ ] **Step 4: Regenerate and assert balanced taxonomy**

Run:

```bash
TZ=UTC npm run test262:es2015:audit
TZ=UTC npm run test262:es2015:audit:check
jq -e '
  [
    .classifications[]
    | select(
        .partition == "core"
        and .status == "blocked:lexical-grammar-and-new-target"
      )
  ] | length == 0
' tools/test262/es2015-taxonomy.json
jq -e '
  .summary.roots == 53575
  and .summary.variants == 102912
' tools/test262/es2015-taxonomy.json
```

Expected: all commands succeed, the P0 core selector is zero, and whole-tree
denominators remain 53,575 roots / 102,912 variants.

- [ ] **Step 5: Run taxonomy and invariant tests**

Run:

```bash
TZ=UTC node test/run-node.js \
  test/node/es2015-taxonomy.test.js \
  test/node/repository-invariants.test.js
git diff 54010d4 --exit-code -- tools/test262/features.json
```

Expected: PASS and `features.json` remains byte-identical to the task base.

- [ ] **Step 6: Update directly affected documentation**

If generated status counts changed in prose or tables, update
`docs/conformance.md` with exact generated numbers and explain that P0 roots
either passed focused execution or moved by reviewed exact-path ownership.
Retain the CI-only prohibition in `docs/testing.md`.

- [ ] **Step 7: Request fresh task reviews and fix findings**

Give a fresh spec reviewer the original 83-path ledger, new execution records,
blocker diff, and taxonomy diff. Give a separate quality reviewer the same
artifacts and ask for missing paths, unsupported owner names, count imbalance,
feature widening, Annex B leakage, and stale generated bytes. Fix findings and
rerun Steps 4-5.

- [ ] **Step 8: Commit**

```bash
git add \
  tools/test262/es2015-audit-evidence.json \
  tools/test262/es2015-taxonomy.json \
  docs/conformance.md \
  docs/testing.md
git commit -m "test: reclassify exact ES2015 lexical roots" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Omit unchanged documentation paths from `git add`.

---

### Task 6: Run Repository Gates and Whole-Branch Reviews

**Files:**

- Modify only to fix confirmed in-scope findings from the gates/reviews.

**Interfaces:**

- Consumes: complete Task 1-5 branch.
- Produces: clean portable, static, invariant, taxonomy, benchmark, and review
  evidence at one exact head SHA.

- [ ] **Step 1: Run focused portable suites together**

Run:

```bash
node test/run-node.js \
  test/parser.test.js \
  test/template-literals.test.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js
node test/run-browser-playwright.js \
  test/parser.test.js \
  test/template-literals.test.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full portable runtime suites**

Run:

```bash
npm run test:node
npm run test:browser
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -m test/run-jsc.js
```

Expected: PASS on Node, Chromium, and JavaScriptCore.

- [ ] **Step 3: Run deterministic and static gates**

Run:

```bash
TZ=UTC npm run test262:es2015:audit:check
npm run vendor:check
npm run ci:check
npm run typecheck
npm run lint
npm run format
node test/run-node.js test/node/repository-invariants.test.js
npm run benchmark:smoke
```

Expected: every command exits zero. Do not run `test262:upstream` locally.

- [ ] **Step 4: Run only non-executing workflow contracts**

Run:

```bash
node test/run-node.js \
  test/node/workflow-contract.test.js \
  test/node/repository-invariants.test.js
```

Expected: deterministic workflow/script/manifest metadata and repository
invariants pass. Do not run `npm run ci:contract`,
`test/ci/full-contract.test.js`, `test/run-ci-contract.js`, or any command that
directly or transitively invokes broad upstream Test262. Broad execution is
prohibited locally even when a wrapper describes itself as a local contract.

- [ ] **Step 5: Reconcile moving `origin/main` before final review**

Record the original issue/taxonomy baseline separately, fetch the live final PR
base, and refuse to review or push a stale-base candidate:

```bash
ORIGINAL_ISSUE_BASE=54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
git fetch origin main
LIVE_MAIN=$(git rev-parse origin/main)
printf 'original_issue_base=%s\nlive_main=%s\n' \
  "$ORIGINAL_ISSUE_BASE" "$LIVE_MAIN"
if ! git merge-base --is-ancestor "$LIVE_MAIN" HEAD; then
  git merge --no-edit origin/main
fi
FINAL_PR_BASE=$(git merge-base origin/main HEAD)
test "$FINAL_PR_BASE" = "$(git rev-parse origin/main)"
git status --short
```

If `origin/main` moved because #76, #79, or another child merged, resolve every
conflict by preserving both the upstream change and #77 behavior. Reconstruct
the P0 ledger from the original taxonomy baseline for provenance, but regenerate
the final taxonomy against reconciled `origin/main`. Rerun Tasks 5 Step 4-5 and
Task 6 Steps 1-4 after reconciliation. Do not reuse pre-reconciliation review or
test evidence.

- [ ] **Step 6: Run a maximum-capability whole-branch review**

Give a fresh maximum-capability reviewer:

- approved spec `a07f266`;
- this implementation plan;
- original issue/taxonomy baseline
  `54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7`;
- final PR base `FINAL_PR_BASE`;
- exact final range `git diff "$FINAL_PR_BASE"..HEAD`;
- exact 83-root execution/reclassification evidence; and
- outputs from Steps 1-4.

Require review of parser context boundaries, hostile AST defenses, environment
creation order, call/construct/super/bound/arrow/eval/generator/dynamic/cross-
Realm paths, error phases, taxonomy ownership, and later-syntax exclusion.
Never use Claude Opus 5.

- [ ] **Step 7: Fix every confirmed finding and repeat gates**

For each confirmed finding, add a RED regression test, reproduce it, make the
minimal fix, and rerun the smallest relevant task gate. Then rerun Steps 1-4 and
fetch `origin/main` again. If it moved, repeat Step 5 before requesting a fresh
whole-branch re-review over the new exact range. Continue until no confirmed
findings remain.

- [ ] **Step 8: Commit review fixes if any**

```bash
git add \
  src/parser.js \
  src/runtime/environment.js \
  src/runtime/function-object.js \
  src/evaluator/expressions.js \
  src/evaluator/generator-expression-frames.js \
  src/evaluator/eval.js \
  src/evaluator/dynamic-function.js \
  src/evaluator/declarations.js \
  src/api.js \
  src/evaluator/modules.js \
  test/parser.test.js \
  test/template-literals.test.js \
  test/environments.test.js \
  test/functions.test.js \
  test/function-parameters.test.js \
  test/classes.test.js \
  test/arrow-functions.test.js \
  test/eval.test.js \
  test/dynamic-function.test.js \
  test/generator-function.test.js \
  test/function-realm.test.js \
  tools/test262/es2015-audit-evidence.json \
  tools/test262/es2015-taxonomy.json \
  docs/conformance.md \
  docs/testing.md
git commit -m "fix: address ES2015 lexical review findings" \
  -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

Skip the commit if no files changed.

---

### Task 7: Deliver, Verify, Merge, and Publish

**Files:**

- GitHub PR for this branch.
- GitHub issues `#77`, `#70`, and native dependents discovered from live issue
  dependency data.

**Interfaces:**

- Consumes: clean Task 6 head.
- Produces: one squash-merged PR, exact-head CI/CodeQL evidence, closed #77,
  refreshed #70 counts/dependencies, and published newly unblocked issue state.

- [ ] **Step 1: Recheck the final base and push the exact reviewed head**

Run:

```bash
ORIGINAL_ISSUE_BASE=54010d4e4cb7f97ef2c6539fab6a5b2f33c33db7
git fetch origin main
test "$(git merge-base origin/main HEAD)" = "$(git rev-parse origin/main)"
git status --short
FINAL_PR_BASE=$(git merge-base origin/main HEAD)
REVIEWED_HEAD=$(git rev-parse HEAD)
git push --set-upstream origin HEAD
printf 'original_issue_base=%s\nfinal_pr_base=%s\nreviewed_head=%s\n' \
  "$ORIGINAL_ISSUE_BASE" "$FINAL_PR_BASE" "$REVIEWED_HEAD"
```

Expected: worktree clean, `FINAL_PR_BASE` is current `origin/main`, and the
printed SHA matches the pushed branch head. If `origin/main` moved after Task 6,
stop: repeat Task 6 Step 5 onward, including all affected gates and review. Never
push or merge a stale-base candidate.

- [ ] **Step 2: Recover or create exactly one focused PR**

Resolve the current branch and any existing open PR:

```bash
BRANCH=$(git branch --show-current)
gh pr list --repo yoonbuck/jsjs --state open --head "$BRANCH" \
  --json number,url,headRefOid > /tmp/jsjs-issue-77-prs.json
test "$(jq length /tmp/jsjs-issue-77-prs.json)" -le 1
PR=$(jq -r '.[0].number // empty' /tmp/jsjs-issue-77-prs.json)
```

If `PR` is empty, create one PR. If it exists, verify it belongs to this exact
branch and update its title/body rather than creating a duplicate. In both
cases, title it `Complete ES2015 lexical grammar and new.target`, and make the
body contain:

- `Tracks #77` without an auto-closing keyword, because #77 must remain open
  until post-merge exact-main CodeQL is verified;
- original issue/taxonomy baseline `54010d4`;
- final PR base `FINAL_PR_BASE`;
- reviewed head SHA;
- exact 83/164 ledger and SHA-256;
- passing/reassigned path counts;
- explicit numeric-separator/later-syntax non-goal;
- Node/Chromium/JSC, focused Test262, taxonomy, static, invariant, benchmark,
  and review evidence; and
- statement that broad local Test262 and every wrapper that transitively invokes
  it were not run.

Use the app-native `create_pull_request` tool only when `PR` is empty. When an
open PR already exists, use `update_pull_request` against that exact number so
the operation is idempotent and guarded against concurrent edits.

Then require:

```bash
PR=$(gh pr view --repo yoonbuck/jsjs --json number --jq .number)
test "$(gh pr view "$PR" --repo yoonbuck/jsjs \
  --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
```

Never merge or update lifecycle evidence for an existing PR whose head is stale.

- [ ] **Step 3: Resolve and watch the exact standard CI run**

Use the standard `ci.yml` pull-request run whose `headSha` is exactly the
reviewed head. Wait at most five minutes for startup:

```bash
mkdir -p /tmp/jsjs-issue-77-lifecycle
for ATTEMPT in $(seq 1 30); do
  gh run list --repo yoonbuck/jsjs \
    --commit "$REVIEWED_HEAD" \
    --event pull_request \
    --workflow ci.yml \
    --limit 100 \
    --json databaseId,headSha,event,name,status,conclusion,url \
    > /tmp/jsjs-issue-77-lifecycle/ci-runs.json
  CI_RUN=$(jq -r \
    '[.[] | select(
      .headSha == "'"$REVIEWED_HEAD"'"
      and .event == "pull_request"
      and .name == "CI"
    )][0].databaseId // empty' \
    /tmp/jsjs-issue-77-lifecycle/ci-runs.json)
  if test -n "$CI_RUN"; then break; fi
  sleep 10
done
test -n "$CI_RUN"
```

Start `gh run watch "$CI_RUN" --repo yoonbuck/jsjs --exit-status` with the bash
tool in synchronous mode. If it outlives the initial wait, call `read_bash` on
that same shell session with `delay: 600`; do not launch another watcher or poll
a different run.

After the watcher exits, verify exact identities and every expected job:

```bash
test "$(gh pr view "$PR" --repo yoonbuck/jsjs \
  --json headRefOid --jq .headRefOid)" = "$REVIEWED_HEAD"
gh run view "$CI_RUN" --repo yoonbuck/jsjs \
  --json headSha,event,name,status,conclusion,jobs \
  > /tmp/jsjs-issue-77-lifecycle/ci-run.json
test "$(jq -r .headSha /tmp/jsjs-issue-77-lifecycle/ci-run.json)" = \
  "$REVIEWED_HEAD"
test "$(jq -r .event /tmp/jsjs-issue-77-lifecycle/ci-run.json)" = pull_request
test "$(jq -r .name /tmp/jsjs-issue-77-lifecycle/ci-run.json)" = CI
test "$(jq -r .status /tmp/jsjs-issue-77-lifecycle/ci-run.json)" = completed
test "$(jq -r .conclusion /tmp/jsjs-issue-77-lifecycle/ci-run.json)" = success
jq -e 'all(.jobs[]; .status == "completed" and .conclusion == "success")' \
  /tmp/jsjs-issue-77-lifecycle/ci-run.json
gh pr checks "$PR" --repo yoonbuck/jsjs
```

CodeQL default setup does not supply PR-head authority; resolve its exact-main
analyses separately after merge in Step 5. If standard CI fails or the PR head
moves, add a RED regression where possible, fix, commit, reconcile live main,
rerun Task 6, push a new reviewed head, and restart this exact-run protocol.

- [ ] **Step 4: Squash merge and delete the branch**

Run:

```bash
gh pr merge "$PR" --squash --delete-branch
MERGE_SHA=$(gh pr view "$PR" --json mergeCommit --jq .mergeCommit.oid)
git fetch origin main
git merge-base --is-ancestor "$MERGE_SHA" origin/main
```

Expected: PR merged, remote feature branch deleted, and squash SHA is on
`origin/main`.

- [ ] **Step 5: Verify exact-main CodeQL default setup**

CodeQL default setup analyzes `refs/heads/main` through `event: dynamic`.
Before closing #77 or changing dependency state, resolve the exact CodeQL run
with a bounded ten-minute startup wait:

```bash
for ATTEMPT in $(seq 1 60); do
  gh run list --repo yoonbuck/jsjs \
    --commit "$MERGE_SHA" \
    --event dynamic \
    --limit 100 \
    --json databaseId,headSha,event,name,status,conclusion,url \
    > /tmp/jsjs-issue-77-lifecycle/codeql-runs.json
  CODEQL_RUN=$(jq -r \
    '[.[] | select(
      .headSha == "'"$MERGE_SHA"'"
      and .event == "dynamic"
      and (.name | test("CodeQL"; "i"))
    )][0].databaseId // empty' \
    /tmp/jsjs-issue-77-lifecycle/codeql-runs.json)
  if test -n "$CODEQL_RUN"; then break; fi
  sleep 10
done
test -n "$CODEQL_RUN"
```

Synchronously watch `CODEQL_RUN` with `gh run watch "$CODEQL_RUN" --repo
yoonbuck/jsjs --exit-status`. If it outlives the bash tool's initial wait, call
`read_bash` on that same shell session with `delay: 600`. Then require the run's
`headSha`, event, status, and conclusion to equal `MERGE_SHA`, `dynamic`,
`completed`, and `success`.

After the run succeeds, wait up to ten minutes for both configured analysis
categories at exactly `MERGE_SHA`:

```bash
for ATTEMPT in $(seq 1 60); do
  gh api --paginate repos/yoonbuck/jsjs/code-scanning/analyses \
    > /tmp/jsjs-issue-77-lifecycle/codeql-analyses.json
  CODEQL_JS=$(jq -r \
    '[.[] | select(
      .commit_sha == "'"$MERGE_SHA"'"
      and .ref == "refs/heads/main"
      and .tool.name == "CodeQL"
      and .category == "/language:javascript-typescript"
    )][0].id // empty' \
    /tmp/jsjs-issue-77-lifecycle/codeql-analyses.json)
  CODEQL_ACTIONS=$(jq -r \
    '[.[] | select(
      .commit_sha == "'"$MERGE_SHA"'"
      and .ref == "refs/heads/main"
      and .tool.name == "CodeQL"
      and .category == "/language:actions"
    )][0].id // empty' \
    /tmp/jsjs-issue-77-lifecycle/codeql-analyses.json)
  if test -n "$CODEQL_JS" && test -n "$CODEQL_ACTIONS"; then break; fi
  sleep 10
done
test -n "$CODEQL_JS"
test -n "$CODEQL_ACTIONS"
```

Inspect both analyses, SARIF payloads, run logs, and alerts:

```bash
for ANALYSIS_ID in "$CODEQL_JS" "$CODEQL_ACTIONS"; do
  gh api "repos/yoonbuck/jsjs/code-scanning/analyses/$ANALYSIS_ID" \
    > "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.json"
  test "$(jq -r .commit_sha \
    "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.json")" = "$MERGE_SHA"
  test "$(jq -r .tool.name \
    "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.json")" = CodeQL
  test -z "$(jq -r '.error // empty' \
    "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.json")"
  test -z "$(jq -r '.warning // empty' \
    "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.json")"
  test "$(jq -r .results_count \
    "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.json")" = 0
  gh api -H 'Accept: application/sarif+json' \
    "repos/yoonbuck/jsjs/code-scanning/analyses/$ANALYSIS_ID" \
    > "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.sarif"
  jq -e '
    [
      .runs[].invocations[]?
      | select(
          .executionSuccessful != true
          or ((.toolExecutionNotifications // []) | length > 0)
        )
    ] | length == 0
  ' "/tmp/jsjs-issue-77-lifecycle/codeql-$ANALYSIS_ID.sarif"
done
gh api --paginate \
  'repos/yoonbuck/jsjs/code-scanning/alerts?ref=refs/heads/main&state=open' \
  > /tmp/jsjs-issue-77-lifecycle/codeql-open-alerts.json
test "$(jq \
  '[.[] | select(.most_recent_instance.commit_sha == "'"$MERGE_SHA"'")] | length' \
  /tmp/jsjs-issue-77-lifecycle/codeql-open-alerts.json)" = 0
```

Inspect the exact CodeQL run log for extraction/parse diagnostics in repository
source. Zero green job status alone is insufficient. Add a final PR comment
recording original baseline, final PR base, reviewed head, standard CI run,
CodeQL run and both analysis IDs, and squash SHA.

- [ ] **Step 6: Close #77 with exact evidence**

The PR intentionally did not auto-close #77. Close it only now:

```bash
gh issue close 77 --repo yoonbuck/jsjs \
  --comment "Completed by PR #$PR. Original issue baseline: $ORIGINAL_ISSUE_BASE. Final PR base: $FINAL_PR_BASE. Reviewed head: $REVIEWED_HEAD. Standard CI run: $CI_RUN. Squash merge: $MERGE_SHA. Exact-main CodeQL run/analyses: $CODEQL_RUN / $CODEQL_JS / $CODEQL_ACTIONS. The exact 83-root / 164-variant P0 selector is zero through focused passing evidence or reviewed downstream reassignment; whole-tree denominators remain unchanged."
```

- [ ] **Step 7: Update #70 and publish dependency movement**

Read the merged taxonomy from `origin/main`, compute new core status/blocker
counts, and update #70's P0 row and selected/audit/blocked totals without
changing whole-tree denominators.

Query live dependents:

```bash
gh api \
  -H 'Accept: application/vnd.github+json' \
  repos/yoonbuck/jsjs/issues/77/dependencies/blocking \
  --jq '.[] | [.number, .title, .state] | @tsv'
```

For each open dependent, query its remaining `blocked_by` list, publish a comment
that #77 is resolved, and explicitly name whether it is newly unblocked or which
blockers remain. Add one #70 comment summarizing the same dependency movement
and exact counts. Do not claim an issue is unblocked without an empty live
`blocked_by` result.

- [ ] **Step 8: Send final evidence to the project coordinator**

Send:

- PR URL/number;
- original issue baseline, final PR base, reviewed head, and squash SHA;
- exact CI run and CodeQL analysis IDs;
- final P0 passing/reassignment and taxonomy counts;
- #77 closure comment URL;
- #70 update URL; and
- newly unblocked issue URLs, or an explicit statement that live dependencies
  show none newly unblocked.
