import { assertSame, assertThrows } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { EngineObject } from '../src/runtime/object.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { getValue } from '../src/runtime/reference.js';
import {
  evaluateExpression,
  evaluateExpressionValue,
} from '../src/evaluator/expressions.js';
import {
  DeclarativeEnvironmentRecord,
  ObjectEnvironmentRecord,
  getIdentifierBindingValue,
  getIdentifierReference,
} from '../src/runtime/environment.js';
import { GuestErrorSignal, ThrowSignal } from '../src/runtime/completion.js';

/**
 * The invariant this whole suite exists to defend: resolving an identifier to
 * a value directly must be observationally identical to building a Reference
 * and calling GetValue on it. Any divergence — a different resolved record, a
 * swallowed TDZ throw, a changed ReferenceError message — is a regression.
 *
 * @param {import('../src/runtime/environment.js').EnvironmentRecordLike | null} env
 * @param {string} name
 * @param {boolean} strict
 */
function assertMatchesReferencePath(env, name, strict) {
  /** @type {{ ok: true, value: unknown } | { ok: false, error: unknown }} */
  let viaReference;
  try {
    viaReference = {
      ok: true,
      value: getValue(getIdentifierReference(env, name, strict)),
    };
  } catch (error) {
    viaReference = { ok: false, error };
  }

  /** @type {{ ok: true, value: unknown } | { ok: false, error: unknown }} */
  let viaFused;
  try {
    viaFused = {
      ok: true,
      value: getIdentifierBindingValue(env, name, strict),
    };
  } catch (error) {
    viaFused = { ok: false, error };
  }

  assertSame(viaFused.ok, viaReference.ok, `resolution outcome for ${name}`);
  if (viaReference.ok && viaFused.ok) {
    assertSame(
      viaFused.value,
      viaReference.value,
      `resolved value for ${name}`,
    );
    return;
  }
  if (!viaReference.ok && !viaFused.ok) {
    const referenceError = /** @type {any} */ (viaReference.error);
    const fusedError = /** @type {any} */ (viaFused.error);
    assertSame(
      fusedError instanceof GuestErrorSignal,
      referenceError instanceof GuestErrorSignal,
      `error kind for ${name}`,
    );
    assertSame(
      fusedError.typeName,
      referenceError.typeName,
      `error type for ${name}`,
    );
    assertSame(
      fusedError.guestMessage,
      referenceError.guestMessage,
      `error message for ${name}`,
    );
  }
}

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const realm = createRealm();
  return evaluateScript(realm, source).value;
}

const tests = [
  {
    name: 'reads a binding in the innermost declarative record',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createMutableBinding('x');
      env.initializeBinding('x', 42);

      assertSame(getIdentifierBindingValue(env, 'x', false), 42);
      assertMatchesReferencePath(env, 'x', false);
    },
  },
  {
    name: 'walks outward to a binding in an enclosing record',
    run() {
      const outer = new DeclarativeEnvironmentRecord();
      outer.createMutableBinding('base');
      outer.initializeBinding('base', 7);
      const inner = new DeclarativeEnvironmentRecord(outer);
      inner.createMutableBinding('local');
      inner.initializeBinding('local', 1);

      assertSame(getIdentifierBindingValue(inner, 'base', false), 7);
      assertMatchesReferencePath(inner, 'base', false);
    },
  },
  {
    name: 'an inner binding shadows an outer binding of the same name',
    run() {
      const outer = new DeclarativeEnvironmentRecord();
      outer.createMutableBinding('name');
      outer.initializeBinding('name', 'outer');
      const inner = new DeclarativeEnvironmentRecord(outer);
      inner.createMutableBinding('name');
      inner.initializeBinding('name', 'inner');

      assertSame(getIdentifierBindingValue(inner, 'name', false), 'inner');
      assertMatchesReferencePath(inner, 'name', false);
    },
  },
  {
    name: 'an unresolvable identifier throws the same guest ReferenceError as GetValue',
    run() {
      const env = new DeclarativeEnvironmentRecord();

      const error = /** @type {GuestErrorSignal} */ (
        assertThrows(
          () => getIdentifierBindingValue(env, 'missing', false),
          GuestErrorSignal,
        )
      );
      assertSame(error.typeName, 'ReferenceError');
      assertSame(error.guestMessage, 'missing is not defined');
      assertMatchesReferencePath(env, 'missing', false);
      assertMatchesReferencePath(env, 'missing', true);
    },
  },
  {
    name: 'a null environment resolves like an unresolvable reference',
    run() {
      assertThrows(
        () => getIdentifierBindingValue(null, 'x', false),
        GuestErrorSignal,
      );
      assertMatchesReferencePath(null, 'x', false);
    },
  },
  {
    name: 'reads through an object environment record like a with-scope',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      assertSame(object.set('present', 99, object), true);
      const env = new ObjectEnvironmentRecord(object);

      assertSame(getIdentifierBindingValue(env, 'present', false), 99);
      assertMatchesReferencePath(env, 'present', false);
    },
  },
  {
    name: 'honors the global record declarative-over-object precedence',
    run() {
      const realm = createRealm();
      const global = realm.globalEnvironment;
      global.createGlobalVarBinding('shared', false);
      global.objectRecord.setMutableBinding('shared', 'from-object', false);
      global.createMutableBinding('shared2', false);
      global.initializeBinding('shared2', 'from-declarative');

      assertSame(
        getIdentifierBindingValue(global, 'shared', false),
        'from-object',
      );
      assertMatchesReferencePath(global, 'shared', false);
      assertSame(
        getIdentifierBindingValue(global, 'shared2', false),
        'from-declarative',
      );
      assertMatchesReferencePath(global, 'shared2', false);
    },
  },
  {
    name: 'an uninitialized binding throws through the fused path exactly as GetValue does',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createImmutableBinding('later');

      assertThrows(
        () => getIdentifierBindingValue(env, 'later', true),
        GuestErrorSignal,
      );
      assertMatchesReferencePath(env, 'later', true);

      env.initializeBinding('later', 5);
      assertSame(getIdentifierBindingValue(env, 'later', true), 5);
      assertMatchesReferencePath(env, 'later', true);
    },
  },
  {
    name: 'end-to-end: local, closure, and global identifier reads still resolve',
    run() {
      assertSame(run('(function () { var a = 3, b = 4; return a + b; }())'), 7);
      assertSame(
        run(
          '(function () { var base = 10; function inner() { return base + 5; } return inner(); }())',
        ),
        15,
      );
      const realm = createRealm();
      evaluateScript(realm, 'var g = 21;');
      assertSame(evaluateScript(realm, 'g + g;').value, 42);
    },
  },
  {
    name: 'end-to-end: reading an undeclared identifier reports it is not defined',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(realm, 'missingGlobal;');
      assertSame(completion.type, 'throw');
      const thrown = /** @type {EngineObject} */ (completion.value);
      assertSame(thrown.get('name'), 'ReferenceError');
      assertSame(thrown.get('message'), 'missingGlobal is not defined');
    },
  },
  {
    name: 'end-to-end: with-statement and named function expression reads are unchanged',
    run() {
      assertSame(run('var o = { hit: 8 }; with (o) { hit + 2; }'), 10);
      assertSame(
        run('(function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }(5))'),
        120,
      );
      assertSame(run('try { throw 17; } catch (e) { e + 1; }'), 18);
    },
  },
  {
    name: 'a getter reached by a bare identifier read runs at the same stack-guard depth on both paths',
    run() {
      // The fused fast path must not run an accessor-backed read one engine
      // frame deeper than routing the same Identifier node through
      // evaluateExpression + GetValue would: the original path resolves the
      // Reference inside the node's guard frame but calls GetValue (which runs
      // the getter) only after that frame has exited, so the getter runs at the
      // ambient depth. If the fast path resolves the value while still holding
      // the node's frame, the getter runs one frame deeper and the
      // stack-overflow boundary shifts by one for exactly this shape.
      const realm = createRealm();

      /** @type {number[]} */
      const observed = [];
      const getter = realm.createNativeFunction({
        name: 'probeGetter',
        length: 0,
        call() {
          observed.push(realm.stackGuard.depth);
          return 123;
        },
      });
      realm.globalObject.defineOwnProperty('probe', {
        get: getter,
        set: undefined,
        enumerable: false,
        configurable: true,
      });

      /** @type {import('../src/evaluator/index.js').EvaluationContext} */
      const context = {
        realm,
        env: realm.globalEnvironment,
        variableEnv: realm.globalEnvironment,
        strict: false,
        thisValue: realm.globalObject,
      };
      const node = { type: 'Identifier', name: 'probe' };

      // Reference path: exactly what evaluateExpressionValue did before the
      // fused fast path existed.
      assertSame(
        realm.stackGuard.depth,
        0,
        'guard balanced before reference path',
      );
      const reference = evaluateExpression(node, context);
      assertSame(getValue(/** @type {any} */ (reference)), 123);
      const referenceDepth = observed.pop();

      // Fused path.
      assertSame(realm.stackGuard.depth, 0, 'guard balanced before fused path');
      assertSame(evaluateExpressionValue(node, context), 123);
      const fusedDepth = observed.pop();

      assertSame(
        fusedDepth,
        referenceDepth,
        'getter stack-guard depth (fused vs reference)',
      );
      assertSame(realm.stackGuard.depth, 0, 'guard balanced after fused path');
    },
  },
  {
    name: 'end-to-end: a global accessor read still triggers its getter through the fused path',
    run() {
      const realm = createRealm();
      let calls = 0;
      const getter = realm.createNativeFunction({
        name: 'sideEffectGetter',
        length: 0,
        call() {
          calls += 1;
          return 'accessed';
        },
      });
      realm.globalObject.defineOwnProperty('accessorGlobal', {
        get: getter,
        set: undefined,
        enumerable: false,
        configurable: true,
      });

      assertSame(evaluateScript(realm, 'accessorGlobal;').value, 'accessed');
      assertSame(calls, 1, 'getter invoked exactly once by the fused read');
    },
  },
  {
    name: 'a name bound in both global sub-records resolves to the declarative binding',
    run() {
      const realm = createRealm();
      const global = realm.globalEnvironment;
      // Bind the SAME name on both the object record (via the global object)
      // and the declarative record, so declarative-over-object precedence is
      // actually exercised rather than assumed.
      assertSame(
        global.objectRecord.bindingObject.set(
          'collides',
          'from-object',
          global.objectRecord.bindingObject,
        ),
        true,
      );
      global.createMutableBinding('collides', false);
      global.initializeBinding('collides', 'from-declarative');

      assertSame(
        getIdentifierBindingValue(global, 'collides', false),
        'from-declarative',
      );
      assertMatchesReferencePath(global, 'collides', false);
    },
  },
  {
    name: 'end-to-end: a direct-eval-introduced binding reads identically to a lexical one',
    run() {
      assertSame(
        run(
          '(function () { eval("var injected = 41;"); return injected + 1; }())',
        ),
        42,
      );
      assertSame(run('eval("var topInjected = 5;"); topInjected + 2;'), 7);
    },
  },
  {
    name: 'a temporal dead zone read throws through the fused path exactly as GetValue does',
    run() {
      const outer = new DeclarativeEnvironmentRecord();
      outer.createMutableBinding('shadowed');
      outer.initializeBinding('shadowed', 'outer-value');
      const block = new DeclarativeEnvironmentRecord(outer);
      block.createMutableBinding('shadowed', false);

      const error = /** @type {GuestErrorSignal} */ (
        assertThrows(
          () => getIdentifierBindingValue(block, 'shadowed', false),
          GuestErrorSignal,
        )
      );
      assertSame(error.typeName, 'ReferenceError');
      assertSame(
        error.guestMessage,
        "Cannot access 'shadowed' before initialization",
      );
      assertMatchesReferencePath(block, 'shadowed', false);
    },
  },
  {
    name: 'a const binding in its dead zone throws through the fused path like a let one',
    run() {
      const block = new DeclarativeEnvironmentRecord();
      block.createImmutableBinding('frozen', true);

      assertThrows(
        () => getIdentifierBindingValue(block, 'frozen', false),
        GuestErrorSignal,
      );
      assertMatchesReferencePath(block, 'frozen', false);

      block.initializeBinding('frozen', 9);
      assertSame(getIdentifierBindingValue(block, 'frozen', false), 9);
      assertMatchesReferencePath(block, 'frozen', false);
    },
  },
  {
    name: 'a lexical binding shadowing an object environment resolves to the declarative record',
    run() {
      const scope = new EngineObject();
      scope.defineOwnProperty('shared', {
        value: 'from-with',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const withEnv = new ObjectEnvironmentRecord(scope, null, true);
      const block = new DeclarativeEnvironmentRecord(withEnv);
      block.createMutableBinding('shared', false);
      block.initializeBinding('shared', 'from-let');

      assertSame(getIdentifierBindingValue(block, 'shared', false), 'from-let');
      assertMatchesReferencePath(block, 'shared', false);
    },
  },
  {
    name: 'end-to-end: block, const, and per-iteration reads resolve through the fused path',
    run() {
      assertSame(run('var r; { let inner = 3; r = inner; } r;'), 3);
      assertSame(run('var r; { const frozen = 4; r = frozen; } r;'), 4);
      assertSame(run('var outer = 1; { let outer = 2; } outer;'), 1);
      assertSame(
        run(
          'var reads = []; { for (let i = 0; i < 3; i += 1) { reads.push(function () { return i; }); } } ' +
            'reads[0]() + "," + reads[1]() + "," + reads[2]();',
        ),
        '0,1,2',
      );
    },
  },
  {
    name: 'end-to-end: a dead-zone read throws even when an outer binding of the name is initialized',
    run() {
      assertSame(
        run(
          'var shadowed = "outer"; ' +
            '{ var caught; try { shadowed; } catch (e) { caught = e.message; } let shadowed = 1; } caught;',
        ),
        "Cannot access 'shadowed' before initialization",
      );
      assertSame(
        run(
          'function f() { try { return early; } catch (e) { return e.message; } let early = 1; } f();',
        ),
        "Cannot access 'early' before initialization",
      );
      assertSame(
        run(
          '{ var caught; try { eval("viaEval"); } catch (e) { caught = e.message; } let viaEval = 1; } caught;',
        ),
        "Cannot access 'viaEval' before initialization",
      );
    },
  },
  {
    name: 'end-to-end: with-scope and accessor reads still work with a lexical scope layered over them',
    run() {
      assertSame(
        run('var r; with ({ a: 42 }) { let b = 1; r = a + b; } r;'),
        43,
      );
      assertSame(run('var r; with ({ a: 1 }) { let a = 2; r = a; } r;'), 2);
      assertSame(
        run(
          'var calls = 0; ' +
            'var scope = Object.defineProperty({}, "g", { get: function () { calls += 1; return 9; } }); ' +
            'var r; with (scope) { let local = 1; r = g + local; } r + "," + calls;',
        ),
        '10,1',
      );
    },
  },
  {
    name: 'a getter reached from inside a block scope runs at the same stack-guard depth on both paths',
    run() {
      const realm = createRealm();

      /** @type {number[]} */
      const observed = [];
      const getter = realm.createNativeFunction({
        name: 'blockScopedProbeGetter',
        length: 0,
        call() {
          observed.push(realm.stackGuard.depth);
          return 5;
        },
      });
      realm.globalObject.defineOwnProperty('blockProbe', {
        get: getter,
        set: undefined,
        enumerable: false,
        configurable: true,
      });

      const blockEnv = new DeclarativeEnvironmentRecord(
        realm.globalEnvironment,
      );
      blockEnv.createMutableBinding('unrelated', false);
      blockEnv.initializeBinding('unrelated', 1);

      /** @type {import('../src/evaluator/index.js').EvaluationContext} */
      const context = {
        realm,
        env: blockEnv,
        variableEnv: realm.globalEnvironment,
        strict: false,
        thisValue: realm.globalObject,
      };
      const node = { type: 'Identifier', name: 'blockProbe' };

      assertSame(realm.stackGuard.depth, 0, 'guard balanced before reference');
      const reference = evaluateExpression(node, context);
      assertSame(getValue(/** @type {any} */ (reference)), 5);
      const referenceDepth = observed.pop();

      assertSame(realm.stackGuard.depth, 0, 'guard balanced before fused');
      assertSame(evaluateExpressionValue(node, context), 5);
      const fusedDepth = observed.pop();

      assertSame(
        fusedDepth,
        referenceDepth,
        'getter stack-guard depth through a block scope (fused vs reference)',
      );
      assertSame(realm.stackGuard.depth, 0, 'guard balanced after fused path');
    },
  },
  {
    name: 'foreign object environment fused reads preserve caller links through bare and block scopes',
    run() {
      const evaluatingAgent = createAgent();
      const foreignAgent = createAgent();
      const evaluatingRealm = createRealm({ agent: evaluatingAgent });
      const foreignRealm = createRealm({ agent: foreignAgent });
      const foreign = new EngineObject(foreignRealm.intrinsics.objectPrototype);
      /** @type {{
       *   caller: import('../src/runtime/realm.js').Realm | null,
       *   synchronous: boolean,
       *   generator: boolean,
       *   depth: number,
       * }[]} */
      const observations = [];
      foreign.defineOwnProperty('value', {
        get: foreignRealm.createNativeFunction({
          name: 'get value',
          length: 0,
          call(_thisValue, _args, _functionObject, caller) {
            const evaluatingChain = evaluatingAgent.synchronousCallChainRoot();
            observations.push({
              caller: caller ?? null,
              synchronous:
                evaluatingChain !== null &&
                evaluatingChain === foreignAgent.synchronousCallChainRoot(),
              generator:
                evaluatingAgent._generatorHostChain !== null &&
                evaluatingAgent._generatorHostChain ===
                  foreignAgent._generatorHostChain,
              depth: evaluatingRealm.stackGuard.depth,
            });
            return 73;
          },
        }),
        enumerable: true,
        configurable: true,
      });
      evaluatingRealm.globalObject.defineOwnProperty('foreign', {
        value: foreign,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const objectEnv = new ObjectEnvironmentRecord(foreign);
      const blockEnv = new DeclarativeEnvironmentRecord(objectEnv);
      blockEnv.createMutableBinding('local', false);
      blockEnv.initializeBinding('local', 1);
      const node = { type: 'Identifier', name: 'value' };

      /**
       * @param {() => unknown} body
       * @returns {unknown}
       */
      const linkedRead = (body) => {
        const chain = evaluatingAgent.enterGeneratorHostChain(
          evaluatingRealm.stackGuard.maxDepth,
        );
        try {
          return body();
        } finally {
          evaluatingAgent.exitGeneratorHostChain(chain);
        }
      };
      /** @type {import('../src/evaluator/index.js').EvaluationContext} */
      const baseContext = {
        realm: evaluatingRealm,
        env: objectEnv,
        variableEnv: evaluatingRealm.globalEnvironment,
        strict: false,
        thisValue: evaluatingRealm.globalObject,
      };

      const referenceValue = linkedRead(() =>
        getValue(
          getIdentifierReference(objectEnv, 'value', false),
          evaluatingRealm,
        ),
      );
      const fusedValue = linkedRead(() =>
        evaluateExpressionValue(node, baseContext),
      );
      const blockValue = linkedRead(() =>
        evaluateExpressionValue(node, { ...baseContext, env: blockEnv }),
      );
      const withValue = linkedRead(
        () =>
          evaluateScript(evaluatingRealm, 'with (foreign) { value; }').value,
      );
      const withBlockValue = linkedRead(
        () =>
          evaluateScript(
            evaluatingRealm,
            'with (foreign) { { let local = 1; value; } }',
          ).value,
      );

      assertSame(referenceValue, 73);
      assertSame(fusedValue, referenceValue);
      assertSame(blockValue, referenceValue);
      assertSame(withValue, referenceValue);
      assertSame(withBlockValue, referenceValue);
      assertSame(observations.length, 5);
      const referenceDepth = observations[0].depth;
      for (const observation of observations) {
        assertSame(observation.caller, evaluatingRealm);
        assertSame(observation.synchronous, true);
        assertSame(observation.generator, true);
      }
      for (const observation of observations.slice(0, 3)) {
        assertSame(observation.depth, referenceDepth);
      }
      assertSame(evaluatingAgent.activeExecutionRealm, null);
      assertSame(foreignAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent.synchronousCallChainRoot(), null);
      assertSame(foreignAgent.synchronousCallChainRoot(), null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(foreignAgent._generatorHostChain, null);
    },
  },
  {
    name: 'foreign object environment abrupt fused reads preserve error Realm and clean links',
    run() {
      const evaluatingAgent = createAgent();
      const foreignAgent = createAgent();
      const evaluatingRealm = createRealm({ agent: evaluatingAgent });
      const foreignRealm = createRealm({ agent: foreignAgent });
      const foreign = new EngineObject(foreignRealm.intrinsics.objectPrototype);
      /** @type {{
       *   caller: import('../src/runtime/realm.js').Realm | null,
       *   synchronous: boolean,
       *   generator: boolean,
       * }[]} */
      const observations = [];
      foreign.defineOwnProperty('value', {
        get: foreignRealm.createNativeFunction({
          name: 'get value',
          length: 0,
          call(_thisValue, _args, _functionObject, caller) {
            const evaluatingChain = evaluatingAgent.synchronousCallChainRoot();
            observations.push({
              caller: caller ?? null,
              synchronous:
                evaluatingChain !== null &&
                evaluatingChain === foreignAgent.synchronousCallChainRoot(),
              generator:
                evaluatingAgent._generatorHostChain !== null &&
                evaluatingAgent._generatorHostChain ===
                  foreignAgent._generatorHostChain,
            });
            throw new GuestErrorSignal('TypeError', 'foreign accessor');
          },
        }),
        enumerable: true,
        configurable: true,
      });
      const objectEnv = new ObjectEnvironmentRecord(foreign);
      const blockEnv = new DeclarativeEnvironmentRecord(objectEnv);
      blockEnv.createMutableBinding('local', false);
      blockEnv.initializeBinding('local', 1);
      const node = { type: 'Identifier', name: 'value' };
      /** @type {import('../src/evaluator/index.js').EvaluationContext} */
      const context = {
        realm: evaluatingRealm,
        env: objectEnv,
        variableEnv: evaluatingRealm.globalEnvironment,
        strict: false,
        thisValue: evaluatingRealm.globalObject,
      };

      /**
       * @param {() => unknown} body
       * @returns {ThrowSignal}
       */
      const abruptRead = (body) => {
        const chain = evaluatingAgent.enterGeneratorHostChain(
          evaluatingRealm.stackGuard.maxDepth,
        );
        try {
          return /** @type {ThrowSignal} */ (assertThrows(body, ThrowSignal));
        } finally {
          evaluatingAgent.exitGeneratorHostChain(chain);
        }
      };
      const referenceError = abruptRead(() =>
        getValue(
          getIdentifierReference(objectEnv, 'value', false),
          evaluatingRealm,
        ),
      );
      const fusedError = abruptRead(() =>
        evaluateExpressionValue(node, context),
      );
      const blockError = abruptRead(() =>
        evaluateExpressionValue(node, { ...context, env: blockEnv }),
      );

      for (const error of [referenceError, fusedError, blockError]) {
        const value = /** @type {EngineObject} */ (error.value);
        assertSame(
          value.getPrototypeOf(),
          foreignRealm.intrinsics.typeErrorPrototype,
        );
        assertSame(value.get('message', value), 'foreign accessor');
      }
      assertSame(observations.length, 3);
      for (const observation of observations) {
        assertSame(observation.caller, evaluatingRealm);
        assertSame(observation.synchronous, true);
        assertSame(observation.generator, true);
      }
      assertSame(evaluatingAgent.activeExecutionRealm, null);
      assertSame(foreignAgent.activeExecutionRealm, null);
      assertSame(evaluatingAgent.synchronousCallChainRoot(), null);
      assertSame(foreignAgent.synchronousCallChainRoot(), null);
      assertSame(evaluatingAgent._generatorHostChain, null);
      assertSame(foreignAgent._generatorHostChain, null);
    },
  },
];

export default tests;
