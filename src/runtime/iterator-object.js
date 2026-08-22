import { EngineObject } from './object.js';
import { GuestErrorSignal } from './completion.js';
import {
  createIterResultObject,
  getEnumerateIteratorRecord,
  iteratorClose,
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
 * its consumer-facing operations are own public `next` and `return` methods.
 * Both return ordinary IteratorResult objects; `return` also closes an
 * unfinished delegated prototype iterator before releasing retained state.
 */
export class ForInIterator extends EngineObject {
  /**
   * @param {import('./realm.js').Realm} realm
   * @param {EngineObject} target
   */
  constructor(realm, target) {
    const iteratorPrototype = realm.intrinsics.iteratorPrototype;

    if (!(iteratorPrototype instanceof EngineObject)) {
      throw new TypeError(
        'Realm is missing required %IteratorPrototype% intrinsic',
      );
    }

    super(iteratorPrototype, 'Object', realm.agent);

    /** @type {import('./realm.js').Realm} */
    this.realm = realm;
    /** @type {EngineObject | null} */
    this.target = target;
    /** @type {string[]} */
    this.candidates = [];
    /** @type {number} */
    this.candidateIndex = 0;
    /** @type {Set<string>} */
    this.visited = new Set();
    /** @type {import('./iterator.js').IteratorRecord | null} */
    this.remainder = null;
    /** @type {EngineObject | null} */
    this.remainderBoundary = null;
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
    this.defineOwnProperty('return', {
      value: realm.createNativeFunction({
        name: 'return',
        length: 0,
        call(thisValue) {
          if (thisValue !== iterator) {
            throw new GuestErrorSignal(
              'TypeError',
              'For-in iterator return called on an incompatible receiver',
            );
          }
          return iterator.close();
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

      const descriptor = findLiveForInDescriptor(
        /** @type {EngineObject} */ (this.target),
        key,
        this.remainderBoundary,
      );

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

  /**
   * @returns {EngineObject}
   */
  close() {
    if (this.exhausted) {
      return createIterResultObject(this.realm, undefined, true);
    }
    const record = this.remainder;
    const shouldClose = record !== null && !record.done;

    if (record !== null) {
      record.done = true;
    }
    finishForInIterator(this);

    if (shouldClose) {
      iteratorClose(
        this.realm,
        /** @type {import('./iterator.js').IteratorRecord} */ (record),
        false,
      );
    }

    return createIterResultObject(this.realm, undefined, true);
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
      iterator.remainderBoundary = current;
      iterator.remainder = getEnumerateIteratorRecord(iterator.realm, current);
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
 * @param {EngineObject | null} remainderBoundary
 * @returns {import('./descriptors.js').CompletePropertyDescriptor | undefined}
 */
function findLiveForInDescriptor(target, key, remainderBoundary) {
  /** @type {EngineObject | null} */
  let current = target;

  while (current !== null) {
    if (current === remainderBoundary) {
      return undefined;
    }

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
    finishForInIterator(iterator);
    return createIterResultObject(iterator.realm, undefined, true);
  }

  for (;;) {
    const step = iteratorStep(record);

    if (step === false) {
      record.done = true;
      finishForInIterator(iterator);
      return createIterResultObject(iterator.realm, undefined, true);
    }

    const value = iteratorValue(step, iterator.realm);

    if (typeof value === 'string') {
      if (iterator.visited.has(value)) {
        continue;
      }
      iterator.visited.add(value);
    }

    return createIterResultObject(iterator.realm, value, false);
  }
}

/**
 * @param {ForInIterator} iterator
 * @returns {void}
 */
function finishForInIterator(iterator) {
  iterator.exhausted = true;
  iterator.target = null;
  iterator.candidates = [];
  iterator.candidateIndex = 0;
  iterator.visited.clear();
  iterator.remainder = null;
  iterator.remainderBoundary = null;
}
