import { assertSame, assertThrows } from './harness/assert.js';
import {
  WELL_KNOWN_SYMBOLS,
  WELL_KNOWN_SYMBOL_NAMES,
  createSymbol,
  isSymbol,
  symbolDescription,
  symbolDescriptiveString,
  symbolFor,
  symbolKeyFor,
} from '../src/runtime/symbol.js';
import { createRealm } from '../src/runtime/realm.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import {
  toBoolean,
  toNumber,
  toObject,
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
    name: 'the well-known symbol record is frozen against guest-reachable edits',
    run() {
      assertSame(Object.isFrozen(WELL_KNOWN_SYMBOLS), true);
      assertSame(Object.isFrozen(WELL_KNOWN_SYMBOL_NAMES), true);
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
    name: 'realms share symbol values but not their %SymbolPrototype%',
    run() {
      const first = createRealm();
      const second = createRealm();

      assertSame(
        first.intrinsics.symbolPrototype === second.intrinsics.symbolPrototype,
        false,
      );
      assertSame(symbolFor('shared') === symbolFor('shared'), true);
      assertSame(WELL_KNOWN_SYMBOLS.iterator, WELL_KNOWN_SYMBOLS.iterator);
    },
  },
];

export default tests;
