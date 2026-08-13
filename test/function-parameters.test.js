import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);

  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }

  return completion.value;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'defaults destructuring rest and arguments length compose left to right',
    run() {
      assertSame(
        run(`
          (function (a = 1, b = a + 1, { c } = { c: b + 1 }, ...rest) {
            return [a, b, c, rest.join(','), arguments.length].join(':');
          })(undefined, undefined, undefined, 4, 5);
        `),
        '1:2:3:4,5:5',
      );
    },
  },
  {
    name: 'a default-created closure captures its parameter binding',
    run() {
      assertSame(
        run(`
          var a = 9;
          (function (
            a = function () {
              return a;
            }
          ) {
            return a() === a;
          })();
        `),
        true,
      );
    },
  },
  {
    name: 'parameter defaults cannot see body var bindings',
    run() {
      assertSame(
        run(`
          var result;
          try {
            (function (a = x) {
              var x = 1;
              return a;
            })();
          } catch (error) {
            result = error.name;
          }
          result;
        `),
        'ReferenceError',
      );
    },
  },
  {
    name: 'direct eval in a default keeps its variable environment below parameter bindings',
    run() {
      assertSame(
        run(`
          var result;
          try {
            (function (a = eval("var a = 2")) {
              return a;
            })();
          } catch (error) {
            result = error.name;
          }
          result;
        `),
        'SyntaxError',
      );
      assertSame(
        run(
          '(function (a = eval("var fromEval = 2")) { return fromEval; })();',
        ),
        2,
      );
    },
  },
  {
    name: 'later parameters stay in the temporal dead zone during earlier defaults',
    run() {
      assertSame(
        run(`
          var later = 9;
          var result;
          try {
            (function (earlier = later, later = 2) {
              return earlier;
            })();
          } catch (error) {
            result = error.name;
          }
          result;
        `),
        'ReferenceError',
      );
      assertSame(
        run('(function (a = 1, b = a + 1) { return a + ":" + b; })();'),
        '1:2',
      );
    },
  },
  {
    name: 'object and array destructuring parameters initialize nested bindings',
    run() {
      assertSame(
        run(`
          (function ({ first, nested: { value = 2 } }, [head, , ...tail]) {
            return first + ':' + value + ':' + head + ':' + tail.join(',');
          })({ first: 1, nested: {} }, [3, 4, 5, 6]);
        `),
        '1:2:3:5,6',
      );
    },
  },
  {
    name: 'rest parameters are realm-owned arrays',
    run() {
      assertSame(
        run(`
          (function (...rest) {
            return Array.isArray(rest) + ':' +
              (rest instanceof Array) + ':' +
              (Object.getPrototypeOf(rest) === Array.prototype) + ':' +
              rest.join(',');
          })(1, 2, 3);
        `),
        'true:true:true:1,2,3',
      );
    },
  },
  {
    name: 'function length stops before the first default or rest parameter',
    run() {
      assertSame(
        run(`
          function plain(a, { b }, [c]) {}
          function defaulted(a, b = 1, c) {}
          function rested(a, b, ...rest) {}
          function firstDefault({ value } = {}) {}
          [plain.length, defaulted.length, rested.length, firstDefault.length].join(',');
        `),
        '3,1,2,0',
      );
    },
  },
  {
    name: 'only sloppy simple parameter lists receive mapped arguments',
    run() {
      assertSame(
        run(`
          function simple(a) {
            a = 2;
            var fromParameter = arguments[0];
            arguments[0] = 3;
            return fromParameter + ':' + a;
          }
          function nonSimple(a = 1) {
            a = 2;
            var fromParameter = arguments[0];
            arguments[0] = 3;
            return fromParameter + ':' + a;
          }
          function strict(a) {
            "use strict";
            a = 2;
            var fromParameter = arguments[0];
            arguments[0] = 3;
            return fromParameter + ':' + a;
          }
          simple(1) + '|' + nonSimple(1) + '|' + strict(1);
        `),
        '2:3|1:2|1:2',
      );
    },
  },
  {
    name: 'parameter expressions get arguments even when the body lexically declares that name',
    run() {
      assertSame(
        run(`
          (function (a = arguments.length) {
            let arguments = 4;
            return a + ':' + arguments;
          })();
        `),
        '0:4',
      );
    },
  },
  {
    name: 'sloppy unmapped arguments omit caller and poison only callee',
    run() {
      assertSame(
        run(`
          (function (a = 1) {
            var calleeResult;
            try {
              arguments.callee;
            } catch (error) {
              calleeResult = error.name;
            }
            return ('caller' in arguments) + ':' + calleeResult;
          })();
        `),
        'false:TypeError',
      );
    },
  },
  {
    name: 'strict unmapped arguments omit caller and poison only callee',
    run() {
      assertSame(
        run(`
          (function (a) {
            "use strict";
            var calleeResult;
            try {
              arguments.callee;
            } catch (error) {
              calleeResult = error.name;
            }
            return ('caller' in arguments) + ':' + calleeResult;
          })(1);
        `),
        'false:TypeError',
      );
    },
  },
  {
    name: 'sloppy duplicate simple parameters are accepted and map only the last occurrence',
    run() {
      assertSame(
        run(`
          function duplicate(a, a) {
            a = 3;
            return arguments[0] + ':' + arguments[1];
          }
          duplicate(1, 2);
        `),
        '1:3',
      );
      assertSame(
        run(`
          function missingDuplicate(a, a) {
            arguments[0] = 5;
            return a;
          }
          missingDuplicate(1);
        `),
        undefined,
      );
    },
  },
  {
    name: 'the body var environment copies but does not merge parameter bindings',
    run() {
      assertSame(
        run(`
          (function (a = function () { return a; }) {
            var saved = a;
            var a = 2;
            return (saved() === saved) + ':' + a;
          })();
        `),
        'true:2',
      );
    },
  },
];

export default tests;
