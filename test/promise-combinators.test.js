import { createRealm, evaluateScript } from '../src/index.js';
import { EngineObject } from '../src/runtime/object.js';
import { PromiseObject } from '../src/runtime/promise.js';
import { assertSame } from './harness/assert.js';

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 * @returns {void}
 */
function assertNormalValue(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {{ type: string, value: unknown }} completion
 * @returns {void}
 */
function assertGuestTypeError(realm, completion) {
  assertSame(completion.type, 'throw');
  assertSame(
    /** @type {EngineObject} */ (completion.value).getPrototype(),
    realm.intrinsics.typeErrorPrototype,
  );
}

/**
 * @param {unknown} value
 * @returns {PromiseObject}
 */
function promiseObject(value) {
  if (!(value instanceof PromiseObject)) {
    throw new Error('Expected a PromiseObject');
  }

  return value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {PromiseObject}
 */
function evaluatePromise(realm, source) {
  return promiseObject(evaluateScript(realm, source).value);
}

export default [
  {
    name: 'Promise.all preserves iteration order and waits for all inputs',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var resolveSecond;',
            'var result = "unsettled";',
            'var all = Promise.all([',
            '  Promise.resolve(1),',
            '  new Promise(function (resolve) { resolveSecond = resolve; }),',
            '  Promise.resolve(3)',
            ']);',
            'all.then(function (values) { result = values.join(","); });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );

      assertSame(
        promiseObject(realm.globalObject.get('all')).promiseState,
        'pending',
      );
      assertNormalValue(evaluateScript(realm, 'resolveSecond(2);'), undefined);
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'result'), '1,2,3');
    },
  },
  {
    name: 'Promise.all empty fulfills while Promise.race empty stays pending',
    run: () => {
      const realm = createRealm();
      const all = evaluatePromise(realm, 'Promise.all([])');
      const race = evaluatePromise(realm, 'Promise.race([])');

      assertSame(all.promiseState, 'fulfilled');
      if (!(all.promiseResult instanceof EngineObject)) {
        throw new Error('Expected Promise.all([]) to fulfill with an array');
      }
      assertSame(all.promiseResult.get('length'), 0);
      assertSame(race.promiseState, 'pending');
    },
  },
  {
    name: 'Promise.all rejects an abrupt final capability resolve after iteration completes',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var thrown = "resolve failure";',
            'var rejects = 0;',
            'var closes = 0;',
            'function C(executor) {',
            '  return new Promise(function (_resolve, reject) {',
            '    executor(function () { throw thrown; }, function (reason) {',
            '      rejects = rejects + 1;',
            '      reject(reason);',
            '    });',
            '  });',
            '}',
            'C.resolve = Promise.resolve;',
            'var iterable = {};',
            'iterable[Symbol.iterator] = function () {',
            '  return {',
            '    next: function () { return { done: true }; },',
            '    return: function () { closes = closes + 1; return {}; }',
            '  };',
            '};',
            'var result = Promise.all.call(C, iterable);',
            'var observed;',
            'result.then(undefined, function (reason) { observed = reason; });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'closes + ":" + rejects + ":" + observed'),
        '0:1:resolve failure',
      );
    },
  },
  {
    name: 'late Promise.all resolve element propagates an abrupt capability resolve',
    run: () => {
      const realm = createRealm();

      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var thrown = "resolve element failure";',
            'var rejects = 0;',
            'var resolveElement;',
            'function C(executor) {',
            '  return new Promise(function (_resolve, reject) {',
            '    executor(function () { throw thrown; }, function (reason) {',
            '      rejects = rejects + 1;',
            '      reject(reason);',
            '    });',
            '  });',
            '}',
            'C.resolve = function () {',
            '  return { then: function (resolve) { resolveElement = resolve; } };',
            '};',
            'var result = Promise.all.call(C, [1]);',
            'var observed;',
            'result.then(undefined, function (reason) { observed = reason; });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );
      const completion = evaluateScript(realm, 'resolveElement("value");');
      assertSame(completion.type, 'throw');
      assertSame(completion.value, 'resolve element failure');

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'rejects + ":" + observed'),
        '0:undefined',
      );
      assertSame(
        promiseObject(realm.globalObject.get('result')).promiseState,
        'pending',
      );
    },
  },
  {
    name: 'Promise.all retains duplicate values and assimilates thenables',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var result;',
            'Promise.all([1, 1, {',
            '  then: function (resolve) { resolve("thenable"); }',
            '}]).then(function (values) { result = values.join(","); });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'result'), '1,1,thenable');
    },
  },
  {
    name: 'Promise.all rejects early while Promise.race keeps the first settlement',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var allResult;',
            'var raceResult;',
            'Promise.all([Promise.resolve("ignored"), Promise.reject("all failure")])',
            '  .then(function () { allResult = "fulfilled"; }, function (reason) {',
            '    allResult = reason;',
            '  });',
            'Promise.race([Promise.resolve("winner"), Promise.reject("loser")])',
            '  .then(function (value) { raceResult = value; }, function (reason) {',
            '    raceResult = reason;',
            '  });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'allResult + ":" + raceResult'),
        'all failure:winner',
      );
    },
  },
  {
    name: 'Promise combinators observe overridden resolve in source order for every value',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'class C extends Promise {}',
            'var log = [];',
            'Object.defineProperty(C, "resolve", {',
            '  get: function () {',
            '    log.push("get");',
            '    return function (value) {',
            '      log.push("call:" + value);',
            '      return Promise.resolve(value);',
            '    };',
            '  }',
            '});',
            'C.all([1, 2]).then(function (values) { log.push("all:" + values.join(",")); });',
            'C.race([3, 4]).then(function (value) { log.push("race:" + value); });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );

      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'log.join(",")'),
        'get,call:1,get,call:2,get,call:3,get,call:4,all:1,2,race:3',
      );
    },
  },
  {
    name: 'Promise combinators construct from this without consulting species',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'class C extends Promise {}',
            'Object.defineProperty(C, Symbol.species, {',
            '  get: function () { throw "species must not be read"; }',
            '});',
            'var all = C.all([]);',
            'var race = C.race([]);',
            '(all instanceof C) + ":" + (race instanceof C);',
          ].join('\n'),
        ),
        'true:true',
      );
    },
  },
  {
    name: 'Promise.all resolve element functions settle each input at most once',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'class C extends Promise {}',
            'var callbacks = [];',
            'C.resolve = function () {',
            '  return { then: function (resolve) { callbacks.push(resolve); } };',
            '};',
            'var result = "pending";',
            'C.all([1, 2]).then(function (values) { result = values.join(","); });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );
      assertNormalValue(
        evaluateScript(realm, 'callbacks[0]("first"); callbacks[0]("again");'),
        undefined,
      );
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'result'), 'pending');

      assertNormalValue(
        evaluateScript(realm, 'callbacks[1]("second");'),
        undefined,
      );
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(evaluateScript(realm, 'result'), 'first,second');
    },
  },
  {
    name: 'Promise.all closes only before done-marked iterator failures',
    run: () => {
      /** @type {Array<[string, number, string[]]>} */
      const cases = [
        [
          'next',
          0,
          [
            'var iterator = {',
            '  next: function () { throw original; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
          ],
        ],
        [
          'value',
          0,
          [
            'var step = { done: false };',
            'Object.defineProperty(step, "value", { get: function () { throw original; } });',
            'var iterator = {',
            '  next: function () { return step; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
          ],
        ],
        [
          'resolve',
          1,
          [
            'class C extends Promise {}',
            'C.resolve = function () { throw original; };',
            'var iterator = {',
            '  next: function () { return { value: 1, done: false }; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
          ],
        ],
        [
          'resolve getter',
          1,
          [
            'class C extends Promise {}',
            'Object.defineProperty(C, "resolve", {',
            '  get: function () { throw original; }',
            '});',
            'var iterator = {',
            '  next: function () { return { value: 1, done: false }; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
          ],
        ],
        [
          'then',
          1,
          [
            'class C extends Promise {}',
            'C.resolve = function () {',
            '  var result = {};',
            '  Object.defineProperty(result, "then", {',
            '    get: function () { throw original; }',
            '  });',
            '  return result;',
            '};',
            'var iterator = {',
            '  next: function () { return { value: 1, done: false }; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
          ],
        ],
        [
          'then call',
          1,
          [
            'class C extends Promise {}',
            'C.resolve = function () {',
            '  return { then: function () { throw original; } };',
            '};',
            'var iterator = {',
            '  next: function () { return { value: 1, done: false }; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
          ],
        ],
      ];

      for (const [stage, expectedCloseCount, setup] of cases) {
        const realm = createRealm();
        const constructor =
          stage === 'next' || stage === 'value' ? 'Promise' : 'C';
        assertNormalValue(
          evaluateScript(
            realm,
            [
              'var original = "original";',
              'var closed = 0;',
              ...setup,
              'var iterable = {};',
              'iterable[Symbol.iterator] = function () { return iterator; };',
              `var result = ${constructor}.all(iterable);`,
              'var observed;',
              'result.then(null, function (reason) { observed = reason; });',
              'undefined;',
            ].join('\n'),
          ),
          undefined,
        );
        assertSame(realm.agent.runJobs().failures.length, 0);
        assertNormalValue(
          evaluateScript(realm, 'closed + ":" + observed'),
          `${expectedCloseCount}:original`,
        );
      }
    },
  },
  {
    name: 'Promise.race does not close after IteratorStep marks the iterator done',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var original = "original";',
            'var closed = 0;',
            'var iterator = {',
            '  next: function () { throw original; },',
            '  return: function () { closed = closed + 1; throw "close"; }',
            '};',
            'var iterable = {};',
            'iterable[Symbol.iterator] = function () { return iterator; };',
            'var result = Promise.race(iterable);',
            'var observed;',
            'result.then(null, function (reason) { observed = reason; });',
            'undefined;',
          ].join('\n'),
        ),
        undefined,
      );
      assertSame(realm.agent.runJobs().failures.length, 0);
      assertNormalValue(
        evaluateScript(realm, 'closed + ":" + observed'),
        '0:original',
      );
    },
  },
  {
    name: 'Promise.all propagates an abrupt capability reject without retrying it',
    run: () => {
      const realm = createRealm();
      assertNormalValue(
        evaluateScript(
          realm,
          [
            'var calls = 0;',
            'var closed = 0;',
            'function C(executor) {',
            '  executor(function () {}, function () {',
            '    calls = calls + 1;',
            '    throw "reject failure";',
            '  });',
            '}',
            'C.resolve = function (value) { return Promise.resolve(value); };',
            'var iterator = {',
            '  next: function () { throw "source failure"; },',
            '  return: function () { closed = closed + 1; return {}; }',
            '};',
            'var iterable = {};',
            'iterable[Symbol.iterator] = function () { return iterator; };',
            'var thrown;',
            'try { Promise.all.call(C, iterable); } catch (error) { thrown = error; }',
            'closed + ":" + calls + ":" + thrown;',
          ].join('\n'),
        ),
        '0:1:reject failure',
      );
    },
  },
  {
    name: 'Promise combinators reject iterator and resolve protocol errors as guest TypeErrors',
    run: () => {
      const realm = createRealm();
      const noIterator = evaluatePromise(
        realm,
        'Promise.all({ [Symbol.iterator]: function () { return 1; } })',
      );
      const badStep = evaluatePromise(
        realm,
        [
          'var malformed = {',
          '  next: function () { return 1; },',
          '  return: function () { return {}; }',
          '};',
          'Promise.race({ [Symbol.iterator]: function () { return malformed; } });',
        ].join('\n'),
      );
      const nonCallableResolve = evaluatePromise(
        realm,
        [
          'class C extends Promise {}',
          'C.resolve = 1;',
          'var iterator = {',
          '  next: function () { return { value: 1, done: false }; },',
          '  return: function () { return {}; }',
          '};',
          'C.all({ [Symbol.iterator]: function () { return iterator; } });',
        ].join('\n'),
      );

      for (const promise of [noIterator, badStep, nonCallableResolve]) {
        assertSame(promise.promiseState, 'rejected');
        assertSame(
          /** @type {EngineObject} */ (promise.promiseResult).getPrototype(),
          realm.intrinsics.typeErrorPrototype,
        );
      }
      assertGuestTypeError(
        realm,
        evaluateScript(realm, 'Promise.all.call({}, [])'),
      );
    },
  },
];
