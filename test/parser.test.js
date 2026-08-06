import { assertSame, assertThrows } from './harness/assert.js';
import { parseScript } from '../src/parser.js';

const tests = [
  {
    name: 'parseScript returns a script program',
    run() {
      const program = parseScript(
        'var answer = 42; function add(a, b) { return a + b; }',
      );

      assertSame(program.type, 'Program');
      assertSame(program.sourceType, 'script');
      assertSame(program.body.length, 2);
      assertSame(program.body[0].type, 'VariableDeclaration');
      assertSame(program.body[0].kind, 'var');
      assertSame(program.body[1].type, 'FunctionDeclaration');
      assertSame(program.body[1].id.name, 'add');
    },
  },
  {
    name: 'parseScript normalizes syntax errors',
    run() {
      const error = /** @type {any} */ (
        assertThrows(() => parseScript('var = 1;'), SyntaxError)
      );

      assertSame(error.name, 'SyntaxError');
      if (!error.message.includes('Unexpected token')) {
        throw new Error(
          `Expected a normalized parse message, got ${error.message}`,
        );
      }
      assertSame(error.lineNumber, 1);
      assertSame(error.columnNumber, 5);
      assertSame(error.pos, 4);
      assertSame(error.index, 4);
      assertSame(error.loc.line, 1);
      assertSame(error.loc.column, 4);
    },
  },
  {
    name: 'parseScript validates parser output',
    run() {
      const error = /** @type {any} */ (
        assertThrows(
          () =>
            parseScript('var answer = 42;', {
              parse() {
                return {
                  type: 'ExpressionStatement',
                  sourceType: 'module',
                  body: null,
                };
              },
            }),
          TypeError,
        )
      );

      assertSame(
        error.message,
        'Expected parser to return a script Program node',
      );
    },
  },
  {
    name: 'parseScript rethrows non-syntax parser failures unchanged',
    run() {
      const error = /** @type {any} */ (
        assertThrows(
          () =>
            parseScript('var answer = 42;', {
              parse() {
                throw new TypeError('boom');
              },
            }),
          TypeError,
        )
      );

      assertSame(error.message, 'boom');
    },
  },
  {
    name: 'parseScript preserves object-style syntax failure messages',
    run() {
      const error = /** @type {any} */ (
        assertThrows(
          () =>
            parseScript('var answer = 42;', {
              parse() {
                throw {
                  message: 'bad syntax',
                  pos: 0,
                  loc: { line: 1, column: 0 },
                };
              },
            }),
          SyntaxError,
        )
      );

      assertSame(error.message, 'bad syntax');
      assertSame(error.lineNumber, 1);
      assertSame(error.columnNumber, 1);
    },
  },

  // ---------------------------------------------------------------------------
  // A `FunctionDeclaration` is a `SourceElement`, not a `Statement`
  // (ES5.1 §12, §14), so it cannot be the single-statement body of an
  // iteration statement (§12.6) or a `with` statement (§12.10). Acorn parses
  // it there anyway; the early-error pass must reject it at parse time,
  // matching JavaScriptCore and the upstream `decl-fun.js` /
  // `labelled-fn-stmt.js` tests (`phase: parse`).
  // ---------------------------------------------------------------------------
  {
    name: 'a function declaration is rejected as the body of each loop or with statement',
    run() {
      const rejected = [
        'with (this) function f() {}',
        'while (false) function f() {}',
        'do function f() {} while (false);',
        'for (;;) function f() {}',
        'for (var k in this) function f() {}',
      ];

      for (const source of rejected) {
        const error = /** @type {any} */ (
          assertThrows(() => parseScript(source), SyntaxError)
        );

        assertSame(error.name, 'SyntaxError');
      }
    },
  },
  {
    name: 'a labelled-function chain is rejected in those same body positions',
    run() {
      // A label chain does not turn a `SourceElement` into a `Statement`, so
      // `with (o) a: b: function f() {}` is rejected just like the bare form.
      const rejected = [
        'with (this) a: b: function f() {}',
        'while (false) label: function f() {}',
        'do label: function f() {} while (false);',
        'for (;;) label: function f() {}',
        'for (var k in this) label: function f() {}',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
    },
  },
  {
    name: 'for (;;) function f() {} is a parse-time SyntaxError rather than an infinite loop',
    run() {
      // The evaluator would otherwise spin forever on the bodiless infinite
      // `for`; rejecting at parse time makes it a plain SyntaxError.
      const error = /** @type {any} */ (
        assertThrows(() => parseScript('for (;;) function f() {}'), SyntaxError)
      );

      assertSame(error.name, 'SyntaxError');
    },
  },
  {
    name: 'the statement-position rejection also applies to strict scripts',
    run() {
      assertThrows(
        () => parseScript('"use strict"; while (false) function f() {}'),
        SyntaxError,
      );
    },
  },
  {
    name: 'Annex B function-declaration positions stay accepted',
    run() {
      // ES5.1 Annex B / web reality keeps these accepted (JavaScriptCore too):
      // an `if` branch (B.3.4), a statement-list-level label (B.3.2), and a
      // block. Guarding them here stops anyone from over-tightening the pass.
      const accepted = [
        'if (true) function f() {}',
        'if (true) function f() {} else function g() {}',
        'if (true) label: function f() {}',
        'label: function f() {}',
        '{ function f() {} }',
      ];

      for (const source of accepted) {
        const program = parseScript(source);

        assertSame(program.type, 'Program');
      }
    },
  },
  {
    name: 'the statement-position rejection carries the offending function position',
    run() {
      const error = /** @type {any} */ (
        assertThrows(
          () => parseScript('while (false) function f() {}'),
          SyntaxError,
        )
      );

      // The `function` keyword starts at 0-based index 14.
      assertSame(error.pos, 14);
      assertSame(error.lineNumber, 1);
      assertSame(error.columnNumber, 15);
      assertSame(error.loc.line, 1);
      assertSame(error.loc.column, 14);
    },
  },
];

export default tests;
