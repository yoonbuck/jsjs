import { EngineObject } from './object.js';

/**
 * The two built-in iterator exotic-ish objects — really ordinary objects with
 * the internal slots ECMA-262 gives Array Iterator (§22.1.5.1) and String
 * Iterator (§21.1.5.1) instances. Modelling the slots as host fields on a
 * dedicated subclass is exactly how `EngineArray` models an array's `length`
 * coupling: the slots are engine state a guest can never name, and the subclass
 * brand is what lets a built-in `next` reject a `this` that is not one of its
 * own iterators (`arrayIterator.next.call({})` must be a `TypeError`).
 */

/**
 * An Array Iterator instance (ECMA-262 §22.1.5). `iteratedObject` is set to
 * `undefined` once the iterator is exhausted so a later `next` short-circuits
 * to a done result without re-reading the (possibly mutated) source.
 */
export class ArrayIterator extends EngineObject {
  /**
   * @param {EngineObject} prototype The realm's `%ArrayIteratorPrototype%`.
   * @param {EngineObject} array The `[[IteratedObject]]`.
   * @param {'key' | 'value' | 'key+value'} kind The `[[ArrayIterationKind]]`.
   */
  constructor(prototype, array, kind) {
    super(prototype, 'Array Iterator');
    /** @type {EngineObject | undefined} */
    this.iteratedObject = array;
    /** @type {number} */
    this.nextIndex = 0;
    /** @type {'key' | 'value' | 'key+value'} */
    this.kind = kind;
  }
}

/**
 * A String Iterator instance (ECMA-262 §21.1.5). `iteratedString` becomes
 * `undefined` at exhaustion. `nextIndex` counts UTF-16 code units, advancing by
 * two across a surrogate pair so iteration yields code points.
 */
export class StringIterator extends EngineObject {
  /**
   * @param {EngineObject} prototype The realm's `%StringIteratorPrototype%`.
   * @param {string} string The `[[IteratedString]]`.
   */
  constructor(prototype, string) {
    super(prototype, 'String Iterator');
    /** @type {string | undefined} */
    this.iteratedString = string;
    /** @type {number} */
    this.nextIndex = 0;
  }
}
