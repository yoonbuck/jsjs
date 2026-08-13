import { assertSame } from './harness/assert.js';
import { parseScript } from '../src/parser.js';
import {
  boundNames,
  isConstantDeclaration,
  varDeclaredNames,
  varScopedDeclarations,
  lexicallyDeclaredNames,
  lexicallyScopedDeclarations,
  topLevelVarDeclaredNames,
  topLevelVarScopedDeclarations,
  topLevelLexicallyDeclaredNames,
  topLevelLexicallyScopedDeclarations,
} from '../src/evaluator/static-semantics.js';

/**
 * @param {string} source
 * @returns {any[]}
 */
function body(source) {
  return parseScript(source).body;
}

/**
 * @param {string} name
 * @param {'let' | 'const'} [kind]
 * @returns {any}
 */
function lexicalDeclaration(name, kind = 'let') {
  return {
    type: 'VariableDeclaration',
    kind,
    declarations: [
      {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name },
        init: null,
      },
    ],
  };
}

/**
 * @param {any} node
 * @returns {string}
 */
function tag(node) {
  return `${node.type}(${boundNames(node).join(',')})`;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  // ---------------------------------------------------------------------
  // boundNames
  // ---------------------------------------------------------------------
  {
    name: 'boundNames of an Identifier is its own name',
    run() {
      assertSame(
        JSON.stringify(boundNames({ type: 'Identifier', name: 'x' })),
        '["x"]',
      );
    },
  },
  {
    name: 'boundNames of a FunctionDeclaration is its own name',
    run() {
      const [declaration] = body('function f() {}');
      assertSame(JSON.stringify(boundNames(declaration)), '["f"]');
    },
  },
  {
    name: 'boundNames of a var VariableDeclaration is every declarator name, in source order',
    run() {
      const [declaration] = body('var a, b, c;');
      assertSame(JSON.stringify(boundNames(declaration)), '["a","b","c"]');
    },
  },
  {
    name: 'boundNames of a let/const VariableDeclaration is every declarator name, in source order',
    run() {
      const letNode = lexicalDeclaration('a');
      letNode.declarations.push({
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: 'b' },
        init: null,
      });
      assertSame(JSON.stringify(boundNames(letNode)), '["a","b"]');

      const constNode = lexicalDeclaration('c', 'const');
      assertSame(JSON.stringify(boundNames(constNode)), '["c"]');
    },
  },
  {
    name: 'boundNames of nested binding patterns preserves source order',
    run() {
      assertSame(
        boundNames({
          type: 'ArrayPattern',
          elements: [
            { type: 'Identifier', name: 'a' },
            {
              type: 'AssignmentPattern',
              left: {
                type: 'ObjectPattern',
                properties: [
                  {
                    type: 'Property',
                    kind: 'init',
                    computed: false,
                    key: { type: 'Identifier', name: 'x' },
                    value: { type: 'Identifier', name: 'b' },
                  },
                ],
              },
              right: { type: 'Literal', value: 1 },
            },
            {
              type: 'RestElement',
              argument: { type: 'Identifier', name: 'rest' },
            },
          ],
        }).join(','),
        'a,b,rest',
      );
    },
  },
  {
    name: 'boundNames of a ClassDeclaration is its own name',
    run() {
      assertSame(
        boundNames({
          type: 'ClassDeclaration',
          id: { type: 'Identifier', name: 'C' },
        }).join(','),
        'C',
      );
    },
  },

  // ---------------------------------------------------------------------
  // isConstantDeclaration
  // ---------------------------------------------------------------------
  {
    name: 'isConstantDeclaration is true only for a const VariableDeclaration',
    run() {
      assertSame(isConstantDeclaration(lexicalDeclaration('a', 'const')), true);
      assertSame(isConstantDeclaration(lexicalDeclaration('a', 'let')), false);
      assertSame(isConstantDeclaration(body('var a;')[0]), false);
      assertSame(isConstantDeclaration(body('function f() {}')[0]), false);
    },
  },

  // ---------------------------------------------------------------------
  // varDeclaredNames / varScopedDeclarations
  // ---------------------------------------------------------------------
  {
    name: 'varDeclaredNames descends through every ES5 var-hoisting container, in source order',
    run() {
      const statements = body(`
        { var a; }
        if (true) { var b; } else { var c; }
        while (false) { var d; }
        do { var e; } while (false);
        for (var f; false; ) {}
        for (var g in {}) {}
        try { var h; } catch (err) { var i; } finally { var j; }
        switch (1) { case 1: var k; break; }
        label: { var l; }
        with ({}) { var m; }
      `);

      assertSame(
        JSON.stringify(varDeclaredNames(statements)),
        '["a","b","c","d","e","f","g","h","i","j","k","l","m"]',
      );
    },
  },
  {
    name: 'varDeclaredNames stops at a function boundary',
    run() {
      const statements = body('var a; function f() { var b; } var c;');
      assertSame(JSON.stringify(varDeclaredNames(statements)), '["a","c"]');
    },
  },
  {
    name: 'varDeclaredNames preserves duplicate names in source order',
    run() {
      const statements = body('var a; { var a; }');
      assertSame(JSON.stringify(varDeclaredNames(statements)), '["a","a"]');
    },
  },
  {
    name: 'varScopedDeclarations excludes a nested FunctionDeclaration, at any depth',
    run() {
      const statements = body('{ function f() {} } var a;');
      const declarations = varScopedDeclarations(statements);

      assertSame(declarations.length, 1);
      assertSame(tag(declarations[0]), 'VariableDeclaration(a)');
    },
  },
  {
    name: 'varDeclaredNames excludes let/const declarations, at any depth',
    run() {
      const nestedLet = {
        type: 'BlockStatement',
        body: [lexicalDeclaration('x')],
      };
      const statements = [
        lexicalDeclaration('y', 'const'),
        nestedLet,
        body('var z;')[0],
      ];

      assertSame(JSON.stringify(varDeclaredNames(statements)), '["z"]');
      assertSame(varScopedDeclarations(statements).length, 1);
    },
  },
  {
    name: 'varScopedDeclarations returns VariableDeclaration nodes in source order',
    run() {
      const statements = body('var a; { var b; if (true) { var c; } }');
      const declarations = varScopedDeclarations(statements);

      assertSame(
        JSON.stringify(declarations.map(tag)),
        JSON.stringify([
          'VariableDeclaration(a)',
          'VariableDeclaration(b)',
          'VariableDeclaration(c)',
        ]),
      );
    },
  },

  // ---------------------------------------------------------------------
  // lexicallyDeclaredNames / lexicallyScopedDeclarations
  // ---------------------------------------------------------------------
  {
    name: 'lexicallyDeclaredNames collects let/const and FunctionDeclarations at this level only',
    run() {
      const [fn] = body('function f() {}');
      const nestedBlock = {
        type: 'BlockStatement',
        body: [lexicalDeclaration('inner')],
      };
      const statements = [
        lexicalDeclaration('outer', 'const'),
        fn,
        nestedBlock,
      ];

      assertSame(
        JSON.stringify(lexicallyDeclaredNames(statements)),
        '["outer","f"]',
      );
    },
  },
  {
    name: 'lexicallyDeclaredNames does not descend into nested blocks or other statement bodies',
    run() {
      const nestedIf = {
        type: 'IfStatement',
        test: { type: 'Literal', value: true },
        consequent: {
          type: 'BlockStatement',
          body: [lexicalDeclaration('inner')],
        },
        alternate: null,
      };

      assertSame(JSON.stringify(lexicallyDeclaredNames([nestedIf])), '[]');
      assertSame(lexicallyScopedDeclarations([nestedIf]).length, 0);
    },
  },
  {
    name: 'lexicallyDeclaredNames excludes var',
    run() {
      const statements = body('var a;');
      assertSame(JSON.stringify(lexicallyDeclaredNames(statements)), '[]');
    },
  },
  {
    name: 'lexicallyDeclaredNames collects a labelled FunctionDeclaration, including through a label chain',
    run() {
      const statements = body('label: function f() {}');
      assertSame(JSON.stringify(lexicallyDeclaredNames(statements)), '["f"]');

      const chained = body('a: b: c: function g() {}');
      assertSame(JSON.stringify(lexicallyDeclaredNames(chained)), '["g"]');
    },
  },
  {
    name: 'lexicallyDeclaredNames of a labelled non-function statement is empty',
    run() {
      const statements = body('label: { var a; }');
      assertSame(JSON.stringify(lexicallyDeclaredNames(statements)), '[]');
    },
  },
  {
    name: 'lexicallyScopedDeclarations returns declaration nodes in source order',
    run() {
      const [fn] = body('function f() {}');
      const statements = [
        lexicalDeclaration('a'),
        fn,
        lexicalDeclaration('b', 'const'),
      ];

      assertSame(
        JSON.stringify(lexicallyScopedDeclarations(statements).map(tag)),
        JSON.stringify([
          'VariableDeclaration(a)',
          'FunctionDeclaration(f)',
          'VariableDeclaration(b)',
        ]),
      );
    },
  },

  // ---------------------------------------------------------------------
  // topLevel variants
  // ---------------------------------------------------------------------
  {
    name: 'topLevelVarDeclaredNames treats a top-level FunctionDeclaration as var-scoped',
    run() {
      const statements = body('function f() {} var a;');
      assertSame(
        JSON.stringify(topLevelVarDeclaredNames(statements)),
        '["f","a"]',
      );
      assertSame(
        JSON.stringify(topLevelLexicallyDeclaredNames(statements)),
        '[]',
      );
    },
  },
  {
    name: 'topLevelVarScopedDeclarations excludes a block-nested FunctionDeclaration (ES2015 §13.2.10)',
    run() {
      const statements = body('{ function f() {} } var a;');
      const declarations = topLevelVarScopedDeclarations(statements);

      assertSame(
        JSON.stringify(declarations.map(tag)),
        JSON.stringify(['VariableDeclaration(a)']),
      );
      assertSame(JSON.stringify(topLevelVarDeclaredNames(statements)), '["a"]');
    },
  },
  {
    name: 'topLevelVarDeclaredNames follows a top-level label chain to a FunctionDeclaration',
    run() {
      const statements = body('a: b: function f() {}');
      assertSame(JSON.stringify(topLevelVarDeclaredNames(statements)), '["f"]');
    },
  },
  {
    name: 'topLevelLexicallyDeclaredNames excludes every FunctionDeclaration, direct or nested',
    run() {
      const statements = body('function f() {} { function g() {} }');
      const lexicalOnly = [lexicalDeclaration('y', 'const'), ...statements];

      assertSame(
        JSON.stringify(topLevelLexicallyDeclaredNames(lexicalOnly)),
        '["y"]',
      );
    },
  },
  {
    name: 'topLevelLexicallyDeclaredNames excludes a nested-block let/const',
    run() {
      const nestedBlock = {
        type: 'BlockStatement',
        body: [lexicalDeclaration('inner')],
      };
      const statements = [lexicalDeclaration('outer'), nestedBlock];

      assertSame(
        JSON.stringify(topLevelLexicallyDeclaredNames(statements)),
        '["outer"]',
      );
    },
  },
  {
    name: 'topLevelLexicallyScopedDeclarations returns declaration nodes in source order',
    run() {
      const statements = [
        lexicalDeclaration('a'),
        lexicalDeclaration('b', 'const'),
      ];

      assertSame(
        JSON.stringify(
          topLevelLexicallyScopedDeclarations(statements).map(tag),
        ),
        JSON.stringify(['VariableDeclaration(a)', 'VariableDeclaration(b)']),
      );
    },
  },

  // ---------------------------------------------------------------------
  // iterative depth
  // ---------------------------------------------------------------------
  {
    name: 'varDeclaredNames walks 20,000 nested blocks without host recursion',
    run() {
      const depth = 20000;
      let innermost = body('var deepest;')[0];
      let node = { type: 'BlockStatement', body: [innermost] };

      for (let i = 0; i < depth; i += 1) {
        node = { type: 'BlockStatement', body: [node] };
      }

      assertSame(JSON.stringify(varDeclaredNames([node])), '["deepest"]');
      assertSame(varScopedDeclarations([node]).length, 1);
    },
  },
  {
    name: 'topLevelVarScopedDeclarations walks 20,000 nested blocks without host recursion',
    run() {
      const depth = 20000;
      let node = {
        type: 'BlockStatement',
        body: body('var deepest;'),
      };

      for (let i = 0; i < depth; i += 1) {
        node = { type: 'BlockStatement', body: [node] };
      }

      const declarations = topLevelVarScopedDeclarations([node]);
      assertSame(declarations.length, 1);
      assertSame(tag(declarations[0]), 'VariableDeclaration(deepest)');
    },
  },
];

export default tests;
