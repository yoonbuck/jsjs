/**
 * Symbol values: the primitives themselves, their descriptions, and
 * `SymbolDescriptiveString`.
 *
 * A guest Symbol **is** a host `symbol` primitive. That is not a shortcut
 * around the engine's host boundary the way host `eval` or a host object
 * would be: a symbol is a value of the host *language*, exactly like the
 * strings, numbers, and booleans the engine already uses for the
 * corresponding guest types, and it carries no behaviour a guest could reach.
 * What it buys is that the whole object model already works: the engine's
 * property key type is `string | symbol` (`descriptors.js`), every property
 * table is a `Map` keyed by it, and identity is the host's own — so symbol
 * keys can never collide with string keys, and nothing has to invent a second
 * key representation.
 *
 * The engine still mints its *own* symbols rather than reusing the host's
 * (`Symbol.iterator` and friends). Sharing those would let a guest's
 * `@@iterator` property be seen by host code that happens to iterate an
 * engine object, and would tie guest identity to whichever host the engine
 * runs in — the same reason nothing else here is borrowed from the host.
 *
 * **This module holds no state.** Everything here is a pure function of its
 * arguments, so nothing a guest does can be retained at module scope. The two
 * pieces of symbol state ECMA-262 shares between realms — the well-known
 * symbols and the `GlobalSymbolRegistry` — are owned by an `Agent`
 * (`runtime/agent.js`), an ordinary object the embedder holds and can drop.
 * `test/node/repository-invariants.test.js` fails if module-level mutable
 * state reappears here.
 */

/**
 * The ES2015 well-known symbol names, in the order ECMA-262 §6.1.5.1's table
 * lists them.
 *
 * @type {readonly ['hasInstance', 'isConcatSpreadable', 'iterator', 'match', 'replace', 'search', 'species', 'split', 'toPrimitive', 'toStringTag', 'unscopables']}
 */
export const WELL_KNOWN_SYMBOL_NAMES = Object.freeze(
  /** @type {const} */ ([
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
  ]),
);

/**
 * @typedef {(typeof WELL_KNOWN_SYMBOL_NAMES)[number]} WellKnownSymbolName
 */

/**
 * @param {unknown} value
 * @returns {value is symbol}
 */
export function isSymbol(value) {
  return typeof value === 'symbol';
}

/**
 * Creates a fresh unique Symbol value with the given `[[Description]]`
 * (ECMA-262 §19.4.1.1 step 4). `undefined` and `''` are different
 * descriptions and stay different: `Symbol()` renders as `Symbol()` and
 * `Symbol('')` renders as `Symbol()` too, but only the first has no
 * description at all.
 *
 * @param {string | undefined} description
 * @returns {symbol}
 */
export function createSymbol(description) {
  return Symbol(description);
}

/**
 * A symbol's `[[Description]]` internal slot.
 *
 * @param {symbol} symbol
 * @returns {string | undefined}
 */
export function symbolDescription(symbol) {
  if (!isSymbol(symbol)) {
    throw new TypeError('symbolDescription requires a symbol');
  }

  return symbol.description;
}

/**
 * ECMA-262 §19.4.3.2.1 `SymbolDescriptiveString`. A symbol with no
 * description and one described by the empty string both render as
 * `Symbol()`, which is what the specification's `"Symbol(" + desc + ")"`
 * concatenation produces once an undefined description is replaced by the
 * empty string.
 *
 * @param {symbol} symbol
 * @returns {string}
 */
export function symbolDescriptiveString(symbol) {
  const description = symbolDescription(symbol);

  return `Symbol(${description === undefined ? '' : description})`;
}
