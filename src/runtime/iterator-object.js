import { EngineObject } from './object.js';
import { GuestErrorSignal } from './completion.js';
import {
  createIterResultObject,
  getIteratorRecord,
  iteratorStep,
  iteratorValue,
} from './iterator.js';

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

/**
 * An ordinary ES2015 `[[Enumerate]]` iterator. Its state remains private, but
 * its sole consumer-facing operation is an own public `next` method that
 * returns ordinary IteratorResult objects.
 */
export class ForInIterator extends EngineObject {
  /**
   * @param {import('./realm.js').Realm} realm
   * @param {EngineObject} target
   */
  constructor(realm, target) {
    super(realm.intrinsics.objectPrototype, 'Object', realm.agent);

    /** @type {import('./realm.js').Realm} */
    this.realm = realm;
    /** @type {EngineObject} */
    this.target = target;
    /** @type {string[]} */
    this.candidates = [];
    /** @type {number} */
    this.candidateIndex = 0;
    /** @type {Set<string>} */
    this.visited = new Set();
    /** @type {import('./iterator.js').IteratorRecord | null} */
    this.remainder = null;
    /** @type {boolean} */
    this.exhausted = false;

    snapshotForInCandidates(this);

    const iterator = this;
    this.defineOwnProperty('next', {
      value: realm.createNativeFunction({
        name: 'next',
        length: 0,
        call(thisValue) {
          if (thisValue !== iterator) {
            throw new GuestErrorSignal(
              'TypeError',
              'For-in iterator next called on an incompatible receiver',
            );
          }
          return iterator.next();
        },
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  /**
   * @returns {EngineObject}
   */
  next() {
    if (this.exhausted) {
      return createIterResultObject(this.realm, undefined, true);
    }

    while (this.candidateIndex < this.candidates.length) {
      const key = this.candidates[this.candidateIndex];
      this.candidateIndex += 1;

      if (this.visited.has(key)) {
        continue;
      }

      const descriptor = findLiveForInDescriptor(this.target, key);

      if (descriptor === undefined) {
        continue;
      }

      this.visited.add(key);
      if (descriptor.enumerable === true) {
        return createIterResultObject(this.realm, key, false);
      }
    }

    return nextForInRemainder(this);
  }
}

/**
 * Snapshots only initial string candidates. Their descriptors are intentionally
 * read later so deletion, reconfiguration, and prototype replacement remain
 * observable before a candidate is yielded.
 *
 * @param {ForInIterator} iterator
 * @returns {void}
 */
function snapshotForInCandidates(iterator) {
  /** @type {EngineObject | null} */
  let current = iterator.target;

  while (current !== null) {
    if (
      current !== iterator.target &&
      current.enumerate !== EngineObject.prototype.enumerate
    ) {
      iterator.remainder = getIteratorRecord(
        current.enumerate(),
        iterator.realm,
      );
      return;
    }

    for (const key of current.ownPropertyKeys()) {
      if (typeof key === 'string') {
        iterator.candidates.push(key);
      }
    }

    current = current.getPrototypeOf();
  }
}

/**
 * Rechecks a snapshotted key against the current prototype graph. A descriptor
 * is returned only for the first live owner, preserving shadowing semantics.
 *
 * @param {EngineObject} target
 * @param {string} key
 * @returns {import('./descriptors.js').CompletePropertyDescriptor | undefined}
 */
function findLiveForInDescriptor(target, key) {
  /** @type {EngineObject | null} */
  let current = target;

  while (current !== null) {
    const descriptor = current.getOwnProperty(key);

    if (descriptor !== undefined) {
      return descriptor;
    }

    current = current.getPrototypeOf();
  }

  return undefined;
}

/**
 * @param {ForInIterator} iterator
 * @returns {EngineObject}
 */
function nextForInRemainder(iterator) {
  const record = iterator.remainder;

  if (record === null) {
    iterator.exhausted = true;
    return createIterResultObject(iterator.realm, undefined, true);
  }

  for (;;) {
    const step = iteratorStep(record);

    if (step === false) {
      record.done = true;
      iterator.exhausted = true;
      return createIterResultObject(iterator.realm, undefined, true);
    }

    const value = iteratorValue(step, iterator.realm);

    if (typeof value === 'symbol') {
      continue;
    }

    if (typeof value === 'string') {
      if (iterator.visited.has(value)) {
        continue;
      }
      iterator.visited.add(value);
    }

    return createIterResultObject(iterator.realm, value, false);
  }
}
