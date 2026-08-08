import { assertSame, assertThrows } from './harness/assert.js';
import {
  WELL_KNOWN_SYMBOL_NAMES,
  createSymbol,
  isSymbol,
  symbolDescription,
  symbolDescriptiveString,
} from '../src/runtime/symbol.js';
import {
  Agent,
  createAgent,
  createWellKnownSymbols,
} from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import {
  toBoolean,
  toNumber,
  toObject,
  toPrimitive,
  toPropertyKey,
  toString,
} from '../src/runtime/conversion.js';
import {
  abstractEqualityComparison,
  strictEqualityComparison,
  typeOf,
} from '../src/runtime/operators.js';
import {
  EnginePrimitiveObject,
  thisSymbolValue,
} from '../src/runtime/primitive-object.js';

/** A shared agent for the tests that only need one realm's worth of state. */
const AGENT = createAgent();

/** @type {Readonly<Record<import('../src/runtime/symbol.js').WellKnownSymbolName, symbol>>} */
const WELL_KNOWN_SYMBOLS = AGENT.wellKnownSymbols;

/**
 * @param {string} key
 * @returns {symbol}
 */
function symbolFor(key) {
  return AGENT.symbolFor(key);
}

/**
 * @param {symbol} symbol
 * @returns {string | undefined}
 */
function symbolKeyFor(symbol) {
  return AGENT.symbolKeyFor(symbol);
}

/**
 * Asserts `body` throws the guest `TypeError` signal the engine raises for a
 * specified guest throw, rather than a host `TypeError` escaping the engine.
 *
 * @param {() => unknown} body
 * @returns {void}
 */
function assertGuestTypeError(body) {
  const error = /** @type {GuestErrorSignal} */ (
    assertThrows(body, GuestErrorSignal)
  );

  assertSame(error.typeName, 'TypeError');
}

/**
 * Runs guest `source` in a fresh realm whose global object binds `sym` to a
 * symbol primitive, so the evaluator's property-key paths can be exercised
 * independently of the guest-visible `Symbol` constructor.
 *
 * @param {string} source
 * @param {{ completion?: 'value' | 'type' }} [options]
 * @returns {unknown}
 */
function runWithSymbol(source, options = {}) {
  const realm = createRealm();

  realm.globalObject.defineOwnProperty('sym', {
    value: createSymbol('collide'),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  const completion = evaluateScript(realm, source);

  return options.completion === 'type' ? completion.type : completion.value;
}

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

/**
 * Asserts `source` completes abruptly with a guest error object whose
 * prototype chain includes the same realm's `constructorName.prototype`, so a
 * host error leaking out of the engine cannot be mistaken for the specified
 * guest throw.
 *
 * @param {string} source
 * @param {string} constructorName
 * @returns {void}
 */
function assertGuestThrow(source, constructorName) {
  const realm = createRealm();
  const completion = evaluateScript(realm, source);

  assertSame(completion.type, 'throw', source);

  if (!(completion.value instanceof EngineObject)) {
    throw new Error(
      `Expected a guest error object from ${source}, got ${typeof completion.value}`,
    );
  }

  const constructor = /** @type {any} */ (
    realm.globalObject.get(constructorName)
  );
  const prototype = /** @type {EngineObject} */ (constructor.get('prototype'));

  for (
    let current = completion.value.getPrototype();
    current !== null;
    current = current.getPrototype()
  ) {
    if (current === prototype) {
      return;
    }
  }

  throw new Error(`${source} did not throw an instance of ${constructorName}`);
}

const tests = [
  {
    name: 'every ES2015 well-known symbol exists, in specification order',
    run() {
      assertSame(
        WELL_KNOWN_SYMBOL_NAMES.join(','),
        [
          'hasInstance',
          'isConcatSpreadable',
          'iterator',
          'match',
          'replace',
          'search',
          'species',
          'split',
          'toPrimitive',
          'toStringTag',
          'unscopables',
        ].join(','),
      );

      for (const name of WELL_KNOWN_SYMBOL_NAMES) {
        const symbol = WELL_KNOWN_SYMBOLS[name];

        assertSame(typeof symbol, 'symbol', name);
        assertSame(isSymbol(symbol), true, name);
        assertSame(symbolDescription(symbol), `Symbol.${name}`, name);
      }
    },
  },
  {
    name: 'well-known symbols are pairwise distinct',
    run() {
      const values = WELL_KNOWN_SYMBOL_NAMES.map(
        (name) => WELL_KNOWN_SYMBOLS[name],
      );

      assertSame(new Set(values).size, values.length);
    },
  },
  {
    name: 'well-known symbols are the engine’s own, never the host’s',
    run() {
      /** @type {[import('../src/runtime/symbol.js').WellKnownSymbolName, symbol][]} */
      const hostSymbols = [
        ['hasInstance', Symbol.hasInstance],
        ['isConcatSpreadable', Symbol.isConcatSpreadable],
        ['iterator', Symbol.iterator],
        ['match', Symbol.match],
        ['replace', Symbol.replace],
        ['search', Symbol.search],
        ['species', Symbol.species],
        ['split', Symbol.split],
        ['toPrimitive', Symbol.toPrimitive],
        ['toStringTag', Symbol.toStringTag],
        ['unscopables', Symbol.unscopables],
      ];

      for (const [name, hostSymbol] of hostSymbols) {
        if (WELL_KNOWN_SYMBOLS[name] === hostSymbol) {
          throw new Error(`Symbol.${name} is the host's own symbol`);
        }
      }
    },
  },
  {
    name: 'an agent’s well-known symbol record is frozen against edits',
    run() {
      assertSame(Object.isFrozen(WELL_KNOWN_SYMBOLS), true);
      assertSame(Object.isFrozen(WELL_KNOWN_SYMBOL_NAMES), true);
      assertSame(Object.isFrozen(createWellKnownSymbols()), true);
    },
  },
  {
    name: 'each agent mints its own well-known symbols',
    run() {
      const first = createAgent();
      const second = createAgent();

      for (const name of WELL_KNOWN_SYMBOL_NAMES) {
        assertSame(
          first.wellKnownSymbols[name] === second.wellKnownSymbols[name],
          false,
          name,
        );
        assertSame(
          symbolDescription(second.wellKnownSymbols[name]),
          `Symbol.${name}`,
          name,
        );
      }
    },
  },
  {
    name: 'an agent owns its registry, so no entry outlives it',
    run() {
      const first = createAgent();
      const second = createAgent();

      assertSame(first.registeredSymbolCount, 0);

      const shared = first.symbolFor('leak-probe');

      assertSame(first.registeredSymbolCount, 1);
      assertSame(first.symbolFor('leak-probe') === shared, true);

      // A second agent starts empty and never sees the first agent's entry:
      // the registry is reachable only through the agent that owns it, so
      // dropping that agent drops every key guest code interned in it.
      assertSame(second.registeredSymbolCount, 0);
      assertSame(second.symbolFor('leak-probe') === shared, false);
      assertSame(second.registeredSymbolCount, 1);
      assertSame(first.registeredSymbolCount, 1);
      assertSame(first.symbolKeyFor(second.symbolFor('leak-probe')), undefined);
    },
  },
  {
    name: 'createAgent produces a distinct Agent every time',
    run() {
      const agent = createAgent();

      assertSame(agent instanceof Agent, true);
      assertSame(createAgent() === agent, false);
    },
  },
  {
    name: 'createSymbol keeps the description it was given, including the empty one',
    run() {
      assertSame(symbolDescription(createSymbol(undefined)), undefined);
      assertSame(symbolDescription(createSymbol('')), '');
      assertSame(symbolDescription(createSymbol('ponies')), 'ponies');
    },
  },
  {
    name: 'createSymbol mints a fresh value every time',
    run() {
      const first = createSymbol('x');
      const second = createSymbol('x');

      assertSame(first === second, false);
      assertSame(first === first, true);
    },
  },
  {
    name: 'the global symbol registry returns one symbol per key',
    run() {
      assertSame(symbolFor('registry-hit') === symbolFor('registry-hit'), true);
      assertSame(symbolFor('a') === symbolFor('b'), false);
      assertSame(typeof symbolFor(''), 'symbol');
      assertSame(symbolDescription(symbolFor('described')), 'described');
    },
  },
  {
    name: 'symbolKeyFor answers only for registered symbols',
    run() {
      assertSame(symbolKeyFor(symbolFor('round-trip')), 'round-trip');
      assertSame(symbolKeyFor(createSymbol('round-trip')), undefined);
      assertSame(symbolKeyFor(WELL_KNOWN_SYMBOLS.iterator), undefined);
    },
  },
  {
    name: 'SymbolDescriptiveString renders the description in parentheses',
    run() {
      assertSame(
        symbolDescriptiveString(createSymbol('ponies')),
        'Symbol(ponies)',
      );
      assertSame(symbolDescriptiveString(createSymbol('')), 'Symbol()');
      assertSame(symbolDescriptiveString(createSymbol(undefined)), 'Symbol()');
      assertSame(
        symbolDescriptiveString(WELL_KNOWN_SYMBOLS.iterator),
        'Symbol(Symbol.iterator)',
      );
    },
  },
  {
    name: 'isSymbol answers only for symbol primitives',
    run() {
      assertSame(isSymbol(createSymbol('x')), true);
      assertSame(isSymbol('Symbol(x)'), false);
      assertSame(isSymbol(0), false);
      assertSame(isSymbol(null), false);
      assertSame(isSymbol(undefined), false);
      assertSame(isSymbol({}), false);
    },
  },
  {
    name: 'symbolDescription and symbolKeyFor reject non-symbols',
    run() {
      assertThrows(
        () => symbolDescription(/** @type {any} */ ('not a symbol')),
        TypeError,
      );
      assertThrows(
        () => symbolKeyFor(/** @type {any} */ ('not a symbol')),
        TypeError,
      );
    },
  },
  {
    name: 'typeof a symbol is "symbol"',
    run() {
      assertSame(typeOf(createSymbol('x')), 'symbol');
      assertSame(typeOf(WELL_KNOWN_SYMBOLS.iterator), 'symbol');
      assertSame(typeOf(createRealm().intrinsics.objectPrototype), 'object');
    },
  },
  {
    name: 'ToBoolean of any symbol is true',
    run() {
      assertSame(toBoolean(createSymbol('x')), true);
      assertSame(toBoolean(createSymbol('')), true);
      assertSame(toBoolean(createSymbol(undefined)), true);
    },
  },
  {
    name: 'ToNumber and ToString reject symbols with a guest TypeError',
    run() {
      const symbol = createSymbol('x');

      assertGuestTypeError(() => toNumber(symbol));
      assertGuestTypeError(() => toString(symbol));
    },
  },
  {
    name: 'ToPropertyKey passes a symbol through and stringifies everything else',
    run() {
      const symbol = createSymbol('x');

      assertSame(toPropertyKey(symbol), symbol);
      assertSame(toPropertyKey(62), '62');
      assertSame(toPropertyKey('62'), '62');
      assertSame(toPropertyKey(undefined), 'undefined');
      assertSame(toPropertyKey(null), 'null');
    },
  },
  {
    name: 'ToPropertyKey converts an object through ToPrimitive with the string hint',
    run() {
      const realm = createRealm();
      const object = new EngineObject(realm.intrinsics.objectPrototype);
      /** @type {string[]} */
      const calls = [];

      object.defineOwnProperty('toString', {
        value: realm.createNativeFunction({
          name: 'toString',
          length: 0,
          call() {
            calls.push('toString');
            return 'from-toString';
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });
      object.defineOwnProperty('valueOf', {
        value: realm.createNativeFunction({
          name: 'valueOf',
          length: 0,
          call() {
            calls.push('valueOf');
            return 'from-valueOf';
          },
        }),
        writable: true,
        enumerable: false,
        configurable: true,
      });

      assertSame(toPropertyKey(object), 'from-toString');
      assertSame(calls.join(','), 'toString');
    },
  },
  {
    name: 'symbol identity drives both equality comparisons',
    run() {
      const symbol = createSymbol('x');

      assertSame(strictEqualityComparison(symbol, symbol), true);
      assertSame(
        strictEqualityComparison(createSymbol('x'), createSymbol('x')),
        false,
      );
      assertSame(strictEqualityComparison(symbol, 'Symbol(x)'), false);
      assertSame(abstractEqualityComparison(symbol, symbol), true);
      assertSame(abstractEqualityComparison(symbol, 'Symbol(x)'), false);
      assertSame(abstractEqualityComparison(symbol, undefined), false);
      assertSame(abstractEqualityComparison(symbol, null), false);
      assertSame(abstractEqualityComparison(symbol, 0), false);
    },
  },
  {
    name: 'ToObject boxes a symbol against the realm’s %SymbolPrototype%',
    run() {
      const realm = createRealm();
      const symbol = createSymbol('x');
      const wrapper = toObject(realm, symbol);

      assertSame(wrapper instanceof EnginePrimitiveObject, true);
      assertSame(
        /** @type {EnginePrimitiveObject} */ (wrapper).primitiveValue,
        symbol,
      );
      assertSame(wrapper.getClassName(), 'Symbol');
      assertSame(wrapper.getPrototype(), realm.intrinsics.symbolPrototype);
      assertSame(toObject(realm, symbol) === wrapper, false);
    },
  },
  {
    name: '%SymbolPrototype% is an ordinary object, not a boxed symbol',
    run() {
      const realm = createRealm();
      const prototype = realm.intrinsics.symbolPrototype;

      assertSame(prototype instanceof EngineObject, true);
      assertSame(prototype instanceof EnginePrimitiveObject, false);
      assertSame(prototype.getPrototype(), realm.intrinsics.objectPrototype);
    },
  },
  {
    name: 'thisSymbolValue accepts a symbol or its wrapper and rejects the rest',
    run() {
      const realm = createRealm();
      const symbol = createSymbol('x');

      assertSame(thisSymbolValue(symbol), symbol);
      assertSame(thisSymbolValue(toObject(realm, symbol)), symbol);
      assertGuestTypeError(() => thisSymbolValue('Symbol(x)'));
      assertGuestTypeError(() => thisSymbolValue(undefined));
      assertGuestTypeError(() => thisSymbolValue(toObject(realm, 'x')));
      assertGuestTypeError(() =>
        thisSymbolValue(realm.intrinsics.symbolPrototype),
      );
    },
  },
  {
    name: 'realms share symbol values only when they share an agent',
    run() {
      const agent = createAgent();
      const first = createRealm({ agent });
      const second = createRealm({ agent });
      const isolated = createRealm();

      assertSame(first.agent, agent);
      assertSame(second.agent, agent);
      assertSame(isolated.agent === agent, false);
      assertSame(
        first.intrinsics.symbolPrototype === second.intrinsics.symbolPrototype,
        false,
      );
      assertSame(agent.symbolFor('shared') === agent.symbolFor('shared'), true);
      assertSame(
        agent.wellKnownSymbols.iterator === agent.wellKnownSymbols.iterator,
        true,
      );
      assertSame(
        isolated.agent.wellKnownSymbols.iterator ===
          agent.wellKnownSymbols.iterator,
        false,
      );
    },
  },
  {
    name: 'a computed member expression accepts a symbol key',
    run() {
      assertSame(runWithSymbol('var o = {}; o[sym] = 1; o[sym];'), 1);
      assertSame(runWithSymbol('var o = {}; o[sym];'), undefined);
    },
  },
  {
    name: 'a symbol key never collides with its descriptive string',
    run() {
      assertSame(
        runWithSymbol(
          'var o = {}; o[sym] = "symbol"; o["Symbol(collide)"] = "string";' +
            'o[sym] + "/" + o["Symbol(collide)"];',
        ),
        'symbol/string',
      );
      assertSame(
        runWithSymbol('var o = {}; o[sym] = 1; "Symbol(collide)" in o;'),
        false,
      );
    },
  },
  {
    name: 'the in operator and delete accept symbol keys',
    run() {
      assertSame(runWithSymbol('var o = {}; sym in o;'), false);
      assertSame(runWithSymbol('var o = {}; o[sym] = 1; sym in o;'), true);
      assertSame(
        runWithSymbol('var o = {}; o[sym] = 1; delete o[sym]; sym in o;'),
        false,
      );
      assertSame(runWithSymbol('var o = {}; delete o[sym];'), true);
    },
  },
  {
    name: 'a symbol-keyed property is inherited and shadowed like a string-keyed one',
    run() {
      assertSame(
        runWithSymbol(
          'function F() {} var f = new F(); F.prototype[sym] = "proto";' +
            'var before = f[sym]; f[sym] = "own";' +
            'before + "/" + f[sym] + "/" + F.prototype[sym];',
        ),
        'proto/own/proto',
      );
    },
  },
  {
    name: 'inherited symbol-keyed accessors run for reads and writes',
    run() {
      const realm = createRealm();
      const symbol = createSymbol('collide');
      const proto = new EngineObject(realm.intrinsics.objectPrototype);
      /** @type {unknown} */
      let written;

      proto.defineOwnProperty(symbol, {
        get: realm.createNativeFunction({
          name: 'get',
          length: 0,
          call() {
            return 23;
          },
        }),
        set: realm.createNativeFunction({
          name: 'set',
          length: 1,
          call(_thisValue, args) {
            written = args[0];
            return undefined;
          },
        }),
        enumerable: false,
        configurable: true,
      });

      for (const [name, value] of /** @type {[string, unknown][]} */ ([
        ['sym', symbol],
        ['proto', proto],
      ])) {
        realm.globalObject.defineOwnProperty(name, {
          value,
          writable: true,
          enumerable: false,
          configurable: true,
        });
      }

      const completion = evaluateScript(
        realm,
        'var o = Object.create(proto); var read = o[sym];' +
          'o[sym] = "written"; read;',
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 23);
      assertSame(written, 'written');
    },
  },
  {
    name: 'assigning to a symbol property of a symbol primitive follows the wrapper rules',
    run() {
      assertSame(runWithSymbol('sym.a = 0; typeof sym.a;'), 'undefined');
      assertSame(
        runWithSymbol('"use strict"; sym.a = 0;', { completion: 'type' }),
        'throw',
      );
      assertSame(
        runWithSymbol('"use strict"; sym[62] = 0;', { completion: 'type' }),
        'throw',
      );
    },
  },
  {
    name: 'a numeric computed key is still the string key it always was',
    run() {
      assertSame(runWithSymbol('var o = {}; o[62] = "n"; o["62"];'), 'n');
    },
  },
  {
    name: 'Symbol is a callable, non-constructible global',
    run() {
      assertSame(run('typeof Symbol;'), 'function');
      assertSame(run('typeof Symbol("ponies");'), 'symbol');
      assertSame(run('typeof Symbol();'), 'symbol');
      assertSame(run('Symbol.length;'), 0);
      assertSame(run('Symbol.name;'), 'Symbol');
      assertGuestThrow('new Symbol();', 'TypeError');
      assertGuestThrow('new Symbol("ponies");', 'TypeError');
    },
  },
  {
    name: 'the Symbol global and its prototype carry the specified attributes',
    run() {
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(this, "Symbol");' +
            'd.writable + "/" + d.enumerable + "/" + d.configurable;',
        ),
        'true/false/true',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Symbol, "prototype");' +
            'd.writable + "/" + d.enumerable + "/" + d.configurable;',
        ),
        'false/false/false',
      );
      assertSame(run('Symbol.prototype.constructor === Symbol;'), true);
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Symbol.prototype, "constructor");' +
            'd.writable + "/" + d.enumerable + "/" + d.configurable;',
        ),
        'true/false/true',
      );
    },
  },
  {
    name: 'the description argument goes through ToString, so a symbol description throws',
    run() {
      assertSame(run('Symbol(1).toString();'), 'Symbol(1)');
      assertSame(run('Symbol(null).toString();'), 'Symbol(null)');
      assertSame(run('Symbol().toString();'), 'Symbol()');
      assertSame(run('Symbol(undefined).toString();'), 'Symbol()');
      assertGuestThrow('Symbol(Symbol());', 'TypeError');
      assertGuestThrow(
        'Symbol({ toString: function () { throw new RangeError(); } });',
        'RangeError',
      );
    },
  },
  {
    name: 'Symbol.prototype.toString and valueOf accept only a Symbol this value',
    run() {
      assertSame(run('Symbol.prototype.toString.length;'), 0);
      assertSame(run('Symbol.prototype.valueOf.length;'), 0);
      assertSame(
        run('var s = Symbol("x"); Symbol.prototype.valueOf.call(s) === s;'),
        true,
      );
      assertSame(
        run(
          'var s = Symbol("x"); Symbol.prototype.valueOf.call(Object(s)) === s;',
        ),
        true,
      );
      assertGuestThrow('Symbol.prototype.toString.call("x");', 'TypeError');
      assertGuestThrow('Symbol.prototype.valueOf.call(1);', 'TypeError');
      assertGuestThrow(
        'Symbol.prototype.valueOf.call(Symbol.prototype);',
        'TypeError',
      );
    },
  },
  {
    name: 'a boxed symbol inherits from Symbol.prototype and unboxes to its value',
    run() {
      assertSame(
        run('Object.getPrototypeOf(Object(Symbol("x"))) === Symbol.prototype;'),
        true,
      );
      assertSame(run('typeof Object(Symbol());'), 'object');
      assertSame(run('var s = Symbol("x"); Object(s) == s;'), true);
      assertSame(run('var s = Symbol("x"); Object(s) === s;'), false);
    },
  },
  {
    name: 'the global symbol registry is reachable through Symbol.for and Symbol.keyFor',
    run() {
      assertSame(run('Symbol.for.length;'), 1);
      assertSame(run('Symbol.keyFor.length;'), 1);
      assertSame(run('Symbol.for("ponies") === Symbol.for("ponies");'), true);
      assertSame(run('Symbol.for(3) === Symbol.for("3");'), true);
      assertSame(run('Symbol.for() === Symbol.for("undefined");'), true);
      assertSame(
        run('Symbol.for.call(String, "call") === Symbol.for("call");'),
        true,
      );
      assertSame(run('Symbol.keyFor(Symbol.for("round")) === "round";'), true);
      assertSame(run('Symbol.keyFor(Symbol("round"));'), undefined);
      assertSame(run('Symbol.keyFor(Symbol.iterator);'), undefined);
      assertGuestThrow('Symbol.keyFor("not a symbol");', 'TypeError');
      assertGuestThrow('Symbol.for(Symbol());', 'TypeError');
    },
  },
  {
    name: 'every well-known symbol is an unwritable, unconfigurable Symbol property',
    run() {
      for (const name of WELL_KNOWN_SYMBOL_NAMES) {
        assertSame(run(`typeof Symbol.${name};`), 'symbol', name);
        assertSame(
          run(`Symbol.${name}.toString();`),
          `Symbol(Symbol.${name})`,
          name,
        );
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(Symbol, "${name}");` +
              'd.writable + "/" + d.enumerable + "/" + d.configurable;',
          ),
          'false/false/false',
          name,
        );
      }
    },
  },
  {
    name: 'Symbol.prototype carries @@toStringTag and @@toPrimitive',
    run() {
      assertSame(run('Symbol.prototype[Symbol.toStringTag];'), 'Symbol');
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Symbol.prototype, Symbol.toStringTag);' +
            'd.writable + "/" + d.enumerable + "/" + d.configurable;',
        ),
        'false/false/true',
      );
      assertSame(
        run('typeof Symbol.prototype[Symbol.toPrimitive];'),
        'function',
      );
      assertSame(run('Symbol.prototype[Symbol.toPrimitive].length;'), 1);
      assertSame(
        run('Symbol.prototype[Symbol.toPrimitive].name;'),
        '[Symbol.toPrimitive]',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Symbol.prototype, Symbol.toPrimitive);' +
            'd.writable + "/" + d.enumerable + "/" + d.configurable;',
        ),
        'false/false/true',
      );
      assertSame(
        run(
          'var s = Symbol("x");' +
            'Symbol.prototype[Symbol.toPrimitive].call(s) === s;',
        ),
        true,
      );
      assertGuestThrow(
        'Symbol.prototype[Symbol.toPrimitive].call("x");',
        'TypeError',
      );
    },
  },
  {
    name: 'symbols resist implicit coercion but not explicit description rendering',
    run() {
      assertGuestThrow('Symbol("x") + "";', 'TypeError');
      assertGuestThrow('"" + Symbol("x");', 'TypeError');
      assertGuestThrow('+Symbol("x");', 'TypeError');
      assertGuestThrow('Number(Symbol("x"));', 'TypeError');
      assertGuestThrow('Symbol("x") < Symbol("x");', 'TypeError');
      assertSame(run('String(Symbol("x"));'), 'Symbol(x)');
      assertSame(run('String(Symbol());'), 'Symbol()');
      assertGuestThrow('new String(Symbol("x"));', 'TypeError');
      assertSame(run('Boolean(Symbol("x"));'), true);
      assertSame(run('!Symbol("x");'), false);
    },
  },
  {
    name: 'symbol values are shared across realms on one agent, and never across agents',
    run() {
      const agent = createAgent();
      const first = createRealm({ agent });
      const second = createRealm({ agent });
      const foreign = createRealm();
      const symbolOf = (
        /** @type {import('../src/runtime/realm.js').Realm} */ realm,
      ) => realm.globalObject.get('Symbol');

      assertSame(symbolOf(first) === symbolOf(second), false);
      assertSame(
        evaluateScript(first, 'Symbol.iterator;').value,
        evaluateScript(second, 'Symbol.iterator;').value,
      );
      assertSame(
        evaluateScript(first, 'Symbol.for("cross-realm");').value,
        evaluateScript(second, 'Symbol.for("cross-realm");').value,
      );
      assertSame(
        evaluateScript(second, 'Symbol.keyFor(Symbol.for("cross-realm"));')
          .value,
        'cross-realm',
      );
      assertSame(
        evaluateScript(first, 'Symbol.prototype;').value ===
          evaluateScript(second, 'Symbol.prototype;').value,
        false,
      );

      // A realm on its own agent shares nothing: this is what keeps one
      // embedding's interned keys out of another's registry.
      assertSame(
        evaluateScript(foreign, 'Symbol.iterator;').value ===
          evaluateScript(first, 'Symbol.iterator;').value,
        false,
      );
      assertSame(
        evaluateScript(foreign, 'Symbol.for("cross-realm");').value ===
          evaluateScript(first, 'Symbol.for("cross-realm");').value,
        false,
      );
      assertSame(
        evaluateScript(foreign, 'Symbol.keyFor(Symbol.for("cross-realm"));')
          .value,
        'cross-realm',
      );
    },
  },
  {
    name: 'guest Symbol.for interns into its own realm’s agent and nowhere else',
    run() {
      const agent = createAgent();
      const realm = createRealm({ agent });
      const other = createAgent();

      assertSame(agent.registeredSymbolCount, 0);
      evaluateScript(realm, 'Symbol.for("guest-key");');
      assertSame(agent.registeredSymbolCount, 1);
      assertSame(other.registeredSymbolCount, 0);
      assertSame(
        agent.symbolKeyFor(
          /** @type {symbol} */ (
            evaluateScript(realm, 'Symbol.for("guest-key");').value
          ),
        ),
        'guest-key',
      );
      assertSame(agent.registeredSymbolCount, 1);
    },
  },
  {
    name: 'a realm created without an agent gets a fresh one it alone owns',
    run() {
      const realm = createRealm();

      assertSame(realm.agent instanceof Agent, true);
      assertSame(realm.agent.registeredSymbolCount, 0);
      evaluateScript(realm, 'Symbol.for("owned");');
      assertSame(realm.agent.registeredSymbolCount, 1);
      // Nothing outside the realm can observe that entry, so the realm going
      // away takes the whole registry with it.
      assertSame(createRealm().agent.registeredSymbolCount, 0);
    },
  },
  {
    name: 'reflection splits string keys from symbol keys',
    run() {
      assertSame(
        run(
          'var s = Symbol("k"); var o = { a: 1 }; o[s] = 2; o.b = 3;' +
            'Object.keys(o).join(",") + "|" +' +
            'Object.getOwnPropertyNames(o).join(",") + "|" +' +
            'Object.getOwnPropertySymbols(o).length + "|" +' +
            '(Object.getOwnPropertySymbols(o)[0] === s);',
        ),
        'a,b|a,b|1|true',
      );
      assertSame(run('Object.getOwnPropertySymbols.length;'), 1);
      assertSame(run('Object.getOwnPropertySymbols({}).length;'), 0);
      assertSame(run('Object.getOwnPropertySymbols("ab").length;'), 0);
      assertGuestThrow('Object.getOwnPropertySymbols(null);', 'TypeError');
      assertGuestThrow('Object.getOwnPropertySymbols(undefined);', 'TypeError');
    },
  },
  {
    name: 'getOwnPropertySymbols reports symbol keys in definition order',
    run() {
      assertSame(
        run(
          'var a = Symbol("a"); var b = Symbol("b"); var o = {};' +
            'Object.defineProperty(o, a, { value: 1 });' +
            'o.plain = 0;' +
            'Object.defineProperty(o, b, { value: 2 });' +
            'var keys = Object.getOwnPropertySymbols(o);' +
            'keys.length + "/" + (keys[0] === a) + "/" + (keys[1] === b);',
        ),
        '2/true/true',
      );
    },
  },
  {
    name: 'mixed own keys use index string and symbol bucket order everywhere',
    run() {
      assertSame(
        run(
          'var first = Symbol("first"); var second = Symbol("second"); var o = {};' +
            'o.z = "z"; o[first] = 1; o[10] = "ten"; o.a = "a";' +
            'o[2] = "two"; o[second] = 2; o[1] = "one";' +
            'var own = Reflect.ownKeys(o);' +
            'var symbols = Object.getOwnPropertySymbols(o);' +
            'var loop = []; for (var key in o) { loop.push(key); }' +
            'var descriptor = Object.getOwnPropertyDescriptor(own, "0");' +
            'own.slice(0, 5).join(",") + "|" +' +
            '(own[5] === first) + "," + (own[6] === second) + "|" +' +
            'Object.getOwnPropertyNames(o).join(",") + "|" +' +
            '(symbols[0] === first) + "," + (symbols[1] === second) + "|" +' +
            'Object.keys(o).join(",") + "|" + loop.join(",") + "|" +' +
            'JSON.stringify(o) + "|" +' +
            'descriptor.writable + "," + descriptor.enumerable + "," +' +
            'descriptor.configurable;',
        ),
        '1,2,10,z,a|true,true|1,2,10,z,a|true,true|1,2,10,z,a|1,2,10,z,a|{"1":"one","2":"two","10":"ten","z":"z","a":"a"}|true,true,true',
      );
    },
  },
  {
    name: 'computed super member access preserves a symbol property key',
    run() {
      assertSame(
        run(
          'var key = Symbol("key"); Object.prototype[key] = 7;' +
            'var object = { get value() { return super[key]; } }; object.value;',
        ),
        7,
      );
    },
  },
  {
    name: 'descriptor and membership reflection accept symbol keys',
    run() {
      assertSame(
        run(
          'var s = Symbol("k"); var o = {};' +
            'Object.defineProperty(o, s, { value: 7, enumerable: true });' +
            'var d = Object.getOwnPropertyDescriptor(o, s);' +
            'd.value + "/" + d.writable + "/" + d.enumerable + "/" + d.configurable;',
        ),
        '7/false/true/false',
      );
      assertSame(
        run(
          'var s = Symbol("k"); var o = {}; o[s] = 1;' +
            'o.hasOwnProperty(s) + "/" + o.propertyIsEnumerable(s);',
        ),
        'true/true',
      );
      assertSame(
        run(
          'var s = Symbol("k");' +
            'Object.getOwnPropertyDescriptor({}, s) === undefined;',
        ),
        true,
      );
    },
  },
  {
    name: 'for-in and JSON never see symbol keys or symbol values',
    run() {
      assertSame(
        run(
          'var s = Symbol("k"); var o = { a: 1 }; o[s] = 2;' +
            'var seen = []; for (var k in o) { seen.push(k); } seen.join(",");',
        ),
        'a',
      );
      assertSame(
        run(
          'var o = { a: 1 };' +
            'o[Symbol.for("ponies")] = { toJSON: function () { throw "fit"; } };' +
            'o[Symbol.iterator] = { toJSON: function () { throw "fit"; } };' +
            'JSON.stringify(o);',
        ),
        '{"a":1}',
      );
      assertSame(
        run(
          'var o = { a: 1 }; o[Symbol("k")] = 1;' +
            'JSON.stringify(o, function (k, v) {' +
            '  if (typeof k === "symbol") { throw "fit"; } return v;' +
            '});',
        ),
        '{"a":1}',
      );
      assertSame(run('JSON.stringify(Symbol("x"));'), undefined);
      assertSame(run('JSON.stringify({ a: Symbol("x") });'), '{}');
      assertSame(run('JSON.stringify([Symbol("x")]);'), '[null]');
      // A symbol key must not be coerced into the string key its description
      // renders as: doing so would emit that key twice and run its getter
      // twice (ES2015 24.3.2 enumerates only String-typed own keys).
      assertSame(
        run(
          'var s = Symbol("a"); var o = {}; o[s] = 1; o["Symbol(a)"] = 2;' +
            'JSON.stringify(o);',
        ),
        '{"Symbol(a)":2}',
      );
      assertSame(
        run(
          'var count = 0; var s = Symbol("g"); var o = {};' +
            'Object.defineProperty(o, "Symbol(g)", {' +
            '  get: function () { count += 1; return 1; }, enumerable: true' +
            '});' +
            'o[s] = 9; JSON.stringify(o) + "|" + count;',
        ),
        '{"Symbol(g)":1}|1',
      );
    },
  },
  {
    name: 'Object.prototype.toString reports a string @@toStringTag',
    run() {
      assertSame(
        run('Object.prototype.toString.call(Symbol("x"));'),
        '[object Symbol]',
      );
      assertSame(
        run('Object.prototype.toString.call(Symbol.prototype);'),
        '[object Symbol]',
      );
      assertSame(
        run(
          'var o = {}; o[Symbol.toStringTag] = "Custom";' +
            'Object.prototype.toString.call(o);',
        ),
        '[object Custom]',
      );
      assertSame(
        run(
          'var o = {}; o[Symbol.toStringTag] = 42;' +
            'Object.prototype.toString.call(o);',
        ),
        '[object Object]',
      );
      assertSame(
        run(
          'var a = []; a[Symbol.toStringTag] = "Tagged";' +
            'Object.prototype.toString.call(a);',
        ),
        '[object Tagged]',
      );
      assertSame(
        run(
          'var o = Object.create({});' +
            'Object.getPrototypeOf(o)[Symbol.toStringTag] = "Inherited";' +
            'Object.prototype.toString.call(o);',
        ),
        '[object Inherited]',
      );
    },
  },
  {
    name: 'Object.prototype.toString uses the receiver object’s agent',
    run() {
      const ownerAgent = createAgent();
      const callerAgent = createAgent();
      const ownerRealm = createRealm({ agent: ownerAgent });
      const callerRealm = createRealm({ agent: callerAgent });
      const object = new EngineObject(ownerRealm.intrinsics.objectPrototype);
      const toStringMethod =
        /** @type {import('../src/builtins/shared.js').NativeFunction} */ (
          callerRealm.intrinsics.objectPrototype.get('toString')
        );

      object.defineOwnProperty(callerAgent.wellKnownSymbols.toStringTag, {
        value: 'Caller',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(toStringMethod.callFunction(object, []), '[object Object]');

      object.defineOwnProperty(ownerAgent.wellKnownSymbols.toStringTag, {
        value: 'Owner',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(toStringMethod.callFunction(object, []), '[object Owner]');
      assertSame(
        toStringMethod.callFunction(ownerAgent.wellKnownSymbols.iterator, []),
        '[object Symbol]',
      );
    },
  },
  {
    name: 'the ES5 [[Class]] tags survive the @@toStringTag addition',
    run() {
      assertSame(run('Object.prototype.toString.call([]);'), '[object Array]');
      assertSame(run('Object.prototype.toString.call({});'), '[object Object]');
      assertSame(
        run('Object.prototype.toString.call(function () {});'),
        '[object Function]',
      );
      assertSame(run('Object.prototype.toString.call(Math);'), '[object Math]');
      assertSame(run('Object.prototype.toString.call(JSON);'), '[object JSON]');
      assertSame(
        run('Object.prototype.toString.call(new Date(0));'),
        '[object Date]',
      );
      assertSame(
        run('Object.prototype.toString.call(/x/);'),
        '[object RegExp]',
      );
      assertSame(
        run('Object.prototype.toString.call("x");'),
        '[object String]',
      );
      assertSame(run('Object.prototype.toString.call(1);'), '[object Number]');
      assertSame(
        run('Object.prototype.toString.call(true);'),
        '[object Boolean]',
      );
      assertSame(
        run('Object.prototype.toString.call(new Error("x"));'),
        '[object Error]',
      );
      assertSame(
        run(
          '(function () { return Object.prototype.toString.call(arguments); }());',
        ),
        '[object Arguments]',
      );
      assertSame(
        run('Object.prototype.toString.call(undefined);'),
        '[object Undefined]',
      );
      assertSame(run('Object.prototype.toString.call(null);'), '[object Null]');
    },
  },
  {
    name: 'ToPrimitive consults an object’s @@toPrimitive method',
    run() {
      assertSame(
        run(
          'var hints = []; var o = {};' +
            'o[Symbol.toPrimitive] = function (hint) { hints.push(hint); return 1; };' +
            'var sum = o + 1; var num = o * 2; var str = "" + o;' +
            'hints.join(",");',
        ),
        'default,number,default',
      );
      assertSame(
        run(
          'var o = {};' +
            'o[Symbol.toPrimitive] = function () { return "primitive"; };' +
            'var k = {}; k[o] = 1; Object.keys(k).join(",");',
        ),
        'primitive',
      );
      assertSame(
        run(
          'var o = {}; o[Symbol.toPrimitive] = undefined;' +
            'o.valueOf = function () { return 7; }; o * 1;',
        ),
        7,
      );
      assertSame(
        run(
          'var o = {}; o[Symbol.toPrimitive] = null;' +
            'o.valueOf = function () { return 7; }; o * 1;',
        ),
        7,
      );
      assertGuestThrow(
        'var o = {}; o[Symbol.toPrimitive] = 1; o * 1;',
        'TypeError',
      );
      assertGuestThrow(
        'var o = {}; o[Symbol.toPrimitive] = function () { return {}; }; o * 1;',
        'TypeError',
      );
      assertSame(
        run(
          'var o = {}; o[Symbol.toPrimitive] = function () { return Symbol("s"); };' +
            'typeof o[Symbol.toPrimitive]();',
        ),
        'symbol',
      );
    },
  },
  {
    name: 'ToPrimitive uses the receiver object’s agent',
    run() {
      const ownerAgent = createAgent();
      const callerAgent = createAgent();
      const ownerRealm = createRealm({ agent: ownerAgent });
      const callerRealm = createRealm({ agent: callerAgent });
      const object = new EngineObject(ownerRealm.intrinsics.objectPrototype);

      object.defineOwnProperty(callerAgent.wellKnownSymbols.toPrimitive, {
        value: callerRealm.createNativeFunction({
          name: 'callerToPrimitive',
          length: 1,
          call() {
            return 'caller';
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      object.defineOwnProperty('valueOf', {
        value: ownerRealm.createNativeFunction({
          name: 'valueOf',
          length: 0,
          call() {
            return 'ordinary';
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(toPrimitive(object), 'ordinary');

      object.defineOwnProperty(ownerAgent.wellKnownSymbols.toPrimitive, {
        value: ownerRealm.createNativeFunction({
          name: 'ownerToPrimitive',
          length: 1,
          call() {
            return 'owner';
          },
        }),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(toPrimitive(object), 'owner');
    },
  },
  {
    name: 'every object kind resolves the agent its conversions need',
    run() {
      // ToPrimitive finds `@@toPrimitive` through the agent an EngineObject
      // inherits from its [[Prototype]]. The chain bottoms out at the realm's
      // %Object.prototype%, so the only sites that must pass an agent
      // explicitly are the two that build a null-prototype object. A site
      // that forgot would fail *open* — the lookup silently skipped, the
      // object falling through to OrdinaryToPrimitive, no error anywhere — so
      // each kind is pinned here rather than trusted.
      /** @type {[string, string, unknown][]} */
      const cases = [
        [
          'Object.create(null)',
          'var o = Object.create(null); o[Symbol.toPrimitive] = function () { return 7; }; o * 1;',
          7,
        ],
        [
          'an object derived from a null-prototype object',
          'var p = Object.create(null); var o = Object.create(p);' +
            'p[Symbol.toPrimitive] = function () { return 9; }; o * 1;',
          9,
        ],
        [
          'a deep null-prototype chain',
          'var o = Object.create(null);' +
            'for (var i = 0; i < 5; i += 1) { o = Object.create(o); }' +
            'o[Symbol.toPrimitive] = function () { return 3; }; o * 1;',
          3,
        ],
        [
          'an ordinary object literal',
          'var o = {}; o[Symbol.toPrimitive] = function () { return 1; }; o * 1;',
          1,
        ],
        [
          'an arguments object',
          '(function () { arguments[Symbol.toPrimitive] = function () { return 5; };' +
            'return arguments * 1; }());',
          5,
        ],
        [
          'a bound function',
          'var f = (function () {}).bind(null);' +
            'f[Symbol.toPrimitive] = function () { return 11; }; f * 1;',
          11,
        ],
        [
          'an error object',
          'var e = new Error("x"); e[Symbol.toPrimitive] = function () { return 13; }; e * 1;',
          13,
        ],
        [
          'an array',
          'var a = []; a[Symbol.toPrimitive] = function () { return 15; }; a * 1;',
          15,
        ],
        [
          'a RegExp',
          'var r = /x/; r[Symbol.toPrimitive] = function () { return 17; }; r * 1;',
          17,
        ],
        [
          'a Date',
          'var d = new Date(0); d[Symbol.toPrimitive] = function () { return 19; }; d * 1;',
          19,
        ],
        [
          'a boxed primitive',
          'var s = new String("a"); s[Symbol.toPrimitive] = function () { return 21; }; s * 1;',
          21,
        ],
        [
          'a namespace object',
          'JSON[Symbol.toPrimitive] = function () { return 23; }; JSON * 1;',
          23,
        ],
        [
          'the global object',
          'this[Symbol.toPrimitive] = function () { return 25; }; this * 1;',
          25,
        ],
        [
          'a constructed instance',
          'function F() {} var i = new F();' +
            'i[Symbol.toPrimitive] = function () { return 27; }; i * 1;',
          27,
        ],
      ];

      for (const [label, source, expected] of cases) {
        assertSame(run(source), expected, label);
      }
    },
  },
  {
    name: 'a null-prototype object reports its own @@toStringTag',
    run() {
      assertSame(
        run(
          'var o = Object.create(null); o[Symbol.toStringTag] = "NP";' +
            'Object.prototype.toString.call(o);',
        ),
        '[object NP]',
      );
      assertSame(
        run(
          'var o = Object.create(Object.create(null));' +
            'Object.getPrototypeOf(o)[Symbol.toStringTag] = "Inherited";' +
            'Object.prototype.toString.call(o);',
        ),
        '[object Inherited]',
      );
    },
  },
  {
    name: 'a null-prototype object interns into its own realm\u2019s agent',
    run() {
      const agent = createAgent();
      const realm = createRealm({ agent });

      assertSame(
        evaluateScript(
          realm,
          'var o = Object.create(null); o[Symbol.for("np")] = 1;' +
            'Object.getOwnPropertySymbols(o)[0] === Symbol.for("np");',
        ).value,
        true,
      );
      assertSame(agent.registeredSymbolCount, 1);
    },
  },
];

export default tests;
