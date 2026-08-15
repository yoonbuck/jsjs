import { assertSame, assertThrows } from './harness/assert.js';
import { parseScript, parseEval } from '../src/parser.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

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
    name: 'parseScript rejects unsupported familiar AST shapes from custom parsers',
    run() {
      const unsupportedProperties = [
        {
          type: 'Property',
          kind: 'unsupported',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: 'x' },
          value: { type: 'Literal', value: 1 },
        },
        {
          type: 'FunctionExpression',
          id: null,
          params: [],
          generator: false,
          async: false,
          expression: false,
          body: { type: 'Literal', value: 1 },
        },
      ];

      for (const node of unsupportedProperties) {
        const program = {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ExpressionStatement',
              expression: node,
            },
          ],
        };

        assertThrows(
          () => parseScript('', { parse: () => program }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'custom parser rejects one structural node in multiple parent positions',
    run() {
      const property = {
        type: 'Property',
        kind: 'init',
        computed: false,
        method: false,
        shorthand: false,
        key: { type: 'Identifier', name: 'x' },
        value: { type: 'Literal', value: 1 },
      };
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'ObjectExpression',
              properties: [property],
            },
          },
          {
            type: 'ExpressionStatement',
            expression: property,
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser structural children must form a tree',
    run() {
      /** @type {any} */
      let expression = { type: 'Literal', value: 1 };

      for (let depth = 0; depth < 12; depth += 1) {
        expression = {
          type: 'ConditionalExpression',
          test: { type: 'Literal', value: true },
          consequent: expression,
          alternate: expression,
        };
      }

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [{ type: 'ExpressionStatement', expression }],
      };
      const ownKeys = Reflect.ownKeys;
      let ownKeysCalls = 0;

      Reflect.ownKeys = function countedOwnKeys(value) {
        ownKeysCalls += 1;
        return ownKeys(value);
      };

      try {
        const error = /** @type {any} */ (
          assertThrows(
            () => parseScript('', { parse: () => program }),
            SyntaxError,
          )
        );

        if (!error.message.includes('tree')) {
          throw new Error(`Expected structural tree rejection, got ${error}`);
        }
      } finally {
        Reflect.ownKeys = ownKeys;
      }

      if (ownKeysCalls >= 500) {
        throw new Error(
          `Expected fewer than 500 AST key scans, got ${ownKeysCalls}`,
        );
      }
    },
  },
  {
    name: 'custom parser rejects shared binding DAGs before BoundNames expansion',
    run() {
      /** @type {any} */
      let pattern = { type: 'Identifier', name: 'value' };

      for (let depth = 0; depth < 20; depth += 1) {
        pattern = { type: 'ArrayPattern', elements: [pattern, pattern] };
      }

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'let',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: pattern,
                init: { type: 'ArrayExpression', elements: [] },
              },
            ],
          },
        ],
      };
      const push = Array.prototype.push;
      let pushCalls = 0;
      /** @type {unknown} */
      let parseError;

      Array.prototype.push = function countedPush(
        /** @type {any[]} */ ...values
      ) {
        pushCalls += 1;
        return push.apply(this, values);
      };

      try {
        parseScript('', { parse: () => program });
      } catch (error) {
        parseError = error;
      } finally {
        Array.prototype.push = push;
      }

      if (pushCalls >= 1000) {
        throw new Error(
          `Expected fewer than 1000 worklist pushes, got ${pushCalls}`,
        );
      }

      assertSame(parseError instanceof SyntaxError, true);
      if (
        !(
          /** @type {SyntaxError} */ (parseError).message.includes(
            'structural tree',
          )
        )
      ) {
        throw new Error(
          `Expected structural tree rejection, got ${parseError}`,
        );
      }
    },
  },
  {
    name: 'custom parser rejects N functions sharing one N-deep parameter pattern in bounded work',
    run() {
      const size = 64;
      /** @type {any} */
      let sharedPattern = { type: 'Identifier', name: 'value' };

      for (let depth = 0; depth < size; depth += 1) {
        sharedPattern = {
          type: 'ArrayPattern',
          elements: [sharedPattern],
        };
      }

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: Array.from({ length: size }, (_, index) => ({
          type: 'FunctionDeclaration',
          id: { type: 'Identifier', name: `f${index}` },
          params: [sharedPattern],
          generator: false,
          async: false,
          expression: false,
          body: { type: 'BlockStatement', body: [] },
        })),
      };
      const push = Array.prototype.push;
      let pushCalls = 0;
      /** @type {unknown} */
      let parseError;

      Array.prototype.push = function countedPush(
        /** @type {any[]} */ ...values
      ) {
        pushCalls += 1;
        return push.apply(this, values);
      };

      try {
        parseScript('', { parse: () => program });
      } catch (error) {
        parseError = error;
      } finally {
        Array.prototype.push = push;
      }

      if (pushCalls >= 2000) {
        throw new Error(
          `Expected fewer than 2000 worklist pushes, got ${pushCalls}`,
        );
      }

      assertSame(parseError instanceof SyntaxError, true);
      if (
        !(
          /** @type {SyntaxError} */ (parseError).message.includes(
            'structural tree',
          )
        )
      ) {
        throw new Error(
          `Expected structural tree rejection, got ${parseError}`,
        );
      }
    },
  },
  {
    name: 'custom parser rejects repeated nodes in one structural child list',
    run() {
      const shared = { type: 'Literal', value: 1 };
      const program = expressionProgram({
        type: 'SequenceExpression',
        expressions: Array(128).fill(shared),
      });
      const arrayIterator = Array.prototype[Symbol.iterator];
      let iteratorSteps = 0;

      Array.prototype[Symbol.iterator] = function countedIterator() {
        const iterator = arrayIterator.call(this);

        return {
          next() {
            iteratorSteps += 1;
            return iterator.next();
          },
          [Symbol.iterator]() {
            return this;
          },
        };
      };

      try {
        const error = /** @type {any} */ (
          assertThrows(
            () => parseScript('', { parse: () => program }),
            SyntaxError,
          )
        );

        if (!error.message.includes('structural tree')) {
          throw new Error(`Expected structural tree rejection, got ${error}`);
        }
      } finally {
        Array.prototype[Symbol.iterator] = arrayIterator;
      }

      if (iteratorSteps >= 1000) {
        throw new Error(
          `Expected fewer than 1000 array-iterator steps, got ${iteratorSteps}`,
        );
      }
    },
  },
  {
    name: 'custom parser rejects a structural node shared across strict contexts',
    run() {
      const sharedDeclaration = {
        type: 'VariableDeclaration',
        kind: 'var',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: { type: 'Identifier', name: 'eval' },
            init: null,
          },
        ],
      };
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          sharedDeclaration,
          {
            type: 'FunctionDeclaration',
            id: { type: 'Identifier', name: 'strictFunction' },
            params: [],
            generator: false,
            async: false,
            expression: false,
            body: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'ExpressionStatement',
                  expression: { type: 'Literal', value: 'use strict' },
                  directive: 'use strict',
                },
                sharedDeclaration,
              ],
            },
          },
        ],
      };

      const error = /** @type {any} */ (
        assertThrows(
          () => parseScript('', { parse: () => program }),
          SyntaxError,
        )
      );
      if (!error.message.includes('structural tree')) {
        throw new Error(`Expected structural tree rejection, got ${error}`);
      }
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
    name: 'implemented Annex B function-declaration positions stay accepted in sloppy mode',
    run() {
      // The engine implements sloppy statement-list-level labelled functions
      // (B.3.2, including a label chain) and functions inside a block.
      const accepted = [
        'label: function f() {}',
        'a: b: function f() {}',
        '{ function f() {} }',
        'l: { function f() {} }',
      ];

      for (const source of accepted) {
        const program = parseScript(source);

        assertSame(program.type, 'Program');
      }
    },
  },
  {
    name: 'a direct if-body function is rejected in sloppy and strict code until Annex B.3.4 is implemented',
    run() {
      const rejected = [
        'if (true) function f() {}',
        'if (true) function f() {} else function g() {}',
        'if (true) ; else function g() {}',
        '"use strict"; if (true) function f() {}',
        '"use strict"; if (true) ; else function g() {}',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
    },
  },
  {
    name: 'a labelled function is rejected as an if branch even in sloppy mode',
    run() {
      // Annex B B.3.4 tolerates only a *bare* function as an `if` branch; a
      // label chain there is a SyntaxError in sloppy code too (JavaScriptCore
      // rejects `if (1) l: function f(){}`).
      const rejected = [
        'if (true) label: function f() {}',
        'if (true) ; else label: function f() {}',
        'if (true) a: b: function f() {}',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
    },
  },
  {
    name: 'strict mode forbids a function declaration as an if branch or a labelled body',
    run() {
      // In strict code Annex B disappears entirely (ES5.1 §12; the Annex B
      // grammar is sloppy-only): a function declaration is neither a valid
      // `if` branch nor the body of a labelled statement anywhere.
      const rejected = [
        '"use strict"; if (true) function f() {}',
        '"use strict"; if (true) ; else function f() {}',
        '"use strict"; label: function f() {}',
        '"use strict"; if (true) label: function f() {}',
        '"use strict"; a: b: function f() {}',
        '"use strict"; { label: function f() {} }',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
    },
  },
  {
    name: 'the strict function-declaration rejection follows per-function strictness',
    run() {
      // Strictness is a property of the nearest function scope, not the whole
      // program. Labelled functions remain accepted in sloppy function bodies,
      // while direct if-body functions are rejected until B.3.4 is implemented.
      const rejected = [
        'function outer() { "use strict"; if (1) function f() {} }',
        'function outer() { "use strict"; label: function f() {} }',
        'var g = function () { "use strict"; if (1) function f() {} };',
        'function outer() { if (1) function f() {} }',
        'var g = function () { if (1) function f() {} };',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
      const accepted = [
        'function outer() { label: function f() {} }',
        'var g = function () { label: function f() {} };',
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
  {
    name: 'a deeply nested but valid program parses without exhausting the stack',
    run() {
      // Acorn parses a member chain iteratively, so it accepts far deeper
      // input than a recursive AST walk survives. The statement-position
      // check must not lower the depth the parser as a whole accepts, or
      // valid programs start failing with a host RangeError instead of
      // parsing.
      const program = parseScript(
        `if (false) { a${'.a'.repeat(DEEP_MEMBER_CHAIN_LENGTH)}; }`,
      );

      assertSame(program.type, 'Program');
      assertSame(program.body[0].type, 'IfStatement');
    },
  },
  {
    name: 'cyclic custom AST child graphs reject at the parser boundary',
    run() {
      const pattern = /** @type {any} */ ({
        type: 'ArrayPattern',
        elements: /** @type {any[]} */ ([]),
      });
      pattern.elements.push(pattern);
      const directNodeCycle = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { type: 'Identifier', name: 'f' },
            params: [pattern],
            generator: false,
            async: false,
            expression: false,
            body: { type: 'BlockStatement', body: [] },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => directNodeCycle }),
        SyntaxError,
      );

      const cyclicChildArray = /** @type {any[]} */ ([]);
      cyclicChildArray.push(cyclicChildArray);
      const childArrayCycle = {
        type: 'Program',
        sourceType: 'script',
        body: cyclicChildArray,
      };

      assertThrows(
        () => parseScript('', { parse: () => childArrayCycle }),
        SyntaxError,
      );
    },
  },
  {
    name: 'a caller-supplied Acorn program with an evaluator-reachable cycle rejects before evaluation',
    run() {
      const consequent = /** @type {any} */ ({
        type: 'IfStatement',
        test: { type: 'Literal', value: true },
        consequent: null,
        alternate: null,
      });
      consequent.consequent = consequent;
      const program = parseScript('');
      program.body.push(consequent);

      assertThrows(() => parseScript('0;', { program }), SyntaxError);
      assertThrows(
        () => evaluateScript(createRealm(), '0;', { program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'a caller-supplied Acorn program rejects accessor and inherited state before Acorn reads it',
    run() {
      const program = parseScript('');
      let getterCalls = 0;
      let thrown;

      Object.defineProperty(program, 'body', {
        get() {
          getterCalls += 1;
          throw new Error('Program.body getter must not execute');
        },
        enumerable: true,
        configurable: true,
      });

      try {
        parseScript('0;', { program });
      } catch (error) {
        thrown = error;
      }

      assertSame(getterCalls, 0);
      assertSame(thrown instanceof SyntaxError, true);

      let inheritedGetterCalls = 0;
      let inheritedThrown;
      const inheritedProgram = Object.assign(
        Object.create({
          get body() {
            inheritedGetterCalls += 1;
            throw new Error('inherited Program.body getter must not execute');
          },
        }),
        {
          type: 'Program',
          sourceType: 'script',
        },
      );

      try {
        parseScript('0;', { program: inheritedProgram });
      } catch (error) {
        inheritedThrown = error;
      }

      assertSame(inheritedGetterCalls, 0);
      assertSame(inheritedThrown instanceof SyntaxError, true);

      for (const absentProgram of [undefined, null, false, 0, '']) {
        assertSame(
          parseScript('0;', { program: absentProgram }).body.length,
          1,
        );
      }
    },
  },
  {
    name: 'a token callback mutates only the ignored caller-supplied Acorn program',
    run() {
      const program = parseScript('1 + 2;');
      let callbackCalls = 0;

      const result = parseScript('0;', {
        program,
        onToken() {
          callbackCalls += 1;
          program.body[0].expression.operator = '**';
        },
      });

      assertSame(callbackCalls > 0, true);
      assertSame(program.body[0].expression.operator, '**');
      assertSame(result.body[0].expression.operator, '+');
      assertSame(result.body[1].expression.value, 0);
    },
  },
  {
    name: 'a token callback cannot install a Program getter that the engine executes',
    run() {
      const program = parseScript('1 + 2;');
      let callbackCalls = 0;
      let getterCalls = 0;
      const result = parseScript('0;', {
        program,
        onToken() {
          callbackCalls += 1;

          if (callbackCalls === 1) {
            Object.defineProperty(program, 'body', {
              get() {
                getterCalls += 1;
                throw new Error('Program.body getter must not execute');
              },
              enumerable: true,
              configurable: true,
            });
          }
        },
      });

      assertSame(callbackCalls > 0, true);
      assertSame(getterCalls, 0);
      assertSame(result.body.length, 2);
      assertSame(result.body[0].expression.operator, '+');
    },
  },
  {
    name: 'a token callback cannot smuggle an every method past function validation',
    run() {
      const program = parseScript('function existing(value) { return value; }');
      const declaration = program.body[0];
      let everyCalls = 0;

      const result = parseScript('added;', {
        program,
        onToken() {
          Object.defineProperty(declaration.params, 'every', {
            value() {
              everyCalls += 1;
              declaration.generator = true;
              return true;
            },
            configurable: true,
          });
        },
      });

      assertSame(everyCalls, 0);
      assertSame(declaration.generator, false);
      assertSame(result.body.length, 2);
      assertSame(result.body[0].generator, false);
      assertSame(
        Object.prototype.hasOwnProperty.call(result.body[0].params, 'every'),
        false,
      );
      assertSame(result.body[1].expression.name, 'added');
    },
  },
  {
    name: 'reusable Program snapshots reject structural-array method shadows',
    run() {
      const program = parseScript('function existing(value) { return value; }');
      const declaration = program.body[0];
      let methodCalls = 0;

      for (const method of ['map', 'every', 'some', 'includes']) {
        Object.defineProperty(declaration.params, method, {
          value() {
            methodCalls += 1;
            declaration.generator = true;
            return [];
          },
          configurable: true,
        });
      }

      assertThrows(() => parseScript('added;', { program }), SyntaxError);

      assertSame(methodCalls, 0);
      assertSame(declaration.generator, false);
    },
  },
  {
    name: 'omitted structural-array methods cannot hide AST nodes in function metadata',
    run() {
      const program = parseScript('function existing(value) { return value; }');
      const method = () => true;
      method.metadata = {
        type: 'FunctionDeclaration',
        generator: true,
      };
      Object.defineProperty(program.body[0].params, 'every', {
        value: method,
        configurable: true,
      });

      assertThrows(() => parseScript('added;', { program }), SyntaxError);
    },
  },
  {
    name: 'reusable Program snapshots reject function-valued metadata before callbacks',
    run() {
      for (const key of ['metadata', Symbol('metadata')]) {
        const program = parseScript('existing;');
        const callbackTarget = /** @type {any} */ (() => {});
        let callbackCalls = 0;

        Object.defineProperty(program.body[0], key, {
          value: callbackTarget,
          writable: true,
          enumerable: false,
          configurable: true,
        });

        assertThrows(
          () =>
            parseScript('added;', {
              program,
              onToken() {
                callbackCalls += 1;
                callbackTarget.hidden = {
                  type: 'UnsupportedCallbackNode',
                };
              },
            }),
          SyntaxError,
        );
        assertSame(callbackCalls, 0);
        assertSame(
          Object.prototype.hasOwnProperty.call(callbackTarget, 'hidden'),
          false,
        );
      }
    },
  },
  {
    name: 'reusable Program snapshots preserve RegExp literals and clone cyclic shared metadata',
    run() {
      const program = parseScript('/source/gi;');
      const shared = { note: 'original' };
      const metadata = /** @type {any} */ ({
        values: [shared, shared],
      });
      metadata.self = metadata;
      program.body[0].metadata = metadata;

      const result = parseScript('added;', {
        program,
        onToken() {
          shared.note = 'mutated';
        },
      });
      const copiedMetadata = result.body[0].metadata;
      const copiedLiteral = result.body[0].expression;

      assertSame(copiedMetadata === metadata, false);
      assertSame(copiedMetadata.values === metadata.values, false);
      assertSame(copiedMetadata.values[0] === shared, false);
      assertSame(copiedMetadata.values[0], copiedMetadata.values[1]);
      assertSame(copiedMetadata.self, copiedMetadata);
      assertSame(copiedMetadata.values[0].note, 'original');
      assertSame(copiedLiteral.type, 'Literal');
      assertSame(copiedLiteral.regex.pattern, 'source');
      assertSame(copiedLiteral.regex.flags, 'gi');
    },
  },
  {
    name: 'reusable Program snapshots reconstruct distinct RegExp literal values',
    run() {
      const program = parseScript('var pattern = /source/gi;');
      const originalLiteral = program.body[0].declarations[0].init;
      const originalValue = originalLiteral.value;
      originalValue.lastIndex = 4;

      const result = parseScript('pattern;', { program });
      const copiedLiteral = result.body[0].declarations[0].init;
      const copiedValue = copiedLiteral.value;

      assertSame(copiedValue instanceof RegExp, true);
      assertSame(copiedValue === originalValue, false);
      assertSame(copiedValue.source, 'source');
      assertSame(copiedValue.flags, 'gi');
      assertSame(copiedValue.lastIndex, 0);

      const completion = evaluateScript(
        createRealm(),
        '[pattern.source, pattern.global, pattern.ignoreCase].join(":");',
        { program },
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'source:true:true');
    },
  },
  {
    name: 'reusable Program snapshots reject shared structural nodes before callbacks',
    run() {
      const program = parseScript('function existing(value) { return value; }');
      const declaration = program.body[0];
      declaration.id = declaration.params[0];
      let callbackCalls = 0;

      assertThrows(
        () =>
          parseScript('added;', {
            program,
            onToken() {
              callbackCalls += 1;
              declaration.id.name = 'mutated';
            },
          }),
        SyntaxError,
      );
      assertSame(callbackCalls, 0);
      assertSame(declaration.id.name, 'value');
    },
  },
  {
    name: 'caller-supplied Program rejects an own body push method without invoking it',
    run() {
      const program = parseScript('existing;');
      let pushCalls = 0;

      Object.defineProperty(program.body, 'push', {
        value() {
          pushCalls += 1;
          return this.length;
        },
        writable: true,
        configurable: true,
      });

      assertThrows(() => parseScript('added;', { program }), SyntaxError);

      assertSame(pushCalls, 0);
      assertSame(program.body.length, 1);
    },
  },
  {
    name: 'caller-supplied Program append never invokes an inherited range setter',
    run() {
      const program = parseScript('existing;');
      let setterCalls = 0;
      let thrown;

      program.range = Object.create({
        /** @param {unknown} _value */
        set 1(_value) {
          setterCalls += 1;
        },
      });

      try {
        parseScript('added;', { program });
      } catch (error) {
        thrown = error;
      }

      assertSame(setterCalls, 0);
      assertSame(thrown instanceof TypeError, true);
      assertSame(program.body.length, 1);
    },
  },
  {
    name: 'caller-supplied Program missing loc or range rejects without partial mutation',
    run() {
      for (const missingField of ['loc', 'range']) {
        const program = parseScript('existing;');
        const originalEnd = program.end;
        let thrown;

        delete program[missingField];

        try {
          parseScript('added;', { program });
        } catch (error) {
          thrown = error;
        }

        assertSame(program.body.length, 1, missingField);
        assertSame(program.end, originalEnd, missingField);
        assertSame(thrown instanceof TypeError, true, missingField);
      }
    },
  },
  {
    name: 'caller-supplied Program append preserves the combined directive prologue',
    run() {
      const openPrologue = parseScript('"existing";');
      const openResult = parseScript('"appended"; var value = 1;', {
        program: openPrologue,
      });

      assertSame(openResult.body[0].directive, 'existing');
      assertSame(openResult.body[1].directive, 'appended');
      assertSame(openResult.sourceType, 'script');

      const closedPrologue = parseScript('existing;');
      const closedResult = parseScript('"use strict"; appended;', {
        program: closedPrologue,
      });

      assertSame(closedResult.body[1].directive, undefined);
      assertSame(closedResult.sourceType, 'script');

      const forgedPrologue = parseScript('existing;');
      forgedPrologue.body[0].directive = 'forged';
      const forgedResult = parseScript('"use strict"; appended;', {
        program: forgedPrologue,
      });

      assertSame(forgedResult.body[1].directive, undefined);
    },
  },
  {
    name: 'appended use strict revalidates earlier directive escape sequences',
    run() {
      for (const directive of ['"\\1";', '"\\8";']) {
        const program = parseScript(directive);

        assertThrows(
          () => parseScript(`${directive}"use strict";`),
          SyntaxError,
        );
        assertThrows(
          () => parseScript('"use strict";', { program }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'appended source spans are not applied to existing identifiers',
    run() {
      const program = parseScript('; foo;');
      const result = parseScript('/*\\u{*/ 0;', { program });

      assertSame(result.body.length, 3);
      assertSame(result.body[1].expression.name, 'foo');
      assertSame(result.body[2].expression.value, 0);
      assertThrows(
        () => parseScript('var \\u{66}oo = 1;', { program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'caller-supplied Program append rejects cross-boundary declaration conflicts',
    run() {
      const rejected = [
        ['"use strict"; let x;', 'let x;'],
        ['"use strict"; let x;', 'var x;'],
        ['"use strict"; var x;', 'let x;'],
        ['"use strict"; class Example {}', 'let Example;'],
        ['"use strict"; let { value: renamed } = source;', 'var renamed;'],
        ['label: function labelled() {}', 'let labelled;'],
      ];

      for (const [existingSource, appendedSource] of rejected) {
        assertThrows(
          () =>
            parseScript(appendedSource, {
              program: parseScript(existingSource),
            }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'caller-supplied Program append preserves repeated var and function declarations',
    run() {
      const allowed = [
        ['"use strict"; var x;', 'var x;'],
        ['function repeated() {}', 'function repeated() {}'],
        ['var shared;', 'function shared() {}'],
        ['{ function blockScoped() {} }', 'let blockScoped;'],
      ];

      for (const [existingSource, appendedSource] of allowed) {
        const result = parseScript(appendedSource, {
          program: parseScript(existingSource),
        });

        assertSame(result.type, 'Program');
      }
    },
  },
  {
    name: 'ordinary scripts reject labelled-function lexical conflicts and preserve var behavior',
    run() {
      assertThrows(
        () => parseScript('label: function x() {}; let x;'),
        SyntaxError,
      );

      for (const source of [
        'label: function x() {}; var x;',
        'function x() {}; function x() {}; var x;',
        '{ function x() {} } let x;',
      ]) {
        assertSame(parseScript(source).type, 'Program', source);
      }
    },
  },
  {
    name: 'custom AST declaration checks do not invoke array iterators',
    run() {
      const program = parseScript('label: function x() {}; var x;');
      program.body[1] = parseScript('let x;').body[0];
      const defaultIterator = program.body[Symbol.iterator];
      let iteratorCalls = 0;

      Object.defineProperty(program.body, Symbol.iterator, {
        value() {
          iteratorCalls += 1;
          return defaultIterator.call(this);
        },
        configurable: true,
      });

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
      assertSame(iteratorCalls, 0);
    },
  },
  {
    name: 'a reusable strict Program parses appended source with inherited strictness',
    run() {
      for (const strictPrefix of [
        '"use strict";',
        '"use strict"; existing;',
        '"other"; "use strict"; existing;',
      ]) {
        assertThrows(
          () =>
            parseScript('with ({ value: 1 }) {}', {
              program: parseScript(strictPrefix),
            }),
          SyntaxError,
        );
      }

      for (const directivePrefix of ['', '"existing";']) {
        assertThrows(
          () =>
            parseScript('"use strict"; with ({ value: 1 }) {}', {
              program: parseScript(directivePrefix),
            }),
          SyntaxError,
        );
      }

      assertThrows(
        () =>
          evaluateScript(createRealm(), 'with ({ value: 1 }) {}', {
            program: parseScript('"use strict"; 0;'),
          }),
        SyntaxError,
      );
    },
  },
  {
    name: 'a closed reusable directive prologue does not make appended directives retroactive',
    run() {
      const program = parseScript('existing;');
      const result = parseScript('"use strict"; with ({ value: 1 }) {}', {
        program,
      });

      assertSame(result.body.length, 3);
      assertSame(result.body[0].expression.name, 'existing');
      assertSame(result.body[1].directive, undefined);
      assertSame(result.body[2].type, 'WithStatement');
    },
  },
  {
    name: 'a custom parser receives its program option but returns an engine-owned snapshot',
    run() {
      const program = expressionProgram({ type: 'Literal', value: 1 });
      let receivedProgram;
      const result = parseScript('', {
        program,
        /**
         * @param {string} _source
         * @param {any} parserOptions
         */
        parse(_source, parserOptions) {
          receivedProgram = parserOptions.program;
          return program;
        },
      });

      assertSame(receivedProgram, program);
      assertSame(result === program, false);
      assertSame(result.body === program.body, false);
      assertSame(result.body[0].expression.value, 1);
    },
  },
  {
    name: 'a caller-supplied Acorn program rejects AST nodes hidden in metadata',
    run() {
      const program = parseScript('{}');
      program.body[0].metadata = {
        hidden: { type: 'BlockStatement', body: [] },
      };

      assertThrows(() => parseScript('0;', { program }), SyntaxError);
      assertThrows(
        () => evaluateScript(createRealm(), '0;', { program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'a caller-supplied Acorn program rejects a nonenumerable evaluator child before evaluation',
    run() {
      const program = parseScript('({ value: 1 });');
      const object = program.body[0].expression;

      Object.defineProperty(object, 'properties', {
        value: [
          {
            type: 'SpreadElement',
            argument: { type: 'Identifier', name: 'source' },
          },
        ],
        writable: true,
        enumerable: false,
        configurable: true,
      });

      assertThrows(() => parseScript('0;', { program }), SyntaxError);
      assertThrows(
        () => evaluateScript(createRealm(), '0;', { program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom and caller-supplied ASTs reject inherited for-of await syntax',
    run() {
      /** @returns {any} */
      function inheritedAwaitForOf() {
        return Object.assign(Object.create({ await: true }), {
          type: 'ForOfStatement',
          left: {
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: 'value' },
                init: null,
              },
            ],
          },
          right: { type: 'ArrayExpression', elements: [] },
          body: { type: 'EmptyStatement' },
        });
      }

      const customProgram = {
        type: 'Program',
        sourceType: 'script',
        body: [inheritedAwaitForOf()],
      };
      assertParserAndEvaluatorSyntaxError(customProgram);

      const program = parseScript('for (var value of []) {}');
      Object.setPrototypeOf(program.body[0], { await: true });
      assertThrows(() => parseScript('0;', { program }), SyntaxError);
      assertThrows(
        () => evaluateScript(createRealm(), '0;', { program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser rejects structural accessors without invoking their getters',
    run() {
      let getterCalls = 0;
      const expression = { type: 'ObjectExpression' };

      Object.defineProperty(expression, 'properties', {
        get() {
          getterCalls += 1;
          throw new Error('structural getter must not execute');
        },
        enumerable: true,
        configurable: true,
      });

      assertThrows(
        () => parseScript('', { parse: () => expressionProgram(expression) }),
        SyntaxError,
      );
      assertSame(getterCalls, 0);
    },
  },
  {
    name: 'custom parser snapshots parameter arrays before malformed-parameter validation',
    run() {
      const params = /** @type {any[]} */ ([{}]);
      let mapCalls = 0;
      params.map = () => {
        mapCalls += 1;
        return [];
      };
      const program = expressionProgram({
        type: 'ArrowFunctionExpression',
        id: null,
        params,
        generator: false,
        async: false,
        expression: true,
        body: { type: 'Literal', value: 0 },
      });
      let parseError;
      let evaluationError;

      try {
        parseScript('', { parse: () => program });
      } catch (error) {
        parseError = error;
      }

      try {
        evaluateScript(createRealm(), '', { parse: () => program });
      } catch (error) {
        evaluationError = error;
      }

      assertSame(
        `${mapCalls}:${parseError instanceof SyntaxError}:${evaluationError instanceof SyntaxError}`,
        '0:true:true',
      );
    },
  },
  {
    name: 'custom parser snapshots object-property arrays before duplicate __proto__ validation',
    run() {
      /** @returns {any} */
      function protoProperty() {
        return {
          type: 'Property',
          kind: 'init',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: '__proto__' },
          value: { type: 'Identifier', name: 'proto' },
        };
      }

      const properties = [protoProperty(), protoProperty()];
      let iteratorCalls = 0;
      properties[Symbol.iterator] = function () {
        iteratorCalls += 1;
        return [][Symbol.iterator]();
      };
      const program = expressionProgram({
        type: 'ObjectExpression',
        properties,
      });
      let parseError;
      let evaluationError;

      try {
        parseScript('', { parse: () => program });
      } catch (error) {
        parseError = error;
      }

      try {
        evaluateScript(createRealm(), '', { parse: () => program });
      } catch (error) {
        evaluationError = error;
      }

      assertSame(
        `${iteratorCalls}:${parseError instanceof SyntaxError}:${evaluationError instanceof SyntaxError}`,
        '0:true:true',
      );
    },
  },
  {
    name: 'custom parser snapshots preserve RegExp literals and cyclic shared metadata',
    run() {
      const program = parseScript('/source/gi;');
      const shared = { note: 'shared' };
      const metadata = /** @type {any} */ ({
        values: [shared, shared],
      });
      metadata.self = metadata;
      program.body[0].metadata = metadata;

      const result = parseScript('', { parse: () => program });
      const copiedMetadata = result.body[0].metadata;
      const originalValue = program.body[0].expression.value;
      const copiedValue = result.body[0].expression.value;

      assertSame(result === program, false);
      assertSame(copiedMetadata === metadata, false);
      assertSame(copiedMetadata.self, copiedMetadata);
      assertSame(copiedMetadata.values[0], copiedMetadata.values[1]);
      assertSame(copiedMetadata.values[0] === shared, false);
      assertSame(copiedValue instanceof RegExp, true);
      assertSame(copiedValue === originalValue, false);
      assertSame(copiedValue.source, 'source');
      assertSame(copiedValue.flags, 'gi');
    },
  },
  {
    name: 'custom parser rejects sparse child arrays without reading inherited entries',
    run() {
      /**
       * @param {(calls: number) => any} inheritedValue
       * @returns {{ getterCalls: number, thrown: unknown }}
       */
      function runSparseBody(inheritedValue) {
        const inheritedIndex = '31';
        const previous = Object.getOwnPropertyDescriptor(
          Array.prototype,
          inheritedIndex,
        );
        const body = new Array(32);
        let getterCalls = 0;
        let thrown;

        for (let index = 0; index < 31; index += 1) {
          body[index] = { type: 'EmptyStatement' };
        }

        Object.defineProperty(Array.prototype, inheritedIndex, {
          get() {
            getterCalls += 1;
            return inheritedValue(getterCalls);
          },
          set(value) {
            Object.defineProperty(this, inheritedIndex, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
          configurable: true,
        });

        try {
          parseScript('', {
            parse: () => ({
              type: 'Program',
              sourceType: 'script',
              body,
            }),
          });
        } catch (error) {
          thrown = error;
        } finally {
          if (previous === undefined) {
            delete Array.prototype[inheritedIndex];
          } else {
            Object.defineProperty(Array.prototype, inheritedIndex, previous);
          }
        }

        return { getterCalls, thrown };
      }

      const stable = runSparseBody(() => ({ type: 'EmptyStatement' }));
      const changing = runSparseBody((calls) =>
        calls === 1
          ? { type: 'EmptyStatement' }
          : { type: 'Literal', value: 0 },
      );

      assertSame(stable.getterCalls, 0);
      assertSame(stable.thrown instanceof SyntaxError, true);
      assertSame(changing.getterCalls, 0);
      assertSame(changing.thrown instanceof SyntaxError, true);

      const sparseMetadata = new Array(2);
      sparseMetadata[1] = { note: 'plain metadata remains valid' };
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [{ type: 'EmptyStatement', metadata: sparseMetadata }],
      };

      assertSame(parseScript('', { parse: () => program }).type, 'Program');
    },
  },
  {
    name: 'custom parser rejects AST nodes hidden in nonenumerable and symbol metadata',
    run() {
      /** @returns {any} */
      function hiddenBlock() {
        return { type: 'BlockStatement', body: [] };
      }

      const nonenumerable = expressionProgram({ type: 'Literal', value: 0 });
      Object.defineProperty(nonenumerable.body[0], 'metadata', {
        value: { hidden: hiddenBlock() },
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const symbol = Symbol('metadata');
      const symbolMetadata = expressionProgram({ type: 'Literal', value: 0 });
      symbolMetadata.body[0][symbol] = { hidden: hiddenBlock() };

      assertParserAndEvaluatorSyntaxError(nonenumerable);
      assertParserAndEvaluatorSyntaxError(symbolMetadata);
    },
  },
  {
    name: 'a caller-supplied Acorn program rejects unsupported binary scalar syntax before evaluator dispatch',
    run() {
      const program = parseScript('1 + 2;');
      program.body[0].expression.operator = '**';

      assertThrows(() => parseScript('0;', { program }), SyntaxError);
      assertThrows(
        () => evaluateScript(createRealm(), '0;', { program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser rejects optional member call and chain syntax flags',
    run() {
      /** @returns {any} */
      function memberExpression() {
        return {
          type: 'MemberExpression',
          object: { type: 'Literal', value: 'value' },
          property: { type: 'Identifier', name: 'length' },
          computed: false,
          optional: true,
        };
      }

      const functionExpression = {
        type: 'FunctionExpression',
        id: null,
        params: [],
        generator: false,
        expression: false,
        body: { type: 'BlockStatement', body: [] },
      };
      const malformed = [
        memberExpression(),
        {
          type: 'CallExpression',
          callee: functionExpression,
          arguments: [],
          optional: true,
        },
        {
          type: 'ChainExpression',
          expression: memberExpression(),
        },
      ];

      for (const expression of malformed) {
        assertParserAndEvaluatorSyntaxError(expressionProgram(expression));
      }
    },
  },
  {
    name: 'custom parser requires UnaryExpression.prefix to be exactly true',
    run() {
      for (const scalar of [{}, { prefix: false }, { prefix: 'true' }]) {
        assertParserAndEvaluatorSyntaxError(
          expressionProgram({
            type: 'UnaryExpression',
            operator: '!',
            argument: { type: 'Literal', value: true },
            ...scalar,
          }),
        );
      }

      assertSame(
        parseScript('', {
          parse: () =>
            expressionProgram({
              type: 'UnaryExpression',
              operator: '!',
              prefix: true,
              argument: { type: 'Literal', value: true },
            }),
        }).type,
        'Program',
      );
    },
  },
  {
    name: 'custom parser rejects malformed evaluator scalar fields and operators',
    run() {
      const malformedPrograms = [
        expressionProgram({
          type: 'UnaryExpression',
          operator: 'await',
          argument: { type: 'Literal', value: 1 },
        }),
        expressionProgram({
          type: 'LogicalExpression',
          operator: '??',
          left: { type: 'Literal', value: 1 },
          right: { type: 'Literal', value: 2 },
        }),
        expressionProgram({
          type: 'AssignmentExpression',
          operator: '**=',
          left: { type: 'Identifier', name: 'value' },
          right: { type: 'Literal', value: 2 },
        }),
        expressionProgram({
          type: 'UpdateExpression',
          operator: '+',
          prefix: 'true',
          argument: { type: 'Identifier', name: 'value' },
        }),
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'VariableDeclaration',
              kind: 'using',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'value' },
                  init: null,
                },
              ],
            },
          ],
        },
        expressionProgram({
          type: 'Literal',
          value: /x/,
          raw: '/x/',
          regex: { pattern: 1, flags: 'g' },
        }),
        expressionProgram({
          type: 'TemplateLiteral',
          expressions: [],
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: 'x', cooked: 'x' },
              tail: 'true',
            },
          ],
        }),
      ];

      for (const program of malformedPrograms) {
        assertParserAndEvaluatorSyntaxError(program);
      }
    },
  },
  {
    name: 'custom parser preserves supported omitted optional syntax fields',
    run() {
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'CallExpression',
              callee: {
                type: 'MemberExpression',
                object: { type: 'Literal', value: 'value' },
                property: { type: 'Identifier', name: 'length' },
                computed: false,
              },
              arguments: [],
            },
          },
          {
            type: 'ForOfStatement',
            left: {
              type: 'VariableDeclaration',
              kind: 'var',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'value' },
                  init: null,
                },
              ],
            },
            right: { type: 'ArrayExpression', elements: [] },
            body: { type: 'EmptyStatement' },
          },
        ],
      };

      assertSame(parseScript('', { parse: () => program }).type, 'Program');
    },
  },
  {
    name: 'custom parser rejects a statement node on a direct expression edge',
    run() {
      const program = expressionProgram({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'BlockStatement', body: [] },
        right: { type: 'Literal', value: 1 },
      });

      assertParserAndEvaluatorSyntaxError(program);
    },
  },
  {
    name: 'custom parser rejects nested arrays on evaluator child lists',
    run() {
      const program = expressionProgram({
        type: 'ArrayExpression',
        elements: [[]],
      });

      assertParserAndEvaluatorSyntaxError(program);
    },
  },
  {
    name: 'custom parser rejects primitive null and wrong-node evaluator children',
    run() {
      const malformedPrograms = [
        expressionProgram({
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'call' },
          arguments: [null],
        }),
        expressionProgram({
          type: 'SequenceExpression',
          expressions: [0],
        }),
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'IfStatement',
              test: { type: 'Literal', value: true },
              consequent: null,
              alternate: null,
            },
          ],
        },
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'VariableDeclaration',
              kind: 'var',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'value' },
                  init: 0,
                },
              ],
            },
          ],
        },
      ];

      for (const program of malformedPrograms) {
        assertParserAndEvaluatorSyntaxError(program);
      }
    },
  },
  {
    name: 'custom parser rejects an object-pattern property without a value',
    run() {
      assertParserAndEvaluatorSyntaxError(
        objectPatternProgram({
          type: 'Property',
          kind: 'init',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: 'value' },
          value: null,
        }),
      );
    },
  },
  {
    name: 'custom parser rejects null members before function and setter semantics inspect them',
    run() {
      /** @param {any[]} params */
      function setterFunction(params) {
        return {
          type: 'FunctionExpression',
          id: null,
          params,
          generator: false,
          async: false,
          expression: false,
          body: { type: 'BlockStatement', body: [] },
        };
      }

      const malformedPrograms = [
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'FunctionDeclaration',
              id: { type: 'Identifier', name: 'f' },
              params: [],
              generator: false,
              async: false,
              expression: false,
              body: { type: 'BlockStatement', body: [null] },
            },
          ],
        },
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ClassDeclaration',
              id: { type: 'Identifier', name: 'C' },
              superClass: null,
              body: {
                type: 'ClassBody',
                body: [
                  {
                    type: 'MethodDefinition',
                    key: { type: 'Identifier', name: 'value' },
                    computed: false,
                    static: false,
                    kind: 'set',
                    value: setterFunction([null]),
                  },
                ],
              },
            },
          ],
        },
        expressionProgram({
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              key: { type: 'Identifier', name: 'value' },
              computed: false,
              method: false,
              shorthand: false,
              kind: 'set',
              value: setterFunction([null]),
            },
          ],
        }),
      ];

      for (const program of malformedPrograms) {
        assertParserAndEvaluatorSyntaxError(program);
      }
    },
  },
  {
    name: 'custom parser preserves null array-expression holes',
    run() {
      assertSame(
        parseScript('', {
          parse: () =>
            expressionProgram({
              type: 'ArrayExpression',
              elements: [null],
            }),
        }).type,
        'Program',
      );
    },
  },
  {
    name: 'custom parser requires evaluator null sentinels and nonempty for-in-of declarations',
    run() {
      /** @param {any} left */
      function forOfProgram(left) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ForOfStatement',
              left,
              right: { type: 'ArrayExpression', elements: [] },
              body: { type: 'EmptyStatement' },
            },
          ],
        };
      }

      const malformedPrograms = [
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ForStatement',
              init: null,
              test: undefined,
              update: null,
              body: { type: 'EmptyStatement' },
            },
          ],
        },
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'TryStatement',
              block: { type: 'BlockStatement', body: [] },
              handler: undefined,
              finalizer: null,
            },
          ],
        },
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'SwitchStatement',
              discriminant: { type: 'Literal', value: 0 },
              cases: [
                {
                  type: 'SwitchCase',
                  test: undefined,
                  consequent: [],
                },
              ],
            },
          ],
        },
        forOfProgram({
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [],
        }),
        forOfProgram({
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: { type: 'Identifier', name: 'value' },
              init: { type: 'Literal', value: 0 },
            },
          ],
        }),
      ];

      for (const program of malformedPrograms) {
        assertParserAndEvaluatorSyntaxError(program);
      }
    },
  },
  {
    name: 'a statement-position function declaration is still rejected when deeply nested',
    run() {
      // The depth fix must not cost reach: the offending node here sits
      // below thousands of enclosing blocks.
      const depth = 2000;
      const source = `${'{'.repeat(depth)}while (false) function f() {}${'}'.repeat(depth)}`;

      assertThrows(() => parseScript(source), SyntaxError);
    },
  },

  // ---------------------------------------------------------------------------
  // ES5.1 §7.6 / §7.6.1: a `ReservedWord` is matched against the
  // *IdentifierName* only after its Unicode escape sequences are interpreted,
  // so an identifier whose code points spell a reserved word is a parse-phase
  // `SyntaxError` even when written with escapes. Acorn's `checkUnreserved`
  // bails out of the reserved-word test for any escaped identifier when
  // `ecmaVersion < 6`, letting `var \u0063lass = 1` through; the parser must
  // reject it, matching JavaScriptCore and the upstream `val-*-via-escape`
  // tests (`phase: parse`).
  // ---------------------------------------------------------------------------
  {
    name: 'an ES5 future reserved word spelled with an escape is rejected as an identifier',
    run() {
      // Every ES5.1 §7.6.1.2 FutureReservedWord, one code point escaped. These
      // are not keywords Acorn tokenizes, so only the escape path reaches them.
      const rejected = [
        'var \\u0063lass = 1;',
        'var \\u0063onst = 1;',
        'var \\u0065num = 1;',
        'var \\u0065xport = 1;',
        'var \\u0065xtends = 1;',
        'var \\u0069mport = 1;',
        'var \\u0073uper = 1;',
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
    name: 'an escaped reserved word is rejected in reference and label positions too',
    run() {
      // §7.6 governs every Identifier, not just bindings: an identifier
      // reference and a labelled statement's label are both Identifiers.
      assertThrows(() => parseScript('void \\u0073uper;'), SyntaxError);
      assertThrows(() => parseScript('\\u0065num: 1;'), SyntaxError);
    },
  },
  {
    name: 'a strict-only reserved word spelled with an escape is rejected only in strict code',
    run() {
      // `yield` is a FutureReservedWord solely in strict mode (§7.6.1.2), so
      // the escaped label is a SyntaxError under a "use strict" prologue but
      // stays a valid label in sloppy code.
      assertThrows(
        () => parseScript('"use strict";\nyi\\u0065ld: 1;'),
        SyntaxError,
      );

      const program = parseScript('yi\\u0065ld: 1;');
      assertSame(program.type, 'Program');
    },
  },
  {
    name: 'escapes stay legal where an IdentifierName is expected, and in ordinary names',
    run() {
      // Reserved words remain valid as property names (IdentifierName, not
      // Identifier — §11.2.1, §11.1.5), and an escape that spells an ordinary
      // identifier is always fine.
      const accepted = [
        'obj.cla\\u0073s;',
        '({ cla\\u0073s: 1 });',
        'var \\u0061bc = 1;',
      ];

      for (const source of accepted) {
        const program = parseScript(source);

        assertSame(program.type, 'Program');
      }
    },
  },
  {
    name: 'super.prop parses inside an object literal accessor as a Super-based MemberExpression',
    run() {
      const program = parseScript('var o = { get x() { return super.y; } };');
      const getter = program.body[0].declarations[0].init.properties[0].value;
      const returnArgument = getter.body.body[0].argument;

      assertSame(returnArgument.type, 'MemberExpression');
      assertSame(returnArgument.object.type, 'Super');
      assertSame(returnArgument.property.name, 'y');
    },
  },
  {
    name: 'super outside a method still raises a SyntaxError',
    run() {
      assertThrows(() => parseScript('super.x;'), SyntaxError);
      assertThrows(
        () => parseScript('function f() { return super.x; }'),
        SyntaxError,
      );
    },
  },
  {
    name: 'super not followed by . or [ still raises a SyntaxError',
    run() {
      assertThrows(
        () => parseScript('var o = { get x() { return super; } };'),
        SyntaxError,
      );
    },
  },
  {
    name: 'a RegularExpressionLiteral the ES5 pattern grammar rejects is an early error',
    run() {
      // ES5.1 §7.8.5: the [[Value]] of a RegularExpressionLiteral is the
      // result of `new RegExp(Pattern, Flags)`, and "if the call to new
      // RegExp would generate an error ... the error must be treated as an
      // early error". Acorn parses the literal against the *host's* Annex
      // B-permissive grammar, so this pass is what makes the error early.
      const rejected = [
        '/]/;',
        '/{/;',
        '/\\a/;',
        '/\\01/;',
        '/(a)\\2/;',
        'var r = /[b-a]/;',
        'if (false) { /]/; }',
        'function never() { return /]/; }',
        '/a/gg;',
        '/a/x;',
      ];

      for (const source of rejected) {
        const error = /** @type {any} */ (
          assertThrows(() => parseScript(source), SyntaxError)
        );

        assertSame(error.name, 'SyntaxError', source);
      }
    },
  },
  {
    name: 'a valid RegularExpressionLiteral still parses',
    run() {
      const accepted = [
        '/a/;',
        '/a/gim;',
        '/\\$/;',
        '/[a-z]/i;',
        '/(a)\\1/;',
        '/(?:a|b)+/;',
        '({}).x = /a/;',
      ];

      for (const source of accepted) {
        assertSame(parseScript(source).type, 'Program', source);
      }
    },
  },
  {
    name: 'an invalid RegularExpressionLiteral aborts eval before any statement runs',
    run() {
      // The early error must precede execution: nothing in the eval body may
      // have run by the time the guest SyntaxError is thrown.
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'var log = "A";' +
            'try { eval("log += \'B\'; /]/;") } catch (e) { log += ":" + e.constructor.name }' +
            'log;',
        ).value,
        'A:SyntaxError',
      );
    },
  },
  {
    name: 'an invalid RegularExpressionLiteral rejects a dynamic Function at construction',
    run() {
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'var name = "none";' +
            'try { new Function("return /]/;") } catch (e) { name = e.constructor.name }' +
            'name;',
        ).value,
        'SyntaxError',
      );
    },
  },
  {
    name: 'an invalid RegularExpressionLiteral in unreachable code is still an early error',
    run() {
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'var name = "none";' +
            'try { eval("if (false) { /]/; }") } catch (e) { name = e.constructor.name }' +
            'name;',
        ).value,
        'SyntaxError',
      );
    },
  },
  {
    name: 'IdentifierName follows the vendored parser, which differs from ES5.1 7.6',
    run() {
      // Documented deviation:
      // docs/limitations.md#identifiername-is-the-vendored-parsers-grammar-not-es51-76.
      // U+2E2F VERTICAL TILDE is category Lm, so ES5.1 7.6 makes it a
      // UnicodeLetter and `_\u2E2F` a valid Identifier. Acorn lexes identifiers
      // with the modern ID_Continue property, which excludes it as
      // Pattern_Syntax, so the engine is stricter than ES5.1 here. This is the
      // only direction of the divergence where the engine rejects conforming
      // ES5.1 source, so it is the one worth pinning.
      assertThrows(() => parseScript('var _\u2E2F;'), SyntaxError);

      // The engine contradicts itself about this code point, which is what
      // makes it a deviation rather than a design choice: the RegExp validator
      // uses the pinned ES5.1 table, where U+2E2F *is* an IdentifierPart, so
      // `\\\u2E2F` is rejected as an identity escape by the very same parse.
      assertThrows(() => parseScript('/\\\u2E2F/;'), SyntaxError);

      // The other direction: U+00B7 is Other_ID_Continue, which ES5.1 has no
      // category for. The parser accepts it in an identifier while the RegExp
      // validator treats it as a non-IdentifierPart and allows `\\\u00B7`.
      parseScript('var a\u00B7b;');
      parseScript('/\\\u00B7/;');
    },
  },

  {
    name: 'let and const declarations parse in every position the ES2015 grammar allows: top level, block, and for head, through parseScript and parseEval',
    run() {
      const accepted = [
        ['let x = 1;', 'let'],
        ['const y = 2;', 'const'],
        ['let a = 1, b = 2, c;', 'let'],
        ['const p = 1, q = 2;', 'const'],
      ];

      for (const [source, kind] of accepted) {
        const program = parseScript(source);

        assertSame(program.type, 'Program', source);
        assertSame(program.body[0].type, 'VariableDeclaration', source);
        assertSame(program.body[0].kind, kind, source);
      }

      const parses = [
        '{ let x = 1; }',
        '{ const y = 2; }',
        'for (let i = 0; i < 1; i = i + 1) {}',
        'for (const k in this) {}',
        'for (var x of []) {}',
        'for (let x of []) {}',
        'for (const x of []) {}',
        'for (x of []) {}',
        'l: { let x = 1; }',
      ];

      for (const source of parses) {
        assertSame(parseScript(source).type, 'Program', source);
        assertSame(parseEval(source).type, 'Program', source);
      }
    },
  },
  {
    name: 'enhanced object literal property forms parse from parseScript and parseEval',
    run() {
      const accepted = [
        'var value = 1; var object = { value };',
        'var object = { [key]: value };',
        'var object = { method(value = 1, ...rest) { return value; } };',
        'var object = { get [key]() { return value; }, set [key](value) {} };',
      ];

      for (const source of accepted) {
        assertSame(parseScript(source).type, 'Program', source);
        assertSame(parseEval(source).type, 'Program', source);
      }

      const property = parseScript(
        'var value; var object = { value, [key]: value, method() {}, get item() {}, set item(value) {} };',
      ).body[1].declarations[0].init.properties;
      assertSame(property[0].shorthand, true);
      assertSame(property[1].computed, true);
      assertSame(property[2].method, true);
      assertSame(property[3].kind, 'get');
      assertSame(property[4].kind, 'set');
    },
  },
  {
    name: 'parser admits ES2015 generator declarations, expressions, and methods',
    run() {
      const program = parseScript(`
        function* declaration(a) { yield a; yield; }
        var expression = function* named() { yield* []; };
        var object = { *method() { yield 1; }, *[key()]() { yield 2; } };
        class C {
          *method() { yield super.value; }
          static *[key()]() { yield 3; }
        }
      `);

      assertSame(program.body[0].generator, true);
      assertSame(program.body[1].declarations[0].init.generator, true);
      assertSame(
        program.body[2].declarations[0].init.properties[0].value.generator,
        true,
      );
      assertSame(program.body[3].body.body[0].value.generator, true);

      const bareYield = program.body[0].body.body[1].expression;
      assertSame(bareYield.type, 'YieldExpression');
      assertSame(bareYield.delegate, false);
      assertSame(bareYield.argument, null);

      const delegatedYield =
        program.body[1].declarations[0].init.body.body[0].expression;
      assertSame(delegatedYield.type, 'YieldExpression');
      assertSame(delegatedYield.delegate, true);
      assertSame(delegatedYield.argument.type, 'ArrayExpression');
    },
  },
  {
    name: 'parser preserves generator early errors and rejects malformed custom yield syntax',
    run() {
      const rejected = [
        'function* g(a = yield 1) {}',
        'function* g(...yield) {}',
        '({ get *x() {} })',
        'class C { *constructor() {} }',
        'async function* g() {}',
        'function* g(){ await 1; }',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }

      /** @param {any} value */
      function generatorProgram(value) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'FunctionDeclaration',
              id: { type: 'Identifier', name: 'g' },
              params: [],
              generator: true,
              async: false,
              expression: false,
              body: {
                type: 'BlockStatement',
                body: [
                  {
                    type: 'ExpressionStatement',
                    expression: value,
                  },
                ],
              },
            },
          ],
        };
      }

      const malformed = [
        {
          ...generatorProgram({ type: 'Literal', value: 0 }),
          body: [
            {
              ...generatorProgram({ type: 'Literal', value: 0 }).body[0],
              generator: 'true',
            },
          ],
        },
        {
          ...generatorProgram({ type: 'Literal', value: 0 }),
          body: [
            {
              ...generatorProgram({ type: 'Literal', value: 0 }).body[0],
              async: true,
            },
          ],
        },
        generatorProgram({
          type: 'YieldExpression',
          delegate: 'false',
          argument: null,
        }),
        generatorProgram({
          type: 'YieldExpression',
          delegate: true,
          argument: null,
        }),
      ];

      for (const program of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => program }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'custom parser confines yield to a current generator body',
    run() {
      const yieldExpression = {
        type: 'YieldExpression',
        delegate: false,
        argument: null,
      };
      const ordinaryFunction = {
        type: 'FunctionDeclaration',
        id: { type: 'Identifier', name: 'f' },
        params: [],
        generator: false,
        async: false,
        expression: false,
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement', expression: yieldExpression }],
        },
      };
      const generator = {
        ...ordinaryFunction,
        id: { type: 'Identifier', name: 'g' },
        generator: true,
      };
      const cases = [
        expressionProgram(yieldExpression),
        { type: 'Program', sourceType: 'script', body: [ordinaryFunction] },
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              ...generator,
              params: [yieldExpression],
              body: { type: 'BlockStatement', body: [] },
            },
          ],
        },
        {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              ...generator,
              body: {
                type: 'BlockStatement',
                body: [
                  {
                    ...ordinaryFunction,
                    type: 'FunctionDeclaration',
                    id: { type: 'Identifier', name: 'nested' },
                  },
                ],
              },
            },
          ],
        },
        expressionProgram({
          type: 'ClassExpression',
          id: null,
          superClass: null,
          body: {
            type: 'ClassBody',
            body: [
              {
                type: 'MethodDefinition',
                key: { type: 'Identifier', name: 'method' },
                computed: false,
                static: false,
                kind: 'method',
                value: {
                  type: 'FunctionExpression',
                  id: null,
                  params: [],
                  generator: false,
                  async: false,
                  expression: false,
                  body: {
                    type: 'BlockStatement',
                    body: [
                      {
                        type: 'ExpressionStatement',
                        expression: yieldExpression,
                      },
                    ],
                  },
                },
              },
            ],
          },
        }),
      ];

      for (const program of cases) {
        assertThrows(
          () => parseScript('', { parse: () => program }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'each remaining reachable unsupported ES2015 construct is rejected by the pass from parseScript and parseEval',
    run() {
      const rejected = [
        'var object = { async method() {} };',
        'var object = { ...source };',
        'function withMeta() { return new.target; }',
        '0b101;',
        '0B101;',
        '0o17;',
        '0O17;',
        'var s = "\\u{41}";',
        'var \\u{63}at = 1;',
        'tag`\\u{41}`;',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
        assertThrows(() => parseEval(source), SyntaxError);
      }
    },
  },
  {
    name: 'classes expose exact supported AST shapes and preserve class static errors',
    run() {
      const accepted = [
        'class C {}',
        'var C = class {};',
        'class C { constructor(value = 1, ...rest) {} method() {} get value() {} set value(next) {} static build() {} }',
        'class C extends Base { constructor(value) { super(value); } method() { return super.method(); } }',
        'class C { ["constructor"]() {} static ["prototype"]() {} }',
        'class C extends null { constructor() { return {}; } }',
        'class C extends null { constructor() { super(); } }',
        'class C extends Base { constructor() { return (() => super())(); } }',
        'var assigned; assigned = class {};',
        'var initialized = class {};',
        '(class {});',
        '(class {}).prototype;',
        '(function (value) { return value; })(class {});',
        '[class {}];',
        'class Outer extends (class {}) {}',
      ];

      for (const source of accepted) {
        assertSame(parseScript(source).type, 'Program', source);
        assertSame(parseEval(source).type, 'Program', source);
      }

      const classNode = parseScript(
        'class C extends Base { constructor() {} get value() {} static method() {} }',
      ).body[0];
      assertSame(classNode.type, 'ClassDeclaration');
      assertSame(classNode.id.name, 'C');
      assertSame(classNode.superClass.type, 'Identifier');
      assertSame(classNode.body.type, 'ClassBody');
      assertSame(classNode.body.body[0].type, 'MethodDefinition');
      assertSame(classNode.body.body[0].kind, 'constructor');
      assertSame(classNode.body.body[1].kind, 'get');
      assertSame(classNode.body.body[2].static, true);

      const rejected = [
        'class C { constructor() {} constructor(value) {} }',
        'class C { get constructor() {} }',
        'class C { set constructor(value) {} }',
        'class C { static prototype() {} }',
        'class C { constructor() { super(); } }',
        'class C { method() { super(); } }',
        'class C extends Base { method() { super(); } }',
        'class C extends Base { constructor() { function nested() { super(); } } }',
        'class C extends Base { constructor() { function nested() { return () => super(); } } }',
        'class C { method(eval) {} }',
        'class C { method(arguments) {} }',
        'class C { method(value, value) {} }',
        'class C { method() { var eval; } }',
        'class C { field = 1; }',
        'class C { #private; }',
        'class C { static {} }',
        'class C { method() { return new.target; } }',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
        assertThrows(() => parseEval(source), SyntaxError);
      }
    },
  },
  {
    name: 'custom parser class ASTs admit only exact recursive class and method shapes',
    run() {
      /** @returns {any} */
      function functionValue() {
        return {
          type: 'FunctionExpression',
          id: null,
          params: [],
          generator: false,
          async: false,
          expression: false,
          body: { type: 'BlockStatement', body: [] },
        };
      }

      /** @returns {any} */
      function method() {
        return {
          type: 'MethodDefinition',
          key: { type: 'Identifier', name: 'method' },
          computed: false,
          static: false,
          kind: 'method',
          value: functionValue(),
        };
      }

      /** @param {any} expression */
      function programFor(expression) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [{ type: 'ExpressionStatement', expression }],
        };
      }

      const valid = {
        type: 'ClassExpression',
        id: null,
        superClass: null,
        body: { type: 'ClassBody', body: [method()] },
      };
      assertSame(
        parseScript('', { parse: () => programFor(valid) }).type,
        'Program',
      );

      const malformed = [
        { ...valid, body: { type: 'ClassBody', body: method() } },
        { ...valid, body: { type: 'BlockStatement', body: [] } },
        { ...valid, id: { type: 'Identifier', name: 'eval' } },
        {
          ...valid,
          body: {
            type: 'ClassBody',
            body: [{ ...method(), static: 'false' }],
          },
        },
        {
          ...valid,
          body: {
            type: 'ClassBody',
            body: [{ ...method(), kind: 'field' }],
          },
        },
      ];

      for (const expression of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => programFor(expression) }),
          SyntaxError,
        );
      }

      const cyclic = {
        type: 'ClassExpression',
        id: null,
        superClass: null,
        body: { type: 'ClassBody', body: /** @type {any[]} */ ([]) },
      };
      cyclic.body.body.push(cyclic.body);
      assertThrows(
        () => parseScript('', { parse: () => programFor(cyclic) }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom class heritage expressions enforce strict function parameter errors',
    run() {
      assertThrows(
        () => parseScript('class C extends (function(a, a) {}) {}'),
        SyntaxError,
      );

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ClassDeclaration',
            id: { type: 'Identifier', name: 'C' },
            superClass: {
              type: 'FunctionExpression',
              id: null,
              params: [
                { type: 'Identifier', name: 'a' },
                { type: 'Identifier', name: 'a' },
              ],
              generator: false,
              async: false,
              expression: false,
              body: { type: 'BlockStatement', body: [] },
            },
            body: { type: 'ClassBody', body: [] },
          },
        ],
      };

      assertParserAndEvaluatorSyntaxError(program);
    },
  },
  {
    name: 'custom class methods reject WithStatement in their strict context',
    run() {
      assertThrows(
        () => parseScript('class C { method() { with ({}) {} } }'),
        SyntaxError,
      );

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ClassDeclaration',
            id: { type: 'Identifier', name: 'C' },
            superClass: null,
            body: {
              type: 'ClassBody',
              body: [
                {
                  type: 'MethodDefinition',
                  key: { type: 'Identifier', name: 'method' },
                  computed: false,
                  static: false,
                  kind: 'method',
                  value: {
                    type: 'FunctionExpression',
                    id: null,
                    params: [],
                    generator: false,
                    async: false,
                    expression: false,
                    body: {
                      type: 'BlockStatement',
                      body: [
                        {
                          type: 'WithStatement',
                          object: {
                            type: 'ObjectExpression',
                            properties: [],
                          },
                          body: { type: 'EmptyStatement' },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      };

      assertParserAndEvaluatorSyntaxError(program);
    },
  },
  {
    name: 'custom parser class expressions require supported expression edges',
    run() {
      /** @returns {any} */
      function classExpression() {
        return {
          type: 'ClassExpression',
          id: null,
          superClass: null,
          body: { type: 'ClassBody', body: [] },
        };
      }

      /** @param {readonly any[]} body */
      function programFor(body) {
        return {
          type: 'Program',
          sourceType: 'script',
          body,
        };
      }

      const malformed = [
        programFor([classExpression()]),
        programFor([
          {
            type: 'BlockStatement',
            body: [classExpression()],
          },
        ]),
        programFor([
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value: 0 },
            unexpectedExpression: classExpression(),
          },
        ]),
        programFor([
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value: 0 },
            nestedUnexpectedExpressions: [[classExpression()]],
          },
        ]),
        programFor([
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value: 0 },
            unexpectedExpression: {
              type: 'ArrayExpression',
              elements: [classExpression()],
            },
          },
        ]),
      ];

      for (const program of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => program }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'custom parser rejects non-class expression wrappers under arbitrary AST fields',
    run() {
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value: 0 },
            unexpectedExpression: {
              type: 'ArrayExpression',
              elements: [
                {
                  type: 'CallExpression',
                  callee: { type: 'Identifier', name: 'call' },
                  arguments: [],
                },
              ],
            },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'nested class expressions remain valid on ordinary expression edges',
    run() {
      const valid = [
        'var classes = [class {}];',
        'call(class {});',
        'condition ? class {} : class {};',
        'target = class {};',
      ];

      for (const source of valid) {
        assertSame(parseScript(source).type, 'Program', source);
      }
    },
  },
  {
    name: 'custom parser rejects a decorated array presented as an AST node',
    run() {
      const decorated = /** @type {any} */ ([]);
      decorated.type = 'ClassExpression';
      decorated.id = null;
      decorated.superClass = null;
      decorated.body = { type: 'ClassBody', body: [] };

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value: 0 },
            unexpectedExpression: decorated,
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser rejects nested arrays in expression child lists',
    run() {
      /** @returns {any} */
      function classExpression() {
        return {
          type: 'ClassExpression',
          id: null,
          superClass: null,
          body: { type: 'ClassBody', body: [] },
        };
      }

      /** @param {any} expression */
      function programFor(expression) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [{ type: 'ExpressionStatement', expression }],
        };
      }

      const element = classExpression();
      const argument = classExpression();
      const malformed = [
        {
          type: 'ArrayExpression',
          elements: [element, [element]],
        },
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'call' },
          arguments: [argument, [argument]],
        },
      ];

      for (const expression of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => programFor(expression) }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'custom parser accepts class expressions in direct expression child lists',
    run() {
      /** @returns {any} */
      function classExpression() {
        return {
          type: 'ClassExpression',
          id: null,
          superClass: null,
          body: { type: 'ClassBody', body: [] },
        };
      }

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'ArrayExpression',
              elements: [classExpression()],
            },
          },
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'call' },
              arguments: [classExpression()],
            },
          },
        ],
      };

      assertSame(parseScript('', { parse: () => program }).type, 'Program');
    },
  },
  {
    name: 'a cyclic custom metadata array terminates without becoming an AST node',
    run() {
      const metadata = /** @type {any[]} */ ([]);
      metadata.push(metadata);

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: { type: 'Literal', value: 0 },
            metadata,
          },
        ],
      };

      assertSame(parseScript('', { parse: () => program }).type, 'Program');
    },
  },
  {
    name: 'custom parser rejects AST nodes hidden on extra fields and metadata containers',
    run() {
      /** @returns {any} */
      function hiddenBlock() {
        return { type: 'BlockStatement', body: [] };
      }

      /** @param {Record<string, unknown>} extra */
      function program(extra) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [{ type: 'BlockStatement', body: [], ...extra }],
        };
      }

      const malformedPrograms = [
        program({ hidden: hiddenBlock() }),
        program({ metadata: { hidden: hiddenBlock() } }),
        program({ metadata: [{ nested: hiddenBlock() }] }),
      ];

      for (const malformed of malformedPrograms) {
        assertParserAndEvaluatorSyntaxError(malformed);
      }
    },
  },
  {
    name: 'custom parser rejects post-ES2015 class metadata even when empty',
    run() {
      /** @returns {any} */
      function functionValue() {
        return {
          type: 'FunctionExpression',
          id: null,
          params: [],
          generator: false,
          async: false,
          expression: false,
          body: { type: 'BlockStatement', body: [] },
        };
      }

      /** @param {Record<string, unknown>} [extra={}] */
      function method(extra = {}) {
        return {
          type: 'MethodDefinition',
          key: { type: 'Identifier', name: 'method' },
          computed: false,
          static: false,
          kind: 'method',
          value: functionValue(),
          ...extra,
        };
      }

      /** @param {readonly any[]} [body=[method()]] */
      function classExpression(body = [method()]) {
        return {
          type: 'ClassExpression',
          id: null,
          superClass: null,
          body: { type: 'ClassBody', body },
        };
      }

      /** @param {any} expression */
      function programFor(expression) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [{ type: 'ExpressionStatement', expression }],
        };
      }

      const accepted = {
        ...classExpression([method({ decorators: undefined })]),
        decorators: undefined,
      };
      assertSame(
        parseScript('', { parse: () => programFor(accepted) }).type,
        'Program',
      );

      const malformed = [
        { ...classExpression(), decorators: [] },
        { ...classExpression(), abstract: false },
        { ...classExpression(), superTypeArguments: [] },
        classExpression([method({ decorators: [] })]),
        classExpression([method({ abstract: false })]),
        classExpression([method({ typeParameters: [] })]),
      ];

      for (const expression of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => programFor(expression) }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'nested functions block derived super calls while constructor arrows retain them',
    run() {
      assertThrows(
        () =>
          parseScript(
            'class Base {} class C extends Base { constructor() { function nested() { return () => super(); } } }',
          ),
        SyntaxError,
      );
      assertSame(
        parseScript(
          'class Base {} class C extends Base { constructor() { return (() => super())(); } }',
        ).type,
        'Program',
      );

      /** @param {readonly any[]} body */
      function functionValue(body) {
        return {
          type: 'FunctionExpression',
          id: null,
          params: [],
          generator: false,
          async: false,
          expression: false,
          body: { type: 'BlockStatement', body },
        };
      }

      /** @returns {any} */
      function superArrow() {
        return {
          type: 'ArrowFunctionExpression',
          id: null,
          params: [],
          generator: false,
          async: false,
          expression: true,
          body: {
            type: 'CallExpression',
            callee: { type: 'Super' },
            arguments: [],
          },
        };
      }

      /** @param {readonly any[]} body */
      function derivedConstructor(body) {
        return {
          type: 'MethodDefinition',
          key: { type: 'Identifier', name: 'constructor' },
          computed: false,
          static: false,
          kind: 'constructor',
          value: functionValue(body),
        };
      }

      /** @param {readonly any[]} constructorBody */
      function derivedClass(constructorBody) {
        return {
          type: 'ClassExpression',
          id: null,
          superClass: { type: 'Identifier', name: 'Base' },
          body: {
            type: 'ClassBody',
            body: [derivedConstructor(constructorBody)],
          },
        };
      }

      /** @param {any} expression */
      function programFor(expression) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [{ type: 'ExpressionStatement', expression }],
        };
      }

      const directArrow = derivedClass([
        {
          type: 'ReturnStatement',
          argument: superArrow(),
        },
      ]);
      assertSame(
        parseScript('', { parse: () => programFor(directArrow) }).type,
        'Program',
      );

      const nestedFunctionArrow = derivedClass([
        {
          type: 'FunctionDeclaration',
          id: { type: 'Identifier', name: 'nested' },
          params: [],
          generator: false,
          async: false,
          expression: false,
          body: {
            type: 'BlockStatement',
            body: [
              {
                type: 'ReturnStatement',
                argument: superArrow(),
              },
            ],
          },
        },
      ]);
      assertThrows(
        () => parseScript('', { parse: () => programFor(nestedFunctionArrow) }),
        SyntaxError,
      );
    },
  },
  {
    name: 'duplicate static __proto__ properties remain an object-literal early error',
    run() {
      const source = 'var object = { __proto__: first, __proto__: second };';

      assertThrows(() => parseScript(source), SyntaxError);
      assertThrows(() => parseEval(source), SyntaxError);
    },
  },
  {
    name: 'custom parser object expressions admit only exact enhanced property shapes',
    run() {
      /**
       * @param {readonly any[]} [params=[]]
       * @returns {any}
       */
      function functionValue(params = []) {
        return {
          type: 'FunctionExpression',
          id: null,
          params,
          generator: false,
          async: false,
          expression: false,
          body: { type: 'BlockStatement', body: [] },
        };
      }

      /** @returns {any} */
      function plainProperty() {
        return {
          type: 'Property',
          kind: 'init',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: 'value' },
          value: { type: 'Literal', value: 1 },
        };
      }

      /**
       * @param {any} properties
       * @returns {any}
       */
      function programFor(properties) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ExpressionStatement',
              expression: { type: 'ObjectExpression', properties },
            },
          ],
        };
      }

      const valid = [
        plainProperty(),
        {
          ...plainProperty(),
          computed: true,
          key: { type: 'Identifier', name: 'key' },
        },
        {
          type: 'Property',
          kind: 'init',
          computed: false,
          method: false,
          shorthand: true,
          key: { type: 'Identifier', name: 'value' },
          value: { type: 'Identifier', name: 'value' },
        },
        {
          type: 'Property',
          kind: 'init',
          computed: false,
          method: true,
          shorthand: false,
          key: { type: 'Identifier', name: 'method' },
          value: functionValue(),
        },
        {
          type: 'Property',
          kind: 'get',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: 'value' },
          value: functionValue(),
        },
        {
          type: 'Property',
          kind: 'set',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: 'value' },
          value: functionValue([{ type: 'Identifier', name: 'next' }]),
        },
      ];

      for (const property of valid) {
        assertSame(
          parseScript('', { parse: () => programFor([property]) }).type,
          'Program',
        );
      }

      const malformed = [
        [[plainProperty()]],
        { ...plainProperty(), computed: 'false' },
        {
          ...plainProperty(),
          computed: true,
          key: { type: 'Literal', value: 'key' },
          value: { type: 'BogusExpression' },
        },
        {
          ...plainProperty(),
          shorthand: true,
          value: { type: 'Identifier', name: 'other' },
        },
        {
          ...plainProperty(),
          method: true,
          value: { type: 'Literal', value: 1 },
        },
        {
          ...plainProperty(),
          kind: 'get',
          value: functionValue([{ type: 'Identifier', name: 'value' }]),
        },
      ];

      for (const property of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => programFor([property]) }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'custom parser rejects an unknown node nested in a computed object property key',
    run() {
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'ObjectExpression',
              properties: [
                {
                  type: 'Property',
                  kind: 'init',
                  computed: true,
                  method: false,
                  shorthand: false,
                  key: {
                    type: 'BinaryExpression',
                    operator: '+',
                    left: { type: 'Identifier', name: 'key' },
                    right: { type: 'BogusExpression' },
                  },
                  value: { type: 'Literal', value: 1 },
                },
              ],
            },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser rejects an unknown node nested in an object property value',
    run() {
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'ObjectExpression',
              properties: [
                {
                  type: 'Property',
                  kind: 'init',
                  computed: false,
                  method: false,
                  shorthand: false,
                  key: { type: 'Identifier', name: 'value' },
                  value: {
                    type: 'BinaryExpression',
                    operator: '+',
                    left: { type: 'Literal', value: 1 },
                    right: { type: 'BogusExpression' },
                  },
                },
              ],
            },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser rejects an unknown expression outside an object literal',
    run() {
      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: { type: 'BogusExpression' },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser object expressions retain the duplicate __proto__ early error',
    run() {
      /** @returns {any} */
      function protoProperty() {
        return {
          type: 'Property',
          kind: 'init',
          computed: false,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: '__proto__' },
          value: { type: 'Identifier', name: 'proto' },
        };
      }

      const program = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'ObjectExpression',
              properties: [protoProperty(), protoProperty()],
            },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'unsupported ES2015 constructs unreachable in a script are still rejected as SyntaxErrors from parseScript and parseEval',
    run() {
      const rejected = [
        'super.x;',
        'super();',
        'async function f() {}',
        'var af = async () => 1;',
        'await x;',
        "import x from 'y';",
        "import('x');",
        'export { a };',
        'export default 1;',
        "export * from 'y';",
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
        assertThrows(() => parseEval(source), SyntaxError);
      }
    },
  },
  {
    name: 'an unsupported construct rejects a dynamic Function at construction as a guest SyntaxError',
    run() {
      const realm = createRealm();

      for (const body of ['return function f() { return new.target; };']) {
        assertSame(
          evaluateScript(
            realm,
            'var name = "none";' +
              `try { new Function(${JSON.stringify(body)}) } ` +
              'catch (e) { name = e.constructor.name }' +
              'name;',
          ).value,
          'SyntaxError',
          body,
        );
      }
    },
  },
  {
    name: 'class parser nodes retain source positions',
    run() {
      const classNode = parseScript('  class C {}').body[0];
      assertSame(classNode.start, 2);
      assertSame(classNode.loc.start.line, 1);
      assertSame(classNode.loc.start.column, 2);
    },
  },
  {
    name: 'ES5 early errors survive the ES2015 grammar bump: strict with, strict octal, strict duplicate params, strict delete of an identifier, a reserved-word binding, the ES5.1-only regexp flags u and y, and a function declaration in an iteration body',
    run() {
      const rejected = [
        '"use strict"; with (this) {}',
        '"use strict"; var x = 010;',
        '"use strict"; function f(a, a) {}',
        '"use strict"; delete x;',
        'var enum;',
        '/x/u;',
        '/x/y;',
        'while (false) function f() {}',
        'for (x of []) function f() {}',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
    },
  },
  {
    name: 'ES2015 lexical static semantics are inherited from the vendored parser and kept, asserted through parseScript: redeclaration, let-name, missing initializer, and single-statement-position early errors',
    run() {
      const rejected = [
        'let x; let x;',
        'let y; var y;',
        'var z; let z;',
        'let let;',
        'const let = 1;',
        'const missingInitializer;',
        'try {} catch (e) { let e; }',
        'function shadow(a) { let a; }',
        'for (let i = 0;;) { var i; }',
        'switch (this) { case 1: let x; break; default: let x; }',
        'if (this) let x = 1;',
        'while (false) let x = 1;',
        'label: let x = 1;',
        '"use strict"; let eval = 1;',
        '"use strict"; let arguments = 1;',
      ];

      for (const source of rejected) {
        assertThrows(() => parseScript(source), SyntaxError);
      }
    },
  },
  {
    name: 'a nested-block lexical declaration evaluates instead of raising UnsupportedNodeError',
    run() {
      const realm = createRealm();
      assertSame(evaluateScript(realm, '{ let x = 1; x; }').value, 1);
    },
  },
  {
    name: 'a top-level lexical declaration in eval evaluates and does not leak to the caller',
    run() {
      const realm = createRealm();
      assertSame(
        evaluateScript(realm, 'eval("let y = 41; y + 1;");').value,
        42,
      );
      assertSame(evaluateScript(realm, 'typeof y;').value, 'undefined');
    },
  },
  {
    name: 'destructuring declarations assignments and loop heads are accepted',
    run() {
      parseScript('var {x: y} = value; [a, ...rest] = values;');
      parseScript('let [a, {b = 1}] = values; const {c: [d]} = value;');
      parseScript(
        'for (let [i] = values; i; [i] = next) {} for ({x: y} in object) {} for (const [a, b] of pairs) {}',
      );
    },
  },
  {
    name: 'object rest and invalid array rest placement remain rejected',
    run() {
      assertThrows(() => parseScript('var {...rest} = value;'), SyntaxError);
      assertThrows(
        () => parseScript('var [a, ...rest, last] = value;'),
        SyntaxError,
      );
    },
  },
  {
    name: 'ordinary functions accept default rest and destructuring parameters',
    run() {
      parseScript('function f({x}, [y], z = 1, ...rest) {}');
      parseScript('(function ({x: y = 1}, [z, ...tail]) {})');
    },
  },
  {
    name: 'non-simple parameter early errors and sloppy duplicate rules are retained',
    run() {
      assertThrows(
        () => parseScript('function f(a = 1) { "use strict"; }'),
        SyntaxError,
      );
      assertThrows(() => parseScript('function f(a = 1, a) {}'), SyntaxError);
      parseScript('function f(a, a) {}');
    },
  },
  {
    name: 'own strict directives reject duplicate simple parameters from source and custom ASTs',
    run() {
      assertThrows(
        () => parseScript('function f(a, a) { "use strict"; }'),
        SyntaxError,
      );

      const parameters = [
        { type: 'Identifier', name: 'a' },
        { type: 'Identifier', name: 'a' },
      ];
      const strictProgram = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { type: 'Identifier', name: 'f' },
            params: parameters,
            generator: false,
            async: false,
            expression: false,
            body: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'ExpressionStatement',
                  expression: { type: 'Literal', value: 'use strict' },
                  directive: 'use strict',
                },
              ],
            },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => strictProgram }),
        SyntaxError,
      );

      const sloppyProgram = {
        ...strictProgram,
        body: [
          {
            ...strictProgram.body[0],
            body: { type: 'BlockStatement', body: [] },
          },
        ],
      };

      assertSame(
        parseScript('', { parse: () => sloppyProgram }).type,
        'Program',
      );
    },
  },
  {
    name: 'custom async for-of ASTs reject while ordinary for-of remains supported',
    run() {
      const asyncForOf = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ForOfStatement',
            await: true,
            left: {
              type: 'VariableDeclaration',
              kind: 'var',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'value' },
                  init: null,
                },
              ],
            },
            right: { type: 'ArrayExpression', elements: [] },
            body: { type: 'EmptyStatement' },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => asyncForOf }),
        SyntaxError,
      );
      const synchronousForOf = {
        ...asyncForOf,
        body: [{ ...asyncForOf.body[0], await: false }],
      };
      const withoutAwait = { ...synchronousForOf.body[0] };
      Reflect.deleteProperty(withoutAwait, 'await');
      const absentAwaitForOf = {
        ...synchronousForOf,
        body: [withoutAwait],
      };

      assertSame(
        parseScript('', { parse: () => synchronousForOf }).type,
        'Program',
      );
      assertSame(
        parseScript('', { parse: () => absentAwaitForOf }).type,
        'Program',
      );
      for (const awaitValue of [undefined, null, 0, true]) {
        const malformedForOf = {
          ...synchronousForOf,
          body: [{ ...synchronousForOf.body[0], await: awaitValue }],
        };

        assertThrows(
          () => parseScript('', { parse: () => malformedForOf }),
          SyntaxError,
        );
      }

      assertSame(parseScript('for (var value of []) {}').type, 'Program');
    },
  },
  {
    name: 'generator parameter syntax is accepted while async functions remain unsupported',
    run() {
      assertSame(parseScript('function* g(a = 1) {}').type, 'Program');

      for (const source of ['async function f(a = 1) {}']) {
        assertThrows(() => parseScript(source), SyntaxError);
      }

      parseScript('(a = 1, ...rest) => ({ a, rest });');
      parseScript('value => { return value; };');
    },
  },
  {
    name: 'arrows expose exact supported parser shapes and reject malformed custom variants',
    run() {
      const concise = parseScript(
        'var fn = (first = 1, ...rest) => ({ first: first, rest: rest });',
      ).body[0].declarations[0].init;
      const block = parseScript('var fn = value => { return value; };').body[0]
        .declarations[0].init;

      assertSame(concise.type, 'ArrowFunctionExpression');
      assertSame(concise.async, undefined);
      assertSame(concise.generator, false);
      assertSame(concise.expression, true);
      assertSame(concise.body.type, 'ObjectExpression');
      assertSame(block.expression, false);
      assertSame(block.body.type, 'BlockStatement');

      /** @param {any} arrow */
      function programFor(arrow) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ExpressionStatement',
              expression: arrow,
            },
          ],
        };
      }

      const malformed = [
        { ...concise, async: true },
        { ...concise, generator: true },
        { ...concise, expression: false },
        { ...block, expression: true },
        { ...concise, params: {} },
        { ...concise, body: { type: 'BogusExpression' } },
        {
          ...block,
          params: [
            { type: 'Identifier', name: 'duplicate' },
            { type: 'Identifier', name: 'duplicate' },
          ],
        },
        {
          ...concise,
          params: [],
          body: {
            type: 'MemberExpression',
            object: { type: 'Super' },
            property: { type: 'Identifier', name: 'value' },
            computed: false,
          },
        },
      ];

      for (const arrow of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => programFor(arrow) }),
          SyntaxError,
        );
      }

      assertThrows(
        () => parseScript('var fn = () => super.value;'),
        SyntaxError,
      );
      assertThrows(
        () => parseScript('var fn = (value = 1) => { "use strict"; };'),
        SyntaxError,
      );
      assertThrows(
        () => parseScript('var fn = (value, value) => value;'),
        SyntaxError,
      );
    },
  },
  {
    name: 'malformed custom arrow and ordinary function parameter elements are syntax errors',
    run() {
      const arrow = parseScript('var fn = value => value;').body[0]
        .declarations[0].init;
      const functionExpression = parseScript(
        '(function (value) { return value; });',
      ).body[0].expression;

      /** @param {any} expression */
      function programFor(expression) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ExpressionStatement',
              expression,
            },
          ],
        };
      }

      for (const params of [[{}], [null]]) {
        assertThrows(
          () =>
            parseScript('', {
              parse: () => programFor({ ...arrow, params }),
            }),
          SyntaxError,
        );
        assertThrows(
          () =>
            parseScript('', {
              parse: () => programFor({ ...functionExpression, params }),
            }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'custom function parameter properties require exact destructuring shapes',
    run() {
      const arrow = parseScript('var fn = value => value;').body[0]
        .declarations[0].init;
      const functionExpression = parseScript(
        '(function (value) { return value; });',
      ).body[0].expression;

      /** @param {any} expression */
      function programFor(expression) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ExpressionStatement',
              expression,
            },
          ],
        };
      }

      const malformedProperties = [
        {
          type: 'Property',
          kind: 'init',
          computed: true,
          method: false,
          shorthand: false,
          key: null,
          value: { type: 'Identifier', name: 'value' },
        },
        {
          type: 'Property',
          kind: 'init',
          computed: false,
          method: false,
          shorthand: true,
          key: { type: 'Identifier', name: 'key' },
          value: { type: 'Identifier', name: 'value' },
        },
        {
          type: 'Property',
          kind: 'init',
          computed: null,
          method: false,
          shorthand: false,
          key: { type: 'Identifier', name: 'key' },
          value: { type: 'Identifier', name: 'value' },
        },
        {
          type: 'Property',
          kind: 'get',
          computed: false,
          method: true,
          shorthand: false,
          key: { type: 'Identifier', name: 'key' },
          value: { type: 'Identifier', name: 'value' },
        },
      ];

      for (const property of malformedProperties) {
        const params = [
          {
            type: 'ObjectPattern',
            properties: [property],
          },
        ];

        for (const expression of [arrow, functionExpression]) {
          const error = /** @type {any} */ (
            assertThrows(
              () =>
                parseScript('', {
                  parse: () => programFor({ ...expression, params }),
                }),
              SyntaxError,
            )
          );

          assertSame(error.name, 'SyntaxError');
        }
      }

      const unknownKeyError = /** @type {any} */ (
        assertThrows(
          () =>
            parseScript('', {
              parse: () =>
                programFor({
                  ...arrow,
                  params: [
                    {
                      type: 'ObjectPattern',
                      properties: [
                        {
                          type: 'Property',
                          kind: 'init',
                          computed: true,
                          method: false,
                          shorthand: false,
                          key: {
                            type: 'BinaryExpression',
                            operator: '+',
                            left: { type: 'BogusExpression' },
                            right: { type: 'Identifier', name: 'key' },
                          },
                          value: { type: 'Identifier', name: 'value' },
                        },
                      ],
                    },
                  ],
                }),
            }),
          SyntaxError,
        )
      );

      if (
        !unknownKeyError.message.includes(
          'unsupported AST node type BogusExpression',
        )
      ) {
        throw new Error(
          `Expected generic unknown-node rejection, got ${unknownKeyError.message}`,
        );
      }

      parseScript('function ordinary({[key]: value}) {}');
      parseScript('({[key]: value}) => value;');
    },
  },
  {
    name: 'super is only the direct object of a member reference in methods and lexical arrows',
    run() {
      parseScript(
        'var object = { method() { return () => (() => super.value)(); } };',
      );
      parseScript('var object = { method() { return super[key]; } };');

      /** @param {any} argument */
      function programForMethodReturn(argument) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'VariableDeclaration',
              kind: 'var',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'object' },
                  init: {
                    type: 'ObjectExpression',
                    properties: [
                      {
                        type: 'Property',
                        key: { type: 'Identifier', name: 'method' },
                        value: {
                          type: 'FunctionExpression',
                          id: null,
                          params: [],
                          generator: false,
                          async: false,
                          expression: false,
                          body: {
                            type: 'BlockStatement',
                            body: [
                              {
                                type: 'ReturnStatement',
                                argument,
                              },
                            ],
                          },
                        },
                        kind: 'init',
                        method: true,
                        computed: false,
                        shorthand: false,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };
      }

      for (const argument of [
        {
          type: 'CallExpression',
          callee: { type: 'Super' },
          arguments: [],
        },
        {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'object' },
          property: { type: 'Super' },
          computed: false,
        },
        {
          type: 'MemberExpression',
          object: { type: 'Super' },
          property: null,
          computed: false,
        },
        {
          type: 'MemberExpression',
          object: { type: 'Super' },
          property: null,
          computed: true,
        },
        {
          type: 'MemberExpression',
          object: { type: 'Super' },
          property: { type: 'BogusExpression' },
          computed: true,
        },
      ]) {
        const error = /** @type {any} */ (
          assertThrows(
            () =>
              parseScript('', {
                parse: () => programForMethodReturn(argument),
              }),
            SyntaxError,
          )
        );

        assertSame(error.name, 'SyntaxError');

        if (argument.property?.type === 'BogusExpression') {
          if (
            !error.message.includes('unsupported AST node type BogusExpression')
          ) {
            throw new Error(
              `Expected generic unknown-node rejection, got ${error.message}`,
            );
          }
        }
      }
    },
  },
  {
    name: 'ordinary functions are lexical super boundaries for nested arrows',
    run() {
      /** @returns {any} */
      function superArrow() {
        return {
          type: 'ArrowFunctionExpression',
          id: null,
          params: [],
          generator: false,
          async: false,
          expression: true,
          body: {
            type: 'MemberExpression',
            object: { type: 'Super' },
            property: { type: 'Identifier', name: 'value' },
            computed: false,
          },
        };
      }

      /** @param {any[]} statements */
      function programForMethodBody(statements) {
        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'VariableDeclaration',
              kind: 'var',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'object' },
                  init: {
                    type: 'ObjectExpression',
                    properties: [
                      {
                        type: 'Property',
                        key: { type: 'Identifier', name: 'method' },
                        value: {
                          type: 'FunctionExpression',
                          id: null,
                          params: [],
                          generator: false,
                          async: false,
                          expression: false,
                          body: { type: 'BlockStatement', body: statements },
                        },
                        kind: 'init',
                        method: true,
                        computed: false,
                        shorthand: false,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };
      }

      const functionExpression = {
        type: 'FunctionExpression',
        id: null,
        params: [],
        generator: false,
        async: false,
        expression: false,
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: superArrow(),
            },
          ],
        },
      };
      const functionDeclaration = {
        type: 'FunctionDeclaration',
        id: { type: 'Identifier', name: 'nested' },
        params: [],
        generator: false,
        async: false,
        expression: false,
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: superArrow(),
            },
          ],
        },
      };

      assertThrows(
        () =>
          parseScript('', {
            parse: () =>
              programForMethodBody([
                {
                  type: 'ReturnStatement',
                  argument: functionExpression,
                },
              ]),
          }),
        SyntaxError,
      );
      assertThrows(
        () =>
          parseScript('', {
            parse: () => programForMethodBody([functionDeclaration]),
          }),
        SyntaxError,
      );
    },
  },
  {
    name: 'spread is accepted only as a direct array element or call or construction argument',
    run() {
      const accepted = [
        'var list = [...values];',
        'f(...values);',
        'new C(...values);',
      ];

      for (const source of accepted) {
        assertSame(parseScript(source).type, 'Program', source);
        assertSame(parseEval(source).type, 'Program', source);
      }

      /** @type {{ type: string, key: string }[]} */
      const supportedParents = [
        { type: 'ArrayExpression', key: 'elements' },
        { type: 'CallExpression', key: 'arguments' },
        { type: 'NewExpression', key: 'arguments' },
      ];
      /** @type {{ name: string, value: (spread: any) => any }[]} */
      const malformedValues = [
        { name: 'a direct spread node', value: (spread) => spread },
        { name: 'a nested array', value: (spread) => [[spread]] },
      ];
      /** @returns {any} */
      const createSpread = () => ({
        type: 'SpreadElement',
        argument: { type: 'Identifier', name: 'values' },
      });
      /**
       * @param {{ type: string, key: string }} parent
       * @param {any} value
       * @returns {any}
       */
      function createProgram(parent, value) {
        const expression =
          parent.type === 'ArrayExpression'
            ? { type: parent.type, [parent.key]: value }
            : {
                type: parent.type,
                callee: { type: 'Identifier', name: 'f' },
                [parent.key]: value,
              };

        return {
          type: 'Program',
          sourceType: 'script',
          body: [
            {
              type: 'ExpressionStatement',
              expression,
            },
          ],
        };
      }

      for (const parent of supportedParents) {
        const allowedProgram = createProgram(parent, [createSpread()]);
        assertSame(
          parseScript('', { parse: () => allowedProgram }).type,
          'Program',
        );

        for (const malformed of malformedValues) {
          const program = createProgram(
            parent,
            malformed.value(createSpread()),
          );

          assertThrows(
            () => parseScript('', { parse: () => program }),
            SyntaxError,
          );
        }
      }

      const rejectedProgram = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'ObjectExpression',
              properties: [createSpread()],
            },
          },
        ],
      };
      assertThrows(
        () => parseScript('', { parse: () => rejectedProgram }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom parser patterns reject invalid binding and assignment leaves',
    run() {
      const invalidBinding = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: {
                  type: 'ArrayPattern',
                  elements: [
                    {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'object' },
                      property: { type: 'Identifier', name: 'value' },
                      computed: false,
                    },
                  ],
                },
                init: { type: 'Identifier', name: 'source' },
              },
            ],
          },
        ],
      };
      const invalidAssignment = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'ExpressionStatement',
            expression: {
              type: 'AssignmentExpression',
              operator: '=',
              left: {
                type: 'ArrayPattern',
                elements: [{ type: 'Literal', value: 1 }],
              },
              right: { type: 'Identifier', name: 'source' },
            },
          },
        ],
      };
      const invalidRootDefault = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: {
                  type: 'AssignmentPattern',
                  left: { type: 'Identifier', name: 'value' },
                  right: { type: 'Literal', value: 1 },
                },
                init: { type: 'Identifier', name: 'source' },
              },
            ],
          },
        ],
      };
      const sharedRest = {
        type: 'RestElement',
        argument: { type: 'Identifier', name: 'rest' },
      };
      const invalidSharedRest = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: {
                  type: 'ArrayPattern',
                  elements: [sharedRest, sharedRest],
                },
                init: { type: 'Identifier', name: 'source' },
              },
            ],
          },
        ],
      };
      const invalidFunctionParameter = {
        type: 'Program',
        sourceType: 'script',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { type: 'Identifier', name: 'f' },
            params: [
              {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'object' },
                property: { type: 'Identifier', name: 'value' },
                computed: false,
              },
            ],
            generator: false,
            async: false,
            expression: false,
            body: { type: 'BlockStatement', body: [] },
          },
        ],
      };

      assertThrows(
        () => parseScript('', { parse: () => invalidBinding }),
        SyntaxError,
      );
      assertThrows(
        () => parseScript('', { parse: () => invalidAssignment }),
        SyntaxError,
      );
      assertThrows(
        () => parseScript('', { parse: () => invalidRootDefault }),
        SyntaxError,
      );
      assertThrows(
        () => parseScript('', { parse: () => invalidSharedRest }),
        SyntaxError,
      );
      assertThrows(
        () => parseScript('', { parse: () => invalidFunctionParameter }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom object patterns reject a bare identifier property entry',
    run() {
      const program = objectPatternProgram({
        type: 'Identifier',
        name: 'bare',
      });

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom object patterns reject a nested pattern property entry',
    run() {
      const program = objectPatternProgram({
        type: 'ArrayPattern',
        elements: [{ type: 'Identifier', name: 'nested' }],
      });

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom object patterns reject a noncomputed expression key',
    run() {
      const program = objectPatternProgram({
        type: 'Property',
        kind: 'init',
        computed: false,
        method: false,
        shorthand: false,
        key: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'object' },
          property: { type: 'Identifier', name: 'key' },
          computed: false,
        },
        value: { type: 'Identifier', name: 'value' },
      });

      assertThrows(
        () => parseScript('', { parse: () => program }),
        SyntaxError,
      );
    },
  },
  {
    name: 'template literals expose exact cooked, raw, and tail parser shapes',
    run() {
      const expression = parseScript('tag`a\\n${value}b`;').body[0].expression;

      assertSame(expression.type, 'TaggedTemplateExpression');
      assertSame(expression.tag.type, 'Identifier');
      assertSame(expression.quasi.type, 'TemplateLiteral');
      assertSame(expression.quasi.expressions.length, 1);
      assertSame(expression.quasi.expressions[0].type, 'Identifier');
      assertSame(expression.quasi.quasis.length, 2);
      assertSame(expression.quasi.quasis[0].type, 'TemplateElement');
      assertSame(expression.quasi.quasis[0].value.raw, 'a\\n');
      assertSame(expression.quasi.quasis[0].value.cooked, 'a\n');
      assertSame(expression.quasi.quasis[0].tail, false);
      assertSame(expression.quasi.quasis[1].value.raw, 'b');
      assertSame(expression.quasi.quasis[1].value.cooked, 'b');
      assertSame(expression.quasi.quasis[1].tail, true);
    },
  },
  {
    name: 'custom parser template ASTs reject malformed structures and unsupported nested nodes',
    run() {
      const malformed = [
        {
          type: 'TemplateLiteral',
          expressions: [],
          quasis: [],
        },
        {
          type: 'TemplateLiteral',
          expressions: [{ type: 'Literal', value: 1 }],
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: 'a', cooked: 'a' },
              tail: true,
            },
          ],
        },
        {
          type: 'TemplateLiteral',
          expressions: [],
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: 1, cooked: 'a' },
              tail: true,
            },
          ],
        },
        {
          type: 'TemplateLiteral',
          expressions: [],
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: 'a', cooked: 1 },
              tail: true,
            },
          ],
        },
        {
          type: 'TemplateLiteral',
          expressions: [{ type: 'BogusExpression' }],
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: 'a', cooked: 'a' },
              tail: false,
            },
            {
              type: 'TemplateElement',
              value: { raw: 'b', cooked: 'b' },
              tail: true,
            },
          ],
        },
        {
          type: 'TemplateLiteral',
          expressions: [],
          quasis: [
            {
              type: 'TemplateElement',
              value: { raw: 'a', cooked: 'a' },
              tail: false,
            },
          ],
        },
      ];

      for (const expression of malformed) {
        assertThrows(
          () => parseScript('', { parse: () => expressionProgram(expression) }),
          SyntaxError,
        );
      }
    },
  },
  {
    name: 'template AST nodes remain valid only in template positions while arrows and classes accept their supported forms',
    run() {
      assertThrows(
        () =>
          parseScript('', {
            parse: () =>
              expressionProgram({
                type: 'TemplateElement',
                value: { raw: 'x', cooked: 'x' },
                tail: true,
              }),
          }),
        SyntaxError,
      );
      assertSame(parseScript('() => `x`;').type, 'Program');
      assertSame(parseScript('class Example {}').type, 'Program');
    },
  },
];

/**
 * @param {any} program
 * @returns {void}
 */
function assertParserAndEvaluatorSyntaxError(program) {
  const parseError = /** @type {any} */ (
    assertThrows(() => parseScript('', { parse: () => program }), SyntaxError)
  );
  const evaluationError = /** @type {any} */ (
    assertThrows(
      () => evaluateScript(createRealm(), '', { parse: () => program }),
      SyntaxError,
    )
  );

  assertSame(parseError.name, 'SyntaxError');
  assertSame(evaluationError.name, 'SyntaxError');
}

/**
 * @param {any} expression
 * @returns {any}
 */
function expressionProgram(expression) {
  return {
    type: 'Program',
    sourceType: 'script',
    body: [{ type: 'ExpressionStatement', expression }],
  };
}

/**
 * @param {any} property
 * @returns {any}
 */
function objectPatternProgram(property) {
  return {
    type: 'Program',
    sourceType: 'script',
    body: [
      {
        type: 'VariableDeclaration',
        kind: 'var',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: {
              type: 'ObjectPattern',
              properties: [property],
            },
            init: { type: 'Identifier', name: 'source' },
          },
        ],
      },
    ],
  };
}

/**
 * Long enough to overflow a recursive AST walk on every host we run on,
 * while staying inside what Acorn itself accepts.
 */
const DEEP_MEMBER_CHAIN_LENGTH = 20000;

export default tests;
