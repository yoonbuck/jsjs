import { assertSame } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import {
  getIterator,
  iteratorStep,
  iteratorValue,
} from '../src/runtime/iterator.js';
import { EngineObject } from '../src/runtime/object.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {unknown}
 */
function val(realm, source) {
  const completion = evaluateScript(realm, source);
  if (completion.type !== 'normal') {
    throw new Error(`Expected normal completion, got ${completion.type}`);
  }
  return completion.value;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'Symbol constructors are per-realm while well-known and registry symbols are per-Agent',
    run() {
      const agent = createAgent();
      const first = createRealm({ agent });
      const second = createRealm({ agent });

      assertSame(
        first.intrinsics.symbolConstructor ===
          second.intrinsics.symbolConstructor,
        false,
      );
      assertSame(val(first, 'Symbol') === val(second, 'Symbol'), false);
      assertSame(
        val(first, 'Symbol.iterator') === val(second, 'Symbol.iterator'),
        true,
      );
      assertSame(
        val(first, 'Symbol.for("shared")') ===
          val(second, 'Symbol.for("shared")'),
        true,
      );

      const other = createRealm({ agent: createAgent() });
      assertSame(
        val(first, 'Symbol.iterator') === val(other, 'Symbol.iterator'),
        false,
      );
      assertSame(
        val(first, 'Symbol.for("shared")') ===
          val(other, 'Symbol.for("shared")'),
        false,
      );
    },
  },
  {
    name: 'cross-Agent iteration uses only the iterable owner Agent protocol key',
    run() {
      const owner = createRealm({ agent: createAgent() });
      const caller = createRealm({ agent: createAgent() });
      const ownerOnly = val(owner, '[11]');
      const withCallerKey =
        /** @type {import('../src/runtime/object.js').EngineObject} */ (
          val(owner, '[22]')
        );
      const callerIterator = val(caller, '[99][Symbol.iterator]()');
      let callerKeyCalls = 0;

      withCallerKey.defineOwnProperty(caller.agent.wellKnownSymbols.iterator, {
        value: caller.createNativeFunction({
          name: '[Symbol.iterator]',
          length: 0,
          call() {
            callerKeyCalls += 1;
            return callerIterator;
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });

      /** @param {unknown} value */
      function inspect(value) {
        try {
          const record = getIterator(caller, value);
          const result = iteratorStep(record);

          return result === false
            ? { done: true }
            : {
                value: iteratorValue(result),
                iteratorOwned:
                  record.iterator.getPrototype() ===
                  owner.intrinsics.arrayIteratorPrototype,
                resultOwned:
                  result.getPrototype() === owner.intrinsics.objectPrototype,
              };
        } catch (error) {
          return {
            error:
              error instanceof Error && 'typeName' in error
                ? error.typeName
                : String(error),
          };
        }
      }

      assertSame(
        JSON.stringify({
          ownerOnly: inspect(ownerOnly),
          withCallerKey: inspect(withCallerKey),
          callerKeyCalls,
        }),
        JSON.stringify({
          ownerOnly: {
            value: 11,
            iteratorOwned: true,
            resultOwned: true,
          },
          withCallerKey: {
            value: 22,
            iteratorOwned: true,
            resultOwned: true,
          },
          callerKeyCalls: 0,
        }),
      );
    },
  },
  {
    name: 'cross-Agent iteration finds an inherited owner protocol key',
    run() {
      const owner = createRealm({ agent: createAgent() });
      const caller = createRealm({ agent: createAgent() });
      const prototype = /** @type {EngineObject} */ (
        val(
          owner,
          '({ [Symbol.iterator]: function () { return [33][Symbol.iterator](); } })',
        )
      );
      const iterable = new EngineObject(prototype, 'Object', caller.agent);
      const record = getIterator(caller, iterable);
      const result = iteratorStep(record);

      assertSame(result === false, false);
      assertSame(iteratorValue(/** @type {EngineObject} */ (result)), 33);
      assertSame(
        record.iterator.getPrototype(),
        owner.intrinsics.arrayIteratorPrototype,
      );
    },
  },
  {
    name: 'mixed string and Symbol own keys retain ES2015 ordering across reflection APIs',
    run() {
      const realm = createRealm();

      assertSame(
        val(
          realm,
          'var s1 = Symbol("s1"), s2 = Symbol("s2");' +
            'var o = {};' +
            'o.z = 1; o[s1] = 2; o[2] = 3; o.a = 4; o[s2] = 5; o[1] = 6;' +
            'Reflect.ownKeys(o).map(function (k) {' +
            '  return typeof k === "symbol" ? k.toString() : k;' +
            '}).join(",");',
        ),
        '1,2,z,a,Symbol(s1),Symbol(s2)',
      );
      assertSame(
        val(realm, 'Object.getOwnPropertyNames(o).join(",");'),
        '1,2,z,a',
      );
      assertSame(
        val(realm, 'Object.getOwnPropertySymbols(o)[0] === s1;'),
        true,
      );
    },
  },
  {
    name: 'super accessor calls preserve the child receiver and accessor function metadata',
    run() {
      assertSame(
        val(
          createRealm(),
          'var parent = {' +
            '  get value() { return this.stored; },' +
            '  set value(next) { this.stored = next; }' +
            '};' +
            'var child = {' +
            '  get value() { return super.value; },' +
            '  set value(next) { super.value = next; }' +
            '};' +
            'Object.setPrototypeOf(child, parent);' +
            'child.value = 41;' +
            'var descriptor = Object.getOwnPropertyDescriptor(child, "value");' +
            '[child.value, child.stored, Object.prototype.hasOwnProperty.call(parent, "stored"), ' +
            'descriptor.get.name, descriptor.get.length, descriptor.set.name, descriptor.set.length].join(",");',
        ),
        '41,41,false,get value,0,set value,1',
      );
    },
  },
  {
    name: 'for-of lexical bindings isolate closures and preserve TDZ errors despite an outer global',
    run() {
      const realm = createRealm();

      assertSame(
        val(
          realm,
          'var closures = [];' +
            'for (let x of [1, 2, 3]) {' +
            '  closures.push(function () { return x; });' +
            '}' +
            'closures[0]() + "," + closures[1]() + "," + closures[2]();',
        ),
        '1,2,3',
      );
      assertSame(
        val(
          realm,
          'var x = "outer";' +
            'var message;' +
            'try {' +
            '  for (let x of x) {}' +
            '} catch (e) {' +
            '  message = e.name + ":" + e.message;' +
            '}' +
            'message;',
        ),
        "ReferenceError:Cannot access 'x' before initialization",
      );
    },
  },
  {
    name: 'direct and indirect eval choose the correct lexical environment without leaking declarations',
    run() {
      assertSame(
        val(
          createRealm(),
          'var current = "global";' +
            '(function () {' +
            '  let current = "lexical";' +
            '  var direct = eval("current; let directOnly = 1;");' +
            '  var indirect = (0, eval)("current; let indirectOnly = 1;");' +
            '  return direct + "," + indirect + "," + typeof directOnly + "," + typeof indirectOnly;' +
            '}());',
        ),
        'lexical,global,undefined,undefined',
      );
    },
  },
  {
    name: 'a TDZ error wins over a throwing IteratorClose and leaves guest stack accounting balanced',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'var returnCalls = 0;' +
          'var iterable = {};' +
          'iterable[Symbol.iterator] = function () {' +
          '  return {' +
          '    next: function () { return { value: 1, done: false }; },' +
          '    return: function () {' +
          '      returnCalls += 1;' +
          '      throw new Error("return failed");' +
          '    }' +
          '  };' +
          '};' +
          'for (let item of iterable) {' +
          '  let beforeInitialization = beforeInitialization;' +
          '}',
      );

      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {any} */ (completion.value).get('name'),
        'ReferenceError',
      );
      assertSame(
        /** @type {any} */ (completion.value).get('message'),
        "Cannot access 'beforeInitialization' before initialization",
      );
      assertSame(val(realm, 'returnCalls;'), 1);
      assertSame(realm.stackGuard.depth, 0);
    },
  },
];

export default tests;
