import {
  getIterator,
  iteratorStep,
  iteratorValue,
} from '../runtime/iterator.js';

/**
 * @typedef {import('../runtime/realm.js').Realm} Realm
 */

/**
 * Materializes an iterable's values through the engine's iterator protocol.
 *
 * The returned host array is evaluator-internal transport for argument lists
 * and array-element construction; guest values remain unwrapped throughout.
 * Iterator-step and iterator-value abrupt completions propagate directly, as
 * neither operation requires IteratorClose in this consumption path.
 *
 * @param {Realm} realm
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function iterableToList(realm, value) {
  const iterator = getIterator(realm, value);
  /** @type {unknown[]} */
  const values = [];

  while (true) {
    const step = iteratorStep(iterator);

    if (step === false) {
      return values;
    }

    values.push(iteratorValue(step));
  }
}
