import { assertSame } from './harness/assert.js';
import { createAgent } from '../src/runtime/agent.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @param {import('../src/runtime/realm.js').Realm} [realm]
 * @returns {unknown}
 */
function value(source, realm = createRealm()) {
  const completion = evaluateScript(realm, source);

  if (completion.type !== 'normal') {
    throw new Error(`Expected normal completion, got ${completion.type}`);
  }

  return completion.value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @param {unknown} nextValue
 * @returns {void}
 */
function defineGlobal(realm, name, nextValue) {
  realm.globalObject.defineOwnProperty(name, {
    value: nextValue,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'synchronous catch initializes nested array and object binding patterns',
    run() {
      assertSame(
        value(`
          var result;
          try { throw [1, { value: 2 }, 3, 4]; }
          catch ([head, { value }, ...tail]) {
            result = head + ':' + value + ':' + tail.join(',');
          }
          result;
        `),
        '1:2:3,4',
      );
    },
  },
  {
    name: 'catch defaults infer anonymous function, class, and generator names',
    run() {
      assertSame(
        value(`
          var result;
          try { throw []; }
          catch ([
            fn = function () {},
            cls = class {},
            gen = function* () {}
          ]) {
            result = fn.name + ':' + cls.name + ':' + gen.name;
          }
          result;
        `),
        'fn:cls:gen',
      );
    },
  },
  {
    name: 'catch binding creates all bound names before evaluating defaults',
    run() {
      assertSame(
        value(`
          var outcome;
          try {
            try { throw []; }
            catch ([first = typeof second, second = 2]) {
              outcome = 'body';
            }
          } catch (error) {
            outcome = error.name;
          }
          outcome;
        `),
        'ReferenceError',
      );
    },
  },
  {
    name: 'each catch execution creates a fresh parameter environment',
    run() {
      assertSame(
        value(`
          var closures = [];
          for (var i = 0; i < 2; i += 1) {
            try { throw [i]; }
            catch ([captured]) {
              closures.push(function () { return captured; });
            }
          }
          closures[0]() + ':' + closures[1]();
        `),
        '0:1',
      );
    },
  },
  {
    name: 'direct eval keeps the enclosing variable environment outside a destructuring catch parameter',
    run() {
      assertSame(
        value(`
          function probe() {
            var read;
            try { throw [42]; }
            catch ([caught]) {
              eval('var hoisted = 7;');
              read = function () { return caught + ':' + hoisted; };
            }
            return read();
          }
          probe();
        `),
        '42:7',
      );
    },
  },
  {
    name: 'Annex B.3.5 hoists direct eval var declarations over destructuring catch parameters',
    run() {
      assertSame(
        value(`
          var log = [];
          function probe() {
            try { throw [8]; }
            catch ([x]) {
              log.push(x);
              eval('var x = 42;');
              log.push(x);
            }
          }
          probe();
          log.join(',');
        `),
        '8,42',
      );
    },
  },
  {
    name: 'catch array binding closes a non-exhausted iterator',
    run() {
      assertSame(
        value(`
          var closed = 0;
          var iterable = {};
          iterable[Symbol.iterator] = function () {
            return {
              next: function () { return { value: 9, done: false }; },
              return: function () { closed += 1; return {}; }
            };
          };
          var caught;
          try { throw iterable; }
          catch ([entry]) { caught = entry; }
          caught + ':' + closed;
        `),
        '9:1',
      );
    },
  },
  {
    name: 'catch binding initialization abrupt completions bypass the catch body and reach an outer catch',
    run() {
      assertSame(
        value(`
          var bodyRan = false;
          var name;
          try {
            try { throw []; }
            catch ([entry = missingName]) { bodyRan = true; }
          } catch (error) {
            name = error.name;
          }
          name + ':' + bodyRan;
        `),
        'ReferenceError:false',
      );
    },
  },
  {
    name: 'object catch binding forwards getter abrupt completion',
    run() {
      assertSame(
        value(`
          var source = {};
          Object.defineProperty(source, 'value', {
            get: function () { throw 'getter'; }
          });
          var caught;
          try {
            try { throw source; }
            catch ({ value }) {}
          } catch (error) {
            caught = error;
          }
          caught;
        `),
        'getter',
      );
    },
  },
  {
    name: 'catch destructuring consumes a same-Agent cross-Realm thrown array',
    run() {
      const agent = createAgent();
      const consumer = createRealm({ agent });
      const producer = createRealm({ agent });
      evaluateScript(producer, 'var payload = [17];');
      defineGlobal(consumer, 'payload', producer.globalObject.get('payload'));

      const completion = evaluateScript(
        consumer,
        'var result; try { throw payload; } catch ([entry]) { result = entry; } result;',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 17);
    },
  },
  {
    name: 'catch binding errors belong to the evaluating Realm',
    run() {
      assertSame(
        value(`
          try {
            try { throw null; }
            catch ({ value }) {}
          } catch (error) {
            error instanceof TypeError;
          }
        `),
        true,
      );
    },
  },
  {
    name: 'synchronous and generator catch binding patterns produce the same values',
    run() {
      assertSame(
        value(`
          function syncProbe() {
            try { throw [1, { value: 2 }, 3, 4]; }
            catch ([head, { value }, ...tail]) {
              return head + ':' + value + ':' + tail.join(',');
            }
          }
          function* generatorProbe() {
            try { throw [1, { value: 2 }, 3, 4]; }
            catch ([head, { value }, ...tail]) {
              return head + ':' + value + ':' + tail.join(',');
            }
          }
          syncProbe() + '|' + generatorProbe().next().value;
        `),
        '1:2:3,4|1:2:3,4',
      );
    },
  },
  {
    name: 'synchronous and generator catch binding initialization report the same Realm-owned abrupt completion',
    run() {
      assertSame(
        value(`
          function syncProbe() {
            try {
              try { throw null; }
              catch ({ value }) {}
            } catch (error) {
              return error instanceof TypeError;
            }
          }
          function* generatorProbe() {
            try {
              try { throw null; }
              catch ({ value }) {}
            } catch (error) {
              return error instanceof TypeError;
            }
          }
          syncProbe() + ':' + generatorProbe().next().value;
        `),
        'true:true',
      );
    },
  },
];

export default tests;
