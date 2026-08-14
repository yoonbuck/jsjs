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
    name: 'parseScript validates shared AST nodes in each parent context',
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
    name: 'each remaining reachable unsupported ES2015 construct is rejected by the pass from parseScript and parseEval',
    run() {
      const rejected = [
        'function* g() { yield 1; }',
        'var object = { *method() {} };',
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
        'class C { *method() {} }',
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
        {
          ...valid,
          body: {
            type: 'ClassBody',
            body: [
              {
                ...method(),
                value: { ...functionValue(), generator: true },
              },
            ],
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

      for (const body of ['return function* g() {};']) {
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
    name: 'generator and async forms remain unsupported around arrow parameters',
    run() {
      for (const source of [
        'function* g(a = 1) {}',
        'async function f(a = 1) {}',
      ]) {
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
