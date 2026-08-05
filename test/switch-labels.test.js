import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript, parseScript } from '../src/api.js';

/**
 * Runs `source` and returns the completion record (type + value).
 *
 * @param {string} source
 * @returns {{ type: string, value: unknown }}
 */
function run(source) {
  return evaluateScript(createRealm(), source);
}

/**
 * Assert the completion is a normal completion with the given value.
 *
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 */
function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  // ---------------------------------------------------------------------------
  // switch — basic matching
  // ---------------------------------------------------------------------------
  {
    name: 'switch: match found in middle of case list',
    run() {
      assertNormal(
        run(`
          var x = 0;
          switch (2) {
            case 1: x = 10; break;
            case 2: x = 20; break;
            case 3: x = 30; break;
          }
          x
        `),
        20,
      );
    },
  },
  {
    name: 'switch: fallthrough to subsequent cases without break',
    run() {
      assertNormal(
        run(`
          var x = 0;
          switch (1) {
            case 1: x = x + 1;
            case 2: x = x + 2;
            case 3: x = x + 3;
          }
          x
        `),
        6,
      );
    },
  },
  {
    name: 'switch: break stops fallthrough',
    run() {
      assertNormal(
        run(`
          var x = 0;
          switch (1) {
            case 1: x = x + 1; break;
            case 2: x = x + 2;
          }
          x
        `),
        1,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // switch — no match cases
  // ---------------------------------------------------------------------------
  {
    name: 'switch: no match and no default — nothing executes',
    run() {
      assertNormal(
        run(`
          var x = 0;
          switch (99) {
            case 1: x = 1;
            case 2: x = 2;
          }
          x
        `),
        0,
      );
    },
  },
  {
    name: 'switch: no match with default in middle — default and after run',
    run() {
      assertNormal(
        run(`
          var x = 0;
          switch (99) {
            case 1: x = x + 1; break;
            default: x = x + 10;
            case 3: x = x + 100;
          }
          x
        `),
        110,
      );
    },
  },
  {
    name: 'switch: later case matches after default — only that case and after run',
    run() {
      // case 3 is after the default and matches: run from case 3 to end,
      // default is skipped
      assertNormal(
        run(`
          var x = 0;
          switch (3) {
            case 1: x = x + 1; break;
            default: x = x + 10;
            case 3: x = x + 100;
            case 4: x = x + 1000;
          }
          x
        `),
        1100,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // switch — side-effect / evaluation-order proof
  // ---------------------------------------------------------------------------
  {
    name: 'switch: case tests before match evaluated once in order, tests after not evaluated',
    run() {
      assertNormal(
        run(`
          var log = '';
          function label(n, v) { log = log + n; return v; }
          switch (2) {
            case label('A', 1): break;
            case label('B', 2): break;
            case label('C', 3): break;
          }
          log
        `),
        'AB',
      );
    },
  },
  // ---------------------------------------------------------------------------
  // switch — interaction with loops
  // ---------------------------------------------------------------------------
  {
    name: 'switch inside loop: continue propagates out to restart the loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          var i = 0;
          while (i < 3) {
            i = i + 1;
            switch (i) {
              case 2: continue;
            }
            x = x + i;
          }
          x
        `),
        4,
      );
    },
  },
  {
    name: 'switch inside loop: unlabelled break exits switch, not the loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          for (var i = 0; i < 3; i = i + 1) {
            switch (i) {
              case 1: break;
            }
            x = x + 1;
          }
          x
        `),
        3,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // nested loops — unlabelled break/continue
  // ---------------------------------------------------------------------------
  {
    name: 'nested loops: unlabelled break exits only the inner loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          for (var i = 0; i < 3; i = i + 1) {
            for (var j = 0; j < 3; j = j + 1) {
              if (j === 1) break;
              x = x + 1;
            }
          }
          x
        `),
        3,
      );
    },
  },
  {
    name: 'nested loops: unlabelled continue restarts only the inner loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          for (var i = 0; i < 2; i = i + 1) {
            for (var j = 0; j < 3; j = j + 1) {
              if (j === 1) continue;
              x = x + 1;
            }
          }
          x
        `),
        4,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // labelled break/continue on loops
  // ---------------------------------------------------------------------------
  {
    name: 'labelled break exits the outer loop from inside the inner loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          outer: for (var i = 0; i < 3; i = i + 1) {
            for (var j = 0; j < 3; j = j + 1) {
              if (j === 1) break outer;
              x = x + 1;
            }
          }
          x
        `),
        1,
      );
    },
  },
  {
    name: 'labelled continue restarts the outer loop from inside the inner loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          outer: for (var i = 0; i < 3; i = i + 1) {
            for (var j = 0; j < 3; j = j + 1) {
              if (j === 0) continue outer;
              x = x + 1;
            }
          }
          x
        `),
        0,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // labelled non-loop (block)
  // ---------------------------------------------------------------------------
  {
    name: 'label on block: break foo exits the block, subsequent statements in block do not run',
    run() {
      assertNormal(
        run(`
          var x = 0;
          foo: {
            x = 1;
            break foo;
            x = 2;
          }
          x
        `),
        1,
      );
    },
  },
  {
    name: 'label on block: statements after the labelled block still run',
    run() {
      assertNormal(
        run(`
          var x = 0;
          foo: {
            break foo;
          }
          x = 99;
          x
        `),
        99,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // two labels stacked on one loop
  // ---------------------------------------------------------------------------
  {
    name: 'two labels on one loop: break a terminates the loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          a: b: for (var i = 0; i < 10; i = i + 1) {
            x = x + 1;
            break a;
          }
          x
        `),
        1,
      );
    },
  },
  {
    name: 'two labels on one loop: break b terminates the loop',
    run() {
      assertNormal(
        run(`
          var x = 0;
          a: b: for (var i = 0; i < 10; i = i + 1) {
            x = x + 1;
            break b;
          }
          x
        `),
        1,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // return/throw propagation through switch and labelled statements
  // ---------------------------------------------------------------------------
  {
    name: 'return inside switch case propagates out through switch',
    run() {
      assertNormal(
        run(`
          function f(x) {
            switch (x) {
              case 1: return 42;
            }
            return 0;
          }
          f(1)
        `),
        42,
      );
    },
  },
  {
    name: 'throw inside switch case propagates out through switch',
    run() {
      const result = run(`
        var caught = 0;
        try {
          switch (1) {
            case 1: throw 99;
          }
        } catch (e) {
          caught = e;
        }
        caught
      `);
      assertNormal(result, 99);
    },
  },
  {
    name: 'return inside labelled non-loop still propagates out',
    run() {
      assertNormal(
        run(`
          function f() {
            foo: {
              return 7;
            }
          }
          f()
        `),
        7,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // var hoisting through try/switch/label containers
  // ---------------------------------------------------------------------------
  {
    name: 'var in try block is hoisted to enclosing scope',
    run() {
      assertNormal(
        run(`
          function f() {
            try { var x = 1; } catch (e) {}
            return x;
          }
          f()
        `),
        1,
      );
    },
  },
  {
    name: 'var in catch body is hoisted to enclosing scope',
    run() {
      assertNormal(
        run(`
          function f() {
            try { throw 1; } catch (e) { var x = 2; }
            return x;
          }
          f()
        `),
        2,
      );
    },
  },
  {
    name: 'var in finally block is hoisted to enclosing scope',
    run() {
      assertNormal(
        run(`
          function f() {
            try {} finally { var x = 3; }
            return x;
          }
          f()
        `),
        3,
      );
    },
  },
  {
    name: 'var in switch case is hoisted to enclosing scope',
    run() {
      assertNormal(
        run(`
          function f() {
            switch (1) {
              case 1: var x = 4;
            }
            return x;
          }
          f()
        `),
        4,
      );
    },
  },
  {
    name: 'var in labelled statement body is hoisted to enclosing scope',
    run() {
      assertNormal(
        run(`
          function f() {
            foo: { var x = 5; }
            return x;
          }
          f()
        `),
        5,
      );
    },
  },
  // ---------------------------------------------------------------------------
  // parser-level: invalid label usage throws SyntaxError
  // ---------------------------------------------------------------------------
  {
    name: 'parser rejects break with non-existent label',
    run() {
      assertThrows(() => parseScript('break foo;'), SyntaxError);
    },
  },
];

export default tests;
