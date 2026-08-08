/**
 * Symbol values: the primitives themselves, their descriptions, the global
 * symbol registry, and the ES2015 well-known symbols.
 *
 * A guest Symbol **is** a host `symbol` primitive. That is not a shortcut
 * around the engine's host boundary the way host `eval` or a host object
 * would be: a symbol is a value of the host *language*, exactly like the
 * strings, numbers, and booleans the engine already uses for the
 * corresponding guest types, and it carries no behaviour a guest could reach.
 * What it buys is that the whole object model already works: the engine's
 * property key type is `string | symbol`
 * (`descriptors.js`), every property table is a `Map` keyed by it, and
 * identity is the host's own — so symbol keys can never collide with string
 * keys, and nothing has to invent a second key representation.
 *
 * The engine still mints its *own* symbols rather than reusing the host's
 * (`Symbol.iterator` and friends). Sharing those would let a guest's
 * `@@iterator` property be seen by host code that happens to iterate an
 * engine object, and would tie guest identity to whichever host the engine
 * runs in — the same reason nothing else here is borrowed from the host.
 *
 * The state below is deliberately **agent-level** rather than per-realm,
 * which is the one place symbols differ from every other intrinsic:
 *
 * - ECMA-262 §6.1.5.1 says well-known symbol values "are shared by all
 *   realms", so `Symbol.iterator` read from one realm must be the very same
 *   value as `Symbol.iterator` read from another. A cross-realm protocol key
 *   that differed per realm would make `@@iterator` unusable between realms.
 * - §19.4.2.1 says the `GlobalSymbolRegistry` "is a List that is globally
 *   available … shared by all realms", so `Symbol.for('x')` agrees across
 *   realms too.
 *
 * Everything guest-visible *about* symbols — the `Symbol` constructor,
 * `%SymbolPrototype%`, and every wrapper object — stays per-realm in
 * `builtins/symbol.js`, so realm isolation is unchanged: two realms share
 * symbol *values* and nothing else.
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
 * The eleven ES2015 well-known symbols, keyed by the name they carry on the
 * `Symbol` constructor. Each one's `[[Description]]` is `Symbol.<name>`, so
 * `String(Symbol.iterator)` is `"Symbol(Symbol.iterator)"` exactly as
 * §6.1.5.1's table specifies.
 *
 * @type {Readonly<Record<WellKnownSymbolName, symbol>>}
 */
export const WELL_KNOWN_SYMBOLS = Object.freeze(
  /** @type {Record<WellKnownSymbolName, symbol>} */ (
    Object.fromEntries(
      WELL_KNOWN_SYMBOL_NAMES.map((name) => [name, Symbol(`Symbol.${name}`)]),
    )
  ),
);

/**
 * ECMA-262 §19.4.2.1's `GlobalSymbolRegistry`, as the two lookups the
 * specification's [Key, Symbol] record list is ever asked for:
 * `Symbol.for` searches by key, `Symbol.keyFor` searches by symbol. Two maps
 * answer both in constant time and cannot disagree, because
 * {@link symbolFor} is the only writer and always writes both.
 *
 * @type {Map<string, symbol>}
 */
const registryByKey = new Map();

/** @type {Map<symbol, string>} */
const registryBySymbol = new Map();

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

/**
 * ECMA-262 §19.4.2.1 `Symbol.for`: the registry's symbol for `key`, minting
 * and recording one the first time the key is seen.
 *
 * @param {string} key
 * @returns {symbol}
 */
export function symbolFor(key) {
  const existing = registryByKey.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const symbol = createSymbol(key);

  registryByKey.set(key, symbol);
  registryBySymbol.set(symbol, key);

  return symbol;
}

/**
 * ECMA-262 §19.4.2.5 `Symbol.keyFor`: the key a symbol is registered under,
 * or `undefined` for a symbol the registry has never held — which includes
 * every well-known symbol and everything `Symbol()` produced.
 *
 * @param {symbol} symbol
 * @returns {string | undefined}
 */
export function symbolKeyFor(symbol) {
  if (!isSymbol(symbol)) {
    throw new TypeError('symbolKeyFor requires a symbol');
  }

  return registryBySymbol.get(symbol);
}
