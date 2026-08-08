# ES2015 Symbols Design

## Goal

Add the Symbol primitive type, its wrapper and prototype, the global symbol
registry, symbol property keys, symbol-aware reflection, and the ES2015
well-known symbols, without disturbing the engine's ES5.1 string-key behaviour
or its realm isolation.

## Architecture

A guest Symbol value **is** a host `symbol` primitive. The engine's property
key type is already `string | symbol` (`src/runtime/descriptors.js`), every
property table is a `Map` keyed by that type, and `enumerableKeysForIn`
already skips non-string keys, so the object model needs no new key
representation — only the conversions, reflection, and built-ins that
currently assume `string` have to learn the second case.

The engine never reuses the host's own well-known symbols. `src/runtime/symbol.js`
mints fresh symbols with `Symbol(description)` and owns three
agent-level (not realm-level) pieces of state: the eleven ES2015 well-known
symbols, the `GlobalSymbolRegistry`, and its reverse index. Agent level is what
the specification asks for — ECMA-262 §6.1.5.1 says well-known symbol values
"are shared by all realms", and §19.4.2.1's registry is "a List that is globally
available … shared by all realms" — so `Symbol.iterator` from one realm is the
same value as `Symbol.iterator` from another, while `Symbol`, `Symbol.prototype`,
and every wrapper stay per-realm as usual.

A boxed Symbol is an `EnginePrimitiveObject` (the existing boxed-primitive
class) whose `primitiveValue` is a symbol, boxed against a new per-realm
`%SymbolPrototype%`. Unlike ES5's wrapper prototypes, `%SymbolPrototype%` is an
_ordinary_ object with no `[[SymbolData]]` (ES2015 §19.4.3), so
`Symbol.prototype.valueOf.call(Symbol.prototype)` throws.

Two well-known symbols are wired into real protocols because Symbol itself
needs them: `@@toPrimitive` becomes a step of `ToPrimitive`, and `@@toStringTag`
is consulted by `Object.prototype.toString` ahead of the ES5 `[[Class]]` tag.
The other nine are defined values whose protocols belong to later issues (#38,
#47), which is recorded in `docs/limitations.md`.

Protocol lookup follows object ownership across agent boundaries. When an
`EngineObject` created by one agent is passed to a built-in from another
agent, `@@toPrimitive` and `@@toStringTag` are looked up with the receiver
object's agent symbols, never the currently executing realm's symbols. A
property keyed by the other agent's same-named well-known symbol remains an
ordinary symbol property. Every guest-reachable `EngineObject` has a non-null
agent; protocol entry points assert that internal invariant rather than
silently skipping the lookup. Primitive receivers are boxed by the executing
realm as before, so their behaviour remains realm-local.

`EngineObject#ownPropertyKeys()` implements ES2015
`OrdinaryOwnPropertyKeys` for the combined object/function and Symbol runtime:
array-index string keys in ascending numeric order, then remaining string keys
in creation order, then symbol keys in creation order. `Reflect.ownKeys`
exposes the complete list; `Object.getOwnPropertyNames`, `Object.keys`,
`for-in`, and JSON keep only the string portion, while
`Object.getOwnPropertySymbols` keeps only the symbol portion. All six surfaces
therefore share one ordering algorithm even when strings and symbols were
created in an interleaved order.

## Scope

- Symbol creation, identity, descriptions, `SymbolDescriptiveString`
- `Symbol`/`Symbol.prototype`, `for`, `keyFor`, `toString`, `valueOf`,
  `@@toPrimitive`, `@@toStringTag`
- The eleven ES2015 well-known symbols, shared across realms
- `ToPropertyKey` at every guest property-key site; symbol-keyed get/put/
  define/delete/`in`/`hasOwnProperty`
- Reflection: `Reflect.ownKeys`, `Object.getOwnPropertySymbols`, string-only
  `Object.keys` and `Object.getOwnPropertyNames`, symbol-free `for-in` and
  `JSON`, all with ES2015 `OrdinaryOwnPropertyKeys` ordering
- `typeof`, equality, `ToBoolean`/`ToObject` acceptance, and
  `ToNumber`/`ToString` rejection of symbols
- Test262: a prefix-scoped feature-claim mechanism in the selection policy,
  the `Symbol` feature manifest entries, and the resulting pinned records

## Out of scope

The iterator protocol and `for-of` (#47), method definitions and ES2015
function `name`/`length` attributes (#38), `Symbol.prototype.description`
(ES2019), `Symbol.asyncIterator`/`matchAll`/`dispose` (post-ES2015), and the
`@@species`/`@@match`/`@@replace`/`@@search`/`@@split`/`@@hasInstance`/
`@@isConcatSpreadable`/`@@unscopables` protocol behaviours.

## Acceptance Criteria

Symbol keys never collide with string keys; reflection and enumeration split
the two key kinds exactly as ES2015 requires; well-known symbols and the
registry are shared across realms while constructors and prototypes are not;
every newly pinned Test262 record passes; Node, Chromium, and JSC reports stay
equivalent; all CI contracts pass.
