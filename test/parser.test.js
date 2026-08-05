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
];

export default tests;
