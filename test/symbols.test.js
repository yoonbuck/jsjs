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
];

export default tests;
