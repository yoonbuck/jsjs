import { GuestErrorSignal } from '../runtime/completion.js';
import { thisSymbolValue } from '../runtime/primitive-object.js';
import { toString } from '../runtime/conversion.js';
import {
  WELL_KNOWN_SYMBOL_NAMES,
  createSymbol,
  isSymbol,
  symbolDescriptiveString,
} from '../runtime/symbol.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 * @typedef {import('../runtime/object.js').EngineObject} EngineObject
 * @typedef {import('./shared.js').NativeFunction} NativeFunction
 *
 * @typedef {{ symbolConstructor: NativeFunction }} SymbolIntrinsics
 */

/**
 * Wires the guest-visible `Symbol` constructor onto the `%SymbolPrototype%`
 * intrinsic `builtins/fundamental.js` already created, and installs
 * `Symbol.for`, `Symbol.keyFor`, the eleven ES2015 well-known symbols, and
 * `Symbol.prototype`'s `constructor`, `toString`, `valueOf`,
 * `[@@toPrimitive]`, and `[@@toStringTag]`.
 *
 * Everything created here is per-realm, exactly like every other built-in.
 * The symbol *values* it publishes are not: `Symbol.iterator` and the
 * registry `Symbol.for` reads come from `runtime/symbol.js`, which owns them
 * at agent level because ECMA-262 §6.1.5.1 and §19.4.2.1 say both are shared
 * by all realms. Two realms therefore agree on `Symbol.iterator` and on
 * `Symbol.for('x')` while disagreeing, as they must, on `Symbol` itself and
 * on `Symbol.prototype`.
 *
 * `Symbol` deliberately has no `[[Construct]]`: ES2015 §19.4.1.1 step 1
 * makes `new Symbol()` a `TypeError`, which is precisely what a
 * `NativeFunction` created without a `construct` option already raises.
 *
 * @param {Realm} realm
 * @returns {SymbolIntrinsics}
 */
export function createSymbolIntrinsics(realm) {
  const { symbolPrototype } = realm.intrinsics;
  const { agent } = realm;
  const wellKnown = agent.wellKnownSymbols;

  const symbolConstructor = realm.createNativeFunction({
    name: 'Symbol',
    length: 0,
    prototype: symbolPrototype,
    call(_thisValue, args) {
      // ES2015 19.4.1.1 step 2: an absent or `undefined` description leaves
      // [[Description]] undefined, which is observably different from the
      // empty string even though both render as `Symbol()`.
      const description = args[0];

      return createSymbol(
        description === undefined ? undefined : toString(description, realm),
      );
    },
  });

  symbolPrototype.defineOwnProperty('constructor', {
    value: symbolConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  for (const name of WELL_KNOWN_SYMBOL_NAMES) {
    symbolConstructor.defineOwnProperty(name, {
      value: wellKnown[name],
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  defineMethod(
    symbolConstructor,
    'for',
    realm.createNativeFunction({
      name: 'for',
      length: 1,
      call(_thisValue, args) {
        return agent.symbolFor(toString(args[0], realm));
      },
    }),
  );
  defineMethod(
    symbolConstructor,
    'keyFor',
    realm.createNativeFunction({
      name: 'keyFor',
      length: 1,
      call(_thisValue, args) {
        const symbol = args[0];

        if (!isSymbol(symbol)) {
          throw new GuestErrorSignal(
            'TypeError',
            'Symbol.keyFor requires a symbol',
          );
        }

        return agent.symbolKeyFor(symbol);
      },
    }),
  );

  defineMethod(
    symbolPrototype,
    'toString',
    realm.createNativeFunction({
      name: 'toString',
      length: 0,
      call(thisValue) {
        return symbolDescriptiveString(thisSymbolValue(thisValue));
      },
    }),
  );
  defineMethod(
    symbolPrototype,
    'valueOf',
    realm.createNativeFunction({
      name: 'valueOf',
      length: 0,
      call(thisValue) {
        return thisSymbolValue(thisValue);
      },
    }),
  );

  // ES2015 19.4.3.4: `Symbol.prototype[@@toPrimitive]` ignores the hint and
  // returns the symbol itself, which is what keeps `sym + ''` a TypeError
  // (ToString of the resulting symbol throws) instead of silently rendering
  // the description the way `String(sym)` deliberately does.
  symbolPrototype.defineOwnProperty(wellKnown.toPrimitive, {
    value: realm.createNativeFunction({
      name: '[Symbol.toPrimitive]',
      length: 1,
      call(thisValue) {
        return thisSymbolValue(thisValue);
      },
    }),
    writable: false,
    enumerable: false,
    configurable: true,
  });

  symbolPrototype.defineOwnProperty(wellKnown.toStringTag, {
    value: 'Symbol',
    writable: false,
    enumerable: false,
    configurable: true,
  });

  return { symbolConstructor };
}

/**
 * @param {EngineObject} globalObject
 * @param {SymbolIntrinsics} intrinsics
 * @returns {void}
 */
export function installSymbolConstructor(globalObject, intrinsics) {
  globalObject.defineOwnProperty('Symbol', {
    value: intrinsics.symbolConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {NativeFunction} method
 * @returns {void}
 */
function defineMethod(target, name, method) {
  target.defineOwnProperty(name, {
    value: method,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
