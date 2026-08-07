/**
 * Contracts for the engine's recursion boundary.
 *
 * Guest recursion runs on the host stack, so without a boundary of its own the
 * engine inherits whatever the host does when that stack runs out — an
 * uncatchable host `RangeError` escaping `evaluateScript`, at a depth that
 * differs between Node, Chromium, and `jsc`. These tests pin the replacement:
 * a deterministic budget of engine stack frames that raises a realm-local
 * guest `RangeError` guest code can catch, identically on every host.
 *
 * The unit is an engine frame rather than a guest call, so these tests avoid
 * asserting *which* depth a given program reaches — that is an implementation
 * detail of how many nodes the evaluator walks. What they pin is that the
 * budget is deterministic, that it grows with the configured limit, and that
 * it contains every shape of runaway recursion the engine can be driven into.
 *
 * Most cases set a small `maxStackDepth` so the contract under test is the
 * *boundary*, not the host's stack size, and so the suite stays fast. The
 * cases that deliberately exercise the default limit say so.
 */

import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * @param {string} source
 * @param {import('../src/runtime/realm.js').RealmOptions} [options]
 * @returns {unknown}
 */
function run(source, options) {
  const realm = createRealm(options);
  return evaluateScript(realm, source).value;
}

/** A budget small enough to overflow instantly, large enough for real work. */
const SMALL = { maxStackDepth: 400 };

const tests = [
  {
    name: 'unbounded direct recursion is a catchable guest RangeError',
    run() {
      assertSame(
        run(
          'try { (function f() { return f(); })(); "not thrown" }' +
            ' catch (e) { e.name + "|" + (e instanceof RangeError) + "|" + e.message }',
          SMALL,
        ),
        'RangeError|true|Maximum call stack size exceeded',
      );
    },
  },
  {
    name: 'an uncaught recursion overflow leaves the engine as a throw completion',
    run() {
      const realm = createRealm(SMALL);
      const completion = evaluateScript(
        realm,
        '(function f() { return f(); })()',
      );

      assertSame(completion.type, 'throw');
      assertSame(completion.value instanceof EngineObject, true);
      assertSame(
        /** @type {EngineObject} */ (completion.value).get('name'),
        'RangeError',
      );
    },
  },
  {
    name: 'the overflow error is realm-local, not a host error object',
    run() {
      const realm = createRealm(SMALL);
      const completion = evaluateScript(
        realm,
        '(function f() { return f(); })()',
      );
      const error = /** @type {EngineObject} */ (completion.value);

      assertSame(
        error.getPrototype(),
        realm.intrinsics.rangeErrorPrototype,
        'the error must inherit from this realm\u2019s %RangeError.prototype%',
      );
      assertSame(
        run(
          'try { (function f() { return f(); })() }' +
            ' catch (e) { e.constructor === RangeError' +
            ' && Object.getPrototypeOf(e) === RangeError.prototype }',
          SMALL,
        ),
        true,
      );
    },
  },
  {
    name: 'recursion through a constructor call is catchable',
    run() {
      assertSame(
        run(
          'function F() { new F(); }' +
            ' try { new F(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'mutual recursion is catchable',
    run() {
      assertSame(
        run(
          'function a() { return b(); } function b() { return a(); }' +
            ' try { a(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through direct eval is catchable',
    run() {
      assertSame(
        run(
          'function f() { return eval("f()"); }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through a nested eval chain is catchable',
    run() {
      assertSame(
        run(
          'function f(depth) { return eval("f(depth + 1)"); }' +
            ' try { f(0); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through a dynamic Function is catchable',
    run() {
      assertSame(
        run(
          'var g = Function("return g();");' +
            ' try { g(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion driven through a built-in callback is catchable',
    run() {
      assertSame(
        run(
          'function f() { return [1].map(f)[0]; }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through an accessor is catchable',
    run() {
      assertSame(
        run(
          'var o = {};' +
            ' Object.defineProperty(o, "x", { get: function () { return o.x; } });' +
            ' try { o.x; "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through a valueOf coercion is catchable',
    run() {
      assertSame(
        run(
          'var o = { valueOf: function () { return o + 1; } };' +
            ' try { o + 1; "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'an inner catch handles the overflow and its frame keeps running',
    run() {
      assertSame(
        run(
          'function deep() { return deep(); }' +
            ' function label() { return "recovered"; }' +
            ' function f() { try { deep(); } catch (e) { return e.name + ":" + label(); } }' +
            ' try { f() } catch (e) { "escaped:" + e.name }',
          SMALL,
        ),
        'RangeError:recovered',
      );
    },
  },
  {
    name: 'finally blocks run while the overflow unwinds',
    run() {
      // Every activation that entered its `try` must run its `finally` exactly
      // once on the way out: the overflow is an ordinary guest throw, not a
      // shortcut past pending cleanup.
      assertSame(
        run(
          'var entered = 0; var unwound = 0;' +
            ' function f() { try { entered = entered + 1; f(); }' +
            '   finally { unwound = unwound + 1; } }' +
            ' try { f(); } catch (e) {}' +
            ' entered === unwound && entered > 10',
          SMALL,
        ),
        true,
      );
    },
  },
  {
    name: 'depth accounting is restored after an overflow is caught',
    run() {
      assertSame(
        run(
          'function deep() { return deep(); }' +
            ' function countdown(i) { return i > 0 ? countdown(i - 1) : "done"; }' +
            ' try { deep(); } catch (e) {}' +
            ' try { deep(); } catch (e) {}' +
            ' countdown(30)',
          SMALL,
        ),
        'done',
      );
    },
  },
  {
    name: 'depth accounting is restored across evaluateScript calls in one realm',
    run() {
      const realm = createRealm(SMALL);

      assertSame(
        evaluateScript(realm, '(function f() { return f(); })()').type,
        'throw',
      );
      assertSame(
        evaluateScript(
          realm,
          'function countdown(i) { return i > 0 ? countdown(i - 1) : "done"; } countdown(30)',
        ).value,
        'done',
      );
    },
  },
  {
    name: 'the reachable depth is deterministic for a given limit',
    run() {
      // The same program under the same budget must always stop at the same
      // depth, whatever host it runs on. That determinism is the whole point
      // of owning the boundary rather than inheriting the host's stack.
      const source =
        'var depth = 0; function f() { depth = depth + 1; return f(); }' +
        ' try { f(); } catch (e) {} depth';

      const first = /** @type {number} */ (run(source, { maxStackDepth: 300 }));
      const second = run(source, { maxStackDepth: 300 });

      assertSame(typeof first, 'number');
      assertSame(first > 0, true, 'the budget must admit some recursion');
      assertSame(second, first);
    },
  },
  {
    name: 'a larger limit admits a strictly deeper recursion',
    run() {
      const source =
        'var depth = 0; function f() { depth = depth + 1; return f(); }' +
        ' try { f(); } catch (e) {} depth';

      const small = /** @type {number} */ (run(source, { maxStackDepth: 300 }));
      const large = /** @type {number} */ (run(source, { maxStackDepth: 900 }));

      assertSame(
        large > small,
        true,
        `expected a deeper recursion under a larger budget, got ${small} then ${large}`,
      );
    },
  },
  {
    name: 'the budget is per realm, so one realm\u2019s overflow does not shrink another\u2019s',
    run() {
      const source =
        'var depth = 0; function f() { depth = depth + 1; return f(); }' +
        ' try { f(); } catch (e) {} depth';

      const reference = /** @type {number} */ (
        evaluateScript(createRealm(SMALL), source).value
      );

      const exhausted = createRealm(SMALL);
      assertSame(
        evaluateScript(exhausted, '(function f() { return f(); })()').type,
        'throw',
      );

      const neighbour = createRealm(SMALL);
      assertSame(
        /** @type {number} */ (evaluateScript(neighbour, source).value),
        reference,
        'a neighbouring realm must still get its whole budget',
      );
    },
  },
  {
    name: 'the default limit admits recursion depths ordinary programs use',
    run() {
      assertSame(
        run(
          'function countdown(i) { return i > 0 ? countdown(i - 1) : "done"; }' +
            ' countdown(100)',
        ),
        'done',
      );
    },
  },
  {
    name: 'the default limit contains recursion on every host without a host overflow',
    run() {
      // No `maxStackDepth`: this is the contract that the shipped default is
      // below what Node, Chromium, and `jsc` can survive, for the recursion
      // shapes that spend host frames most generously per activation. Each of
      // these escapes as an uncatchable host `RangeError` if the default is
      // ever raised past a host's real budget.
      const shapes = [
        'function f() { return [1].map(function (x) { return f(x); })[0]; }',
        'function f() { var o = { valueOf: function () { return f(); } }; return o + 1; }',
        'function f() { return eval("f()"); }',
        'function f() { try { return f(); } finally { } }',
        'function f() { return [2, 1].sort(function () { return f(); })[0]; }',
      ];

      for (const shape of shapes) {
        assertSame(
          run(`${shape} try { f(); "not thrown" } catch (e) { e.name }`),
          'RangeError',
          shape,
        );
      }
    },
  },
  {
    name: 'recursion through nested data is contained, not left to the host stack',
    run() {
      // `String(a)` on a self-nesting array recurses through
      // Array.prototype.toString/join, one built-in activation per level. It
      // is the shape that spends the most host stack per unit of budget, so it
      // is what sets the default; on the raw host stack it overflowed
      // uncatchably.
      assertSame(
        run(
          'var a = []; var c = a;' +
            ' for (var i = 0; i < 1000; i++) { var x = []; c[0] = x; c = x; }' +
            ' try { String(a); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'a recursive body of nested expressions is contained on every host',
    run() {
      // A call costs more host stack the deeper it sits in an expression,
      // because the evaluator walks the expression tree recursively. These
      // shapes each escaped as an uncatchable host `RangeError` under a budget
      // that counted only activations.
      let nested = 'f(n - 1)';

      for (let level = 20; level >= 1; level -= 1) {
        nested = `(${level} + ${nested})`;
      }

      assertSame(
        run(
          `function f(n) { return n === 0 ? 0 : ${nested}; }` +
            ' try { f(100000); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'call nested twenty levels deep in an expression',
      );
      assertSame(
        run(
          'function f() { return !!!!!!!!!!f(); }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'call under a chain of unary operators',
      );
      assertSame(
        run(
          'function f() { return [[[[[f()]]]]][0][0][0][0][0]; }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'call inside nested array literals',
      );
    },
  },
  {
    name: 'deeply nested statements around a recursive call are contained',
    run() {
      const open = '{ if (true) '.repeat(20);
      const close = '}'.repeat(20);

      assertSame(
        run(
          `function f() ${open} return f(); ${close}` +
            ' try { f(); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'nesting alone charges the budget, with no expression in sight',
    run() {
      // `{ if (true) ` also evaluates a test expression each time round, so it
      // cannot tell the statement guard apart from the expression one. Bare
      // blocks evaluate nothing at all: if only expressions were counted, the
      // wrapped body would reach exactly the same depth as the plain one.
      const depth = (/** @type {string} */ body) =>
        /** @type {number} */ (
          run(
            'var depth = 0;' +
              ` function f() { depth = depth + 1; ${body} }` +
              ' try { f(); } catch (e) {} depth',
            SMALL,
          )
        );

      const plain = depth('return f();');
      const wrapped = depth(`${'{'.repeat(20)} return f(); ${'}'.repeat(20)}`);

      assertSame(
        wrapped < plain,
        true,
        `expected bare blocks to cost budget, got ${plain} plain then ${wrapped} wrapped`,
      );
    },
  },
  {
    name: 'JSON.stringify on deeply nested runtime data is contained',
    run() {
      assertSame(
        run(
          'var a = []; var c = a;' +
            ' for (var i = 0; i < 20000; i++) { var x = []; c[0] = x; c = x; }' +
            ' try { JSON.stringify(a); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'JSON.parse on deeply nested runtime text is contained',
    run() {
      assertSame(
        run(
          'var s = ""; for (var i = 0; i < 20000; i++) { s += "["; }' +
            ' s += "1"; for (var j = 0; j < 20000; j++) { s += "]"; }' +
            ' try { JSON.parse(s); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'a prototype chain built at runtime is walked without host recursion',
    run() {
      // Property lookup follows the prototype chain, and guest code can make
      // that chain as long as it likes at runtime. Walking it recursively put
      // a host frame on the stack per link, so a long enough chain reached a
      // host overflow through an ordinary property read. The walk is iterative
      // instead: chain length is not recursion and does not spend the budget.
      assertSame(
        run(
          'var o = {}; for (var i = 0; i < 50000; i++) { o = Object.create(o); }' +
            ' o.missing === undefined && ("missing" in o) === false',
        ),
        true,
      );
    },
  },
  {
    name: 'a bound-function chain built at runtime is unwrapped without host recursion',
    run() {
      // `instanceof` on a bound function delegates to its target's
      // [[HasInstance]] (ES5.1 15.3.4.5.3), and guest code can bind a function
      // to itself as many times as it likes at runtime. Delegating recursively
      // spent a host frame per link; the chain is unwrapped iteratively.
      assertSame(
        run(
          'function F() {} var g = F;' +
            ' for (var i = 0; i < 20000; i++) { g = g.bind(null); }' +
            ' var instance = new F(); instance instanceof g',
        ),
        true,
      );
    },
  },
  {
    name: 'deeply nested source reached through eval is contained as a guest error',
    run() {
      // Source nesting is the one recursion the guard cannot count, because it
      // is spent before evaluation begins — in the parser, and in the
      // declaration-instantiation walk. Guest code can only reach those
      // through `eval` and `Function`, which already run inside the budget, so
      // what a guest sees is a catchable error either way. Which error it is
      // depends on how much host stack the host has left, so this pins the
      // containment rather than the name.
      const source =
        'var s = "var x = 1;";' +
        ' for (var i = 0; i < 4000; i++) { s = "{" + s + "}"; }' +
        ' try { eval(s); "not thrown" } catch (e) { e instanceof Error }';

      assertSame(run(source), true, 'eval');
      assertSame(
        run(source.replace('eval(s)', 'Function(s)()')),
        true,
        'Function',
      );
    },
  },
  {
    name: 'a deeply nested RegExp pattern is contained, not left to the host stack',
    run() {
      // The pattern validator is recursive descent over the *pattern string*,
      // which is guest data: nesting it deeply spent host frames with nothing
      // counting them, and escaped as an uncatchable host RangeError from
      // every entry point into the parser.
      const build =
        'var p = new Array(20001).join("(") + "a" + new Array(20001).join(")");';

      assertSame(
        run(
          `${build} try { new RegExp(p); "not thrown" } catch (e) { e.name }`,
        ),
        'RangeError',
        'new RegExp',
      );
      assertSame(
        run(`${build} try { RegExp(p); "not thrown" } catch (e) { e.name }`),
        'RangeError',
        'RegExp as a function',
      );
      assertSame(
        run(
          `${build} try { "a".replace(new RegExp(p), "x"); "not thrown" }` +
            ' catch (e) { e.name }',
        ),
        'RangeError',
        'String.prototype.replace',
      );
      assertSame(
        run(
          'var p = new Array(20001).join("(?:") + "a" + new Array(20001).join(")");' +
            ' try { new RegExp(p); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'non-capturing groups',
      );
    },
  },
  {
    name: 'a deeply nested regular expression *literal* is contained too',
    run() {
      // A literal's pattern never reaches our validator: Acorn checks it while
      // tokenizing. Acorn converts its own parse recursion into a SyntaxError,
      // but the very first token is read by `nextToken()` *outside* that
      // conversion, so a leading regex literal escaped as a host RangeError.
      const build =
        'var p = new Array(20001).join("(") + "a" + new Array(20001).join(")");';

      assertSame(
        run(
          `${build} try { eval("/" + p + "/"); "not thrown" } catch (e) { e.name }`,
        ),
        'SyntaxError',
        'eval of a leading regex literal',
      );
      assertSame(
        run(
          `${build} try { Function("return /" + p + "/"); "not thrown" }` +
            ' catch (e) { e.name }',
        ),
        'SyntaxError',
        'dynamic Function whose body holds one',
      );

      // The same source given straight to the embedder is a parse failure, and
      // parse failures leave `evaluateScript` as host errors by design. It must
      // still be the *syntax* error, not a stack overflow leaking through.
      const pattern = `${'('.repeat(20000)}a${')'.repeat(20000)}`;
      let hostError;
      try {
        evaluateScript(createRealm(), `/${pattern}/`);
      } catch (error) {
        hostError = error;
      }
      assertSame(
        hostError instanceof SyntaxError,
        true,
        'a top-level script reports a syntax error, not a host RangeError',
      );
    },
  },
  {
    name: 'a host defect inside a native body still escapes as a host error',
    run() {
      const realm = createRealm(SMALL);
      const boom = realm.createNativeFunction({
        name: 'boom',
        length: 0,
        call() {
          throw new TypeError('engine defect');
        },
      });
      realm.globalObject.defineOwnProperty('boom', {
        value: boom,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const error = assertThrows(
        () => evaluateScript(realm, 'try { boom(); } catch (e) { e.name }'),
        TypeError,
      );

      assertSame(error.message, 'engine defect');
    },
  },
  {
    name: 'a host RangeError that is not a recursion overflow is not relabeled',
    run() {
      const realm = createRealm(SMALL);
      const boom = realm.createNativeFunction({
        name: 'boom',
        length: 0,
        call() {
          throw new RangeError('engine defect');
        },
      });
      realm.globalObject.defineOwnProperty('boom', {
        value: boom,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const error = assertThrows(
        () => evaluateScript(realm, 'try { boom(); } catch (e) { e.name }'),
        RangeError,
      );

      assertSame(error.message, 'engine defect');
    },
  },
  {
    name: 'guest RangeErrors raised by built-ins are unaffected',
    run() {
      assertSame(
        run('try { (1).toFixed(21) } catch (e) { e.name + ":" + e.message }'),
        'RangeError:toFixed() digits must be between 0 and 20',
      );
    },
  },
];

export default tests;
