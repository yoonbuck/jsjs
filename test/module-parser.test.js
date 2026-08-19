import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm, parseModule } from '../src/index.js';
import { parseScript } from '../src/parser.js';
import { SourceTextModuleRecord } from '../src/runtime/module-record.js';

/** @type {readonly ('parse' | 'program')[]} */
const CUSTOM_MODULE_AST_ENTRIES = ['parse', 'program'];

/**
 * @param {'parse' | 'program'} entry
 * @param {any} ast
 * @returns {any}
 */
function parseCustomModule(entry, ast) {
  return entry === 'parse'
    ? parseModule('', { parse: () => ast })
    : parseModule('', { program: ast });
}

export default [
  {
    name: 'parseModule validates ES2015 module AST and extracts ordered entries',
    run() {
      const ast = parseModule(
        'import d, { x as y } from "a"; export { y as z }; export * from "b";',
      );
      assertSame(ast.sourceType, 'module');
      const record = new SourceTextModuleRecord({
        realm: createRealm(),
        identifier: 'root',
        ast,
      });
      assertSame(record.requestedModules.join(','), 'a,b');
      assertSame(record.importEntries[0].importName, 'default');
      assertSame(record.importEntries[1].localName, 'y');
      assertSame(record.indirectExportEntries[0].exportName, 'z');
      assertSame(record.indirectExportEntries[0].moduleRequest, 'a');
      assertSame(record.indirectExportEntries[0].importName, 'x');
      assertSame(record.starExportEntries[0].moduleRequest, 'b');
      assertSame(Object.isFrozen(record.requestedModules), true);
      assertSame(Object.isFrozen(record.importEntries[0]), true);
    },
  },
  {
    name: 'SourceTextModuleRecord keeps namespace-import exports local while named-import exports are indirect',
    run() {
      const record = new SourceTextModuleRecord({
        realm: createRealm(),
        identifier: 'root',
        ast: parseModule(`
          import * as namespaceName from "dep";
          import { value as namedName } from "dep";
          export { namespaceName as namespaceExport, namedName as namedExport };
        `),
      });

      assertSame(record.localExportEntries.length, 1);
      assertSame(record.localExportEntries[0].exportName, 'namespaceExport');
      assertSame(record.localExportEntries[0].localName, 'namespaceName');
      assertSame(record.indirectExportEntries.length, 1);
      assertSame(record.indirectExportEntries[0].exportName, 'namedExport');
      assertSame(record.indirectExportEntries[0].moduleRequest, 'dep');
      assertSame(record.indirectExportEntries[0].importName, 'value');
    },
  },
  {
    name: 'parseModule rejects foreign accessors and later module syntax',
    run() {
      assertThrows(
        () =>
          parseModule('export const x = 1;', {
            parse() {
              return {
                type: 'Program',
                sourceType: 'module',
                body: [],
                get loc() {
                  return null;
                },
              };
            },
          }),
        SyntaxError,
      );
      assertThrows(() => parseModule('import("a")'), Error);
      assertThrows(() => parseModule('export * as ns from "a"'), Error);
    },
  },
  {
    name: 'ordinary module parsing skips the untrusted descriptor graph scan while custom AST entry points reject accessors',
    run() {
      for (const customEntry of ['parse', 'program']) {
        const ast = parseModule('');
        let getterCalls = 0;

        Object.defineProperty(ast, 'body', {
          get() {
            getterCalls += 1;
            throw new Error('custom Program.body getter must not execute');
          },
          enumerable: true,
          configurable: true,
        });

        assertThrows(
          () =>
            customEntry === 'parse'
              ? parseModule('', { parse: () => ast })
              : parseModule('', { program: ast }),
          SyntaxError,
        );
        assertSame(getterCalls, 0, `${customEntry} AST getter stayed inert`);
      }

      const ownKeys = Reflect.ownKeys;
      let descriptorGraphScans = 0;

      Reflect.ownKeys = function countedOwnKeys(value) {
        descriptorGraphScans += 1;
        return ownKeys(value);
      };

      try {
        assertSame(parseModule('export const value = 1;').sourceType, 'module');
      } finally {
        Reflect.ownKeys = ownKeys;
      }

      assertSame(
        descriptorGraphScans,
        0,
        'trusted Acorn output must not enter the untrusted descriptor walk',
      );
    },
  },
  {
    name: 'parseModule snapshots custom AST graphs before validation',
    run() {
      const ast = parseScript('const preserved = 1;');
      ast.sourceType = 'module';
      const originalBody = ast.body;
      const parsed = parseModule('', { parse: () => ast });

      assertSame(parsed === ast, false);
      assertSame(ast.body, originalBody);
      assertSame(ast.body[0].type, 'VariableDeclaration');

      /** @type {any[]} */
      const body = [];
      Object.defineProperty(body, '0', {
        get() {
          return { type: 'EmptyStatement' };
        },
        enumerable: true,
        configurable: true,
      });
      const accessorAst = {
        type: 'Program',
        sourceType: 'module',
        body,
      };

      assertThrows(
        () => parseModule('', { parse: () => accessorAst }),
        SyntaxError,
      );
      assertSame(
        typeof Object.getOwnPropertyDescriptor(body, '0')?.get,
        'function',
      );
    },
  },
  {
    name: 'parseModule appends to an owned snapshot of a caller-supplied module Program',
    run() {
      const program = parseModule('export const existing = 1;');
      const result = parseModule('export const appended = 2;', { program });

      assertSame(result === program, false);
      assertSame(result.body === program.body, false);
      assertSame(program.body.length, 1);
      assertSame(result.body.length, 2);

      program.body[0].declaration.declarations[0].id.name = 'mutated';

      assertSame(
        result.body[0].declaration.declarations[0].id.name,
        'existing',
      );
    },
  },
  {
    name: 'custom module ASTs accept exact import and export shorthand aliases',
    run() {
      for (const [source, peerField] of [
        ['import { imported } from "dep";', 'imported'],
        ['const exported = 1; export { exported };', 'exported'],
      ]) {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          const ast = parseModule(source);
          const declaration = ast.body.find(
            (/** @type {any} */ node) =>
              Array.isArray(node.specifiers) && node.specifiers.length > 0,
          );
          const specifier = declaration.specifiers[0];

          assertSame(specifier.local, specifier[peerField]);
          assertSame(parseCustomModule(entry, ast).sourceType, 'module');
        }
      }
    },
  },
  {
    name: 'custom module entry points accept Acorn shared empty specifier arrays',
    run() {
      const program = parseModule('import "./a.js"; import "./b.js";');

      assertSame(program.body[0].specifiers, program.body[1].specifiers);

      for (const options of [{ program }, { parse: () => program }]) {
        const parsed = parseModule('', options);
        assertSame(parsed.body.length, 2);
      }
    },
  },
  {
    name: 'custom module AST shorthand handling stays limited to exact specifier aliases',
    run() {
      for (const source of [
        'import { imported as local } from "dep";',
        'const local = 1; export { local as publicName };',
      ]) {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          const ast = parseModule(source);
          const declaration = ast.body.find(
            (/** @type {any} */ node) =>
              Array.isArray(node.specifiers) && node.specifiers.length > 0,
          );
          const specifier = declaration.specifiers[0];

          assertSame(
            specifier.local === (specifier.imported ?? specifier.exported),
            false,
          );
          assertSame(parseCustomModule(entry, ast).sourceType, 'module');
        }
      }

      for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
        const ast = parseModule('export default (true ? 1 : 2);');
        ast.body[0].declaration.alternate = ast.body[0].declaration.consequent;
        const error = /** @type {any} */ (
          assertThrows(() => parseCustomModule(entry, ast), SyntaxError)
        );

        if (!error.message.includes('structural tree')) {
          throw new Error(`Expected structural tree rejection, got ${error}`);
        }
      }
    },
  },
  {
    name: 'custom module ASTs accept only neutral modern import and export-all fields',
    run() {
      /** @type {readonly [string, (declaration: any) => void][]} */
      const neutralFields = [
        [
          'import { imported as local } from "dep";',
          (/** @type {any} */ declaration) => {
            declaration.assertions = [];
            declaration.attributes = [];
          },
        ],
        [
          'export * from "dep";',
          (/** @type {any} */ declaration) => {
            declaration.exported = null;
            declaration.assertions = [];
            declaration.attributes = [];
          },
        ],
      ];

      for (const [source, decorate] of neutralFields) {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          const ast = parseModule(source);
          decorate(ast.body[0]);
          assertSame(parseCustomModule(entry, ast).sourceType, 'module');
        }
      }

      for (const field of ['assertions', 'attributes']) {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          const ast = parseModule('import { imported as local } from "dep";');
          ast.body[0][field] = [{}];
          assertThrows(() => parseCustomModule(entry, ast), SyntaxError);
        }
      }

      for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
        const ast = parseModule('export * from "dep";');
        ast.body[0].exported = { type: 'Identifier', name: 'namespace' };
        assertThrows(() => parseCustomModule(entry, ast), SyntaxError);
      }
    },
  },
  {
    name: 'parseModule options.parse normalizes engine AST validation failures',
    run() {
      const ast = parseModule('export const value = 1;');
      ast.body[0] = { type: 'Bogus' };
      const error = /** @type {any} */ (
        assertThrows(() => parseModule('', { parse: () => ast }), SyntaxError)
      );

      assertSame(error.name, 'SyntaxError');
      if (!error.message.includes('Bogus')) {
        throw new Error(`Expected Bogus-node diagnostic, got ${error}`);
      }
    },
  },
  {
    name: 'parseModule options.program normalizes engine Program shape failures',
    run() {
      const ast = parseModule('');
      ast.sourceType = 'script';
      const error = /** @type {any} */ (
        assertThrows(() => parseModule('', { program: ast }), SyntaxError)
      );

      assertSame(error.name, 'SyntaxError');
      if (!error.message.includes('module Program')) {
        throw new Error(`Expected module Program diagnostic, got ${error}`);
      }
    },
  },
  {
    name: 'parseModule rethrows custom parser implementation errors unchanged',
    run() {
      const parserError = new Error('custom parser failed');
      const thrown = assertThrows(
        () =>
          parseModule('', {
            parse() {
              throw parserError;
            },
          }),
        Error,
      );

      assertSame(thrown, parserError);
    },
  },
  {
    name: 'caller-supplied module Programs receive custom AST validation',
    run() {
      const missingExport = parseModule(
        'const present = 1; export { present };',
      );
      missingExport.body[1].specifiers[0].local.name = 'missing';
      assertThrows(
        () => parseModule('', { program: missingExport }),
        SyntaxError,
      );

      const structurallyInvalid = parseModule(
        'export default function kept(value) {}',
      );
      structurallyInvalid.body[0].declaration.id =
        structurallyInvalid.body[0].declaration.params[0];
      assertThrows(
        () => parseModule('', { program: structurallyInvalid }),
        SyntaxError,
      );

      const outsideCapability = parseModule('export default 1 + 2;');
      outsideCapability.body[0].declaration.operator = '**';
      assertThrows(
        () => parseModule('', { program: outsideCapability }),
        SyntaxError,
      );
    },
  },
  {
    name: 'parseModule rejects duplicate exported names from custom ASTs',
    run() {
      const ast = parseModule(
        'export const local = 1; export { local as alias };',
      );
      ast.body[1].specifiers[0].exported.name = 'local';

      assertThrows(
        () =>
          parseModule('', {
            parse() {
              return ast;
            },
          }),
        SyntaxError,
      );
    },
  },
  {
    name: 'parseModule rejects an unbound source-less export from a custom AST',
    run() {
      const ast = parseModule(
        'const present = 1; export { present as alias };',
      );
      ast.body[1].specifiers[0].local.name = 'missing';

      assertThrows(
        () =>
          parseModule('', {
            parse() {
              return ast;
            },
          }),
        SyntaxError,
      );
    },
  },
  {
    name: 'custom module local exports accept every declared and imported binding form',
    run() {
      const ast = parseModule(`
        var variableName;
        let lexicalName;
        function functionName() {}
        class ClassName {}
        import defaultName, { imported as importedName } from "dep";
        import * as namespaceName from "namespace";
        export {
          variableName as variableAlias,
          variableName as secondVariableAlias,
          lexicalName as lexicalAlias,
          functionName as functionAlias,
          ClassName as classAlias,
          defaultName as defaultAlias,
          importedName as importedAlias,
          namespaceName as namespaceAlias,
          laterName as laterAlias
        };
        const laterName = 1;
        export var exportedVariable;
        export { exportedVariable as exportedVariableAlias };
        export { remoteName as remoteAlias } from "remote";
        export * from "star";
      `);

      const parsed = parseModule('', { parse: () => ast });

      assertSame(parsed.body.length, 12);
    },
  },
  {
    name: 'parseModule rejects duplicate import and top-level bindings from custom ASTs',
    run() {
      const importCollision = parseModule(
        'import { imported as local } from "dep"; const declared = 1;',
      );
      importCollision.body[1].declarations[0].id.name = 'local';

      assertThrows(
        () =>
          parseModule('', {
            parse() {
              return importCollision;
            },
          }),
        SyntaxError,
      );

      const duplicateFunctions = parseModule(
        'function first() {} function second() {}',
      );
      duplicateFunctions.body[1].id.name = 'first';

      assertThrows(
        () =>
          parseModule('', {
            parse() {
              return duplicateFunctions;
            },
          }),
        SyntaxError,
      );

      const nestedVarCollision = parseModule(
        'if (true) var outer; let local = 1;',
      );
      nestedVarCollision.body[1].declarations[0].id.name = 'outer';

      assertThrows(
        () =>
          parseModule('', {
            parse() {
              return nestedVarCollision;
            },
          }),
        SyntaxError,
      );
    },
  },
  {
    name: 'parseModule rejects duplicate lexical declarations in nested custom AST scopes',
    run() {
      const ast = parseModule('{ let first; let second; }');
      ast.body[0].body[1].declarations[0].id.name = 'first';

      assertThrows(() => parseModule('', { parse: () => ast }), SyntaxError);
    },
  },
  {
    name: 'parseModule records named and anonymous default generator declarations',
    run() {
      for (const [source, localName] of [
        ['export default function* named() { yield 1; }', 'named'],
        ['export default function* () { yield 1; }', '*default*'],
      ]) {
        const ast = parseModule(source);
        const record = new SourceTextModuleRecord({
          realm: createRealm(),
          identifier: source,
          ast,
        });

        assertSame(ast.body[0].declaration.generator, true);
        assertSame(record.localExportEntries[0].localName, localName);
      }

      assertThrows(
        () => parseModule('export default async function* later() {}'),
        SyntaxError,
      );
    },
  },
  {
    name: 'parseModule accepts an identifier as a default-export expression',
    run() {
      const ast = parseModule('const value = 7; export default value;');

      assertSame(ast.body[1].declaration.type, 'Identifier');
      assertSame(ast.body[1].declaration.name, 'value');
    },
  },
  {
    name: 'custom module AST validation accepts a default-export identifier',
    run() {
      const ast = parseModule(
        'const value = 7; export default (value, value);',
      );
      ast.body[1].declaration = ast.body[1].declaration.expressions[0];

      const parsed = parseModule('', { parse: () => ast });

      assertSame(parsed.body[1].declaration.type, 'Identifier');
      assertSame(parsed.body[1].declaration.name, 'value');
    },
  },
  {
    name: 'SourceTextModuleRecord classifies ES2015 static entry forms',
    run() {
      const record = new SourceTextModuleRecord({
        realm: createRealm(),
        identifier: 'entries',
        ast: parseModule(`
          import defaultName from "default";
          import * as namespaceName from "namespace";
          import { original as local } from "named";
          export const first = 1, second = 2;
          export default function () {}
          export { local as renamed };
          export { sourceName as reexported } from "indirect";
        `),
      });

      assertSame(
        record.requestedModules.join(','),
        'default,namespace,named,indirect',
      );
      assertSame(record.importEntries[0].kind, 'named');
      assertSame(record.importEntries[0].importName, 'default');
      assertSame(record.importEntries[1].kind, 'namespace');
      assertSame(record.importEntries[1].localName, 'namespaceName');
      assertSame(record.importEntries[2].importName, 'original');
      assertSame(record.localExportEntries[0].exportName, 'first');
      assertSame(record.localExportEntries[1].localName, 'second');
      assertSame(record.localExportEntries[2].localName, '*default*');
      assertSame(record.localExportEntries[2].exportName, 'default');
      assertSame(record.localExportEntries.length, 3);
      assertSame(record.indirectExportEntries[0].exportName, 'renamed');
      assertSame(record.indirectExportEntries[0].moduleRequest, 'named');
      assertSame(record.indirectExportEntries[0].importName, 'original');
      assertSame(record.indirectExportEntries[1].moduleRequest, 'indirect');
      assertSame(record.indirectExportEntries[1].importName, 'sourceName');
      assertSame(Object.isFrozen(record.importEntries), true);
      assertSame(Object.isFrozen(record.localExportEntries), true);
      assertSame(Object.isFrozen(record.indirectExportEntries[0]), true);
      assertSame(Object.isFrozen(record.starExportEntries), true);
      assertSame(
        Object.keys(record.importEntries[0]).join(','),
        'moduleRequest,importName,localName,kind',
      );
      assertSame(
        Object.keys(record.localExportEntries[0]).join(','),
        'exportName,localName',
      );
      assertSame(Object.isFrozen(record.ast), false);
      assertThrows(() => record.getNamespace(), TypeError);

      for (const source of ['export default class {}', 'export default 1']) {
        const defaultRecord = new SourceTextModuleRecord({
          realm: createRealm(),
          identifier: source,
          ast: parseModule(source),
        });
        assertSame(defaultRecord.localExportEntries[0].localName, '*default*');
      }

      for (const [source, localName] of [
        ['export default function namedFunction() {}', 'namedFunction'],
        ['export default class NamedClass {}', 'NamedClass'],
      ]) {
        const defaultRecord = new SourceTextModuleRecord({
          realm: createRealm(),
          identifier: source,
          ast: parseModule(source),
        });
        assertSame(defaultRecord.localExportEntries[0].localName, localName);
      }
    },
  },
  {
    name: 'parseModule rejects unsupported nested custom-parser module nodes',
    run() {
      /** @param {any[]} body */
      const parseModuleAst = (body) =>
        parseModule('', {
          parse() {
            return { type: 'Program', sourceType: 'module', body };
          },
        });

      assertThrows(
        () =>
          parseModuleAst([
            {
              type: 'ExpressionStatement',
              expression: {
                type: 'ImportExpression',
                source: { type: 'Literal', value: 'a' },
              },
            },
          ]),
        Error,
      );
      assertThrows(
        () =>
          parseModuleAst([
            {
              type: 'ExpressionStatement',
              expression: {
                type: 'MetaProperty',
                meta: { type: 'Identifier', name: 'import' },
                property: { type: 'Identifier', name: 'meta' },
              },
            },
          ]),
        Error,
      );
      assertThrows(
        () =>
          parseModuleAst([
            {
              type: 'ExportNamedDeclaration',
              declaration: { type: 'VariableDeclaration' },
              specifiers: [],
              source: null,
            },
          ]),
        SyntaxError,
      );
    },
  },
  {
    name: 'parseModule rejects exported export-all declarations from custom parsers',
    run() {
      assertThrows(
        () =>
          parseModule('', {
            parse() {
              return {
                type: 'Program',
                sourceType: 'module',
                body: [
                  {
                    type: 'ExportAllDeclaration',
                    source: { type: 'Literal', value: 'a' },
                    exported: { type: 'Identifier', name: 'ns' },
                  },
                ],
              };
            },
          }),
        Error,
      );
    },
  },
  {
    name: 'SourceTextModuleRecord retains duplicate module requests in source order',
    run() {
      const record = new SourceTextModuleRecord({
        realm: createRealm(),
        identifier: 'duplicate-requests',
        ast: parseModule(
          'import "a"; import "a"; export { x as y } from "a"; export * from "a";',
        ),
      });

      assertSame(record.requestedModules.join(','), 'a,a,a,a');
    },
  },
  {
    name: 'ordinary modules enforce the supported capability and strict early-error boundary',
    run() {
      for (const source of [
        'new.target;',
        'var pattern = /./u;',
        'function duplicate(a, a) {}',
        'var invalid = /]/;',
      ]) {
        assertThrows(() => parseModule(source), SyntaxError);
      }
    },
  },
  {
    name: 'ordinary module validation keeps adjacent implemented forms',
    run() {
      for (const source of [
        'import value from "dep"; export { value };',
        'function distinct(a, b) { return /a/gim.test(a + b); }',
        'export default function* values() { yield 1; }',
      ]) {
        assertSame(parseModule(source).sourceType, 'module');
      }
    },
  },
  {
    name: 'custom module ASTs preserve contextual and strict early errors through both entry points',
    run() {
      const strictReserved = [
        'implements',
        'interface',
        'let',
        'package',
        'private',
        'protected',
        'public',
        'static',
        'yield',
      ];

      for (const name of strictReserved) {
        assertThrows(() => parseModule(`var ${name};`), SyntaxError);
        assertThrows(() => parseModule(`${name};`), SyntaxError);
      }
      for (const source of [
        'let yield;',
        'var await;',
        'eval = 1;',
        'arguments = 1;',
        'delete target;',
        'function* g(yield) {}',
        'function* g(){ yi\\u0065ld; }',
        'function* g(value = yi\\u0065ld) {}',
      ]) {
        assertThrows(() => parseModule(source), SyntaxError);
      }

      for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
        for (const name of ['null', 'true', 'false', 'await']) {
          const binding = parseModule('var value;');
          binding.body[0].declarations[0].id.name = name;
          assertThrows(() => parseCustomModule(entry, binding), SyntaxError);

          const reference = parseModule('value;');
          reference.body[0].expression.name = name;
          assertThrows(() => parseCustomModule(entry, reference), SyntaxError);
        }

        for (const name of strictReserved) {
          const binding = parseModule('var value;');
          binding.body[0].declarations[0].id.name = name;
          assertThrows(() => parseCustomModule(entry, binding), SyntaxError);

          const reference = parseModule('value;');
          reference.body[0].expression.name = name;
          assertThrows(() => parseCustomModule(entry, reference), SyntaxError);
        }

        const lexicalYield = parseModule('let value;');
        lexicalYield.body[0].declarations[0].id.name = 'yield';
        assertThrows(() => parseCustomModule(entry, lexicalYield), SyntaxError);

        for (const name of ['eval', 'arguments']) {
          const assignment = parseModule('target = 1;');
          assignment.body[0].expression.left.name = name;
          assertThrows(() => parseCustomModule(entry, assignment), SyntaxError);
        }

        const deletion = parseModule('delete target.value;');
        deletion.body[0].expression.argument =
          deletion.body[0].expression.argument.object;
        assertThrows(() => parseCustomModule(entry, deletion), SyntaxError);

        const generatorBinding = parseModule('function* g(value) {}');
        generatorBinding.body[0].params[0].name = 'yield';
        assertThrows(
          () => parseCustomModule(entry, generatorBinding),
          SyntaxError,
        );

        const generatorReference = parseModule('function* g(){ value; }');
        generatorReference.body[0].body.body[0].expression.name = 'yield';
        assertThrows(
          () => parseCustomModule(entry, generatorReference),
          SyntaxError,
        );

        const generatorParameterReference = parseModule(
          'function* g(value = fallback) {}',
        );
        generatorParameterReference.body[0].params[0].right.name = 'yield';
        assertThrows(
          () => parseCustomModule(entry, generatorParameterReference),
          SyntaxError,
        );

        for (const source of [
          'eval; arguments;',
          'object.yield; object.await; ({ implements: 1, true: 2 });',
        ]) {
          assertSame(
            parseCustomModule(entry, parseModule(source)).sourceType,
            'module',
          );
        }
      }
    },
  },
  {
    name: 'custom module ASTs reject invalid return break continue and label contexts',
    run() {
      for (const source of [
        'return 1;',
        'break;',
        'continue;',
        'break missing;',
        'continue missing;',
        'label: { continue label; }',
        'label: label: ;',
        'outer: { function nested() { break outer; } }',
      ]) {
        assertThrows(() => parseModule(source), SyntaxError);
      }

      /** @type {readonly (() => any)[]} */
      const invalidPrograms = [
        () => {
          const ast = parseModule('function f(){ return 1; }');
          ast.body = [ast.body[0].body.body[0]];
          return ast;
        },
        () => {
          const ast = parseModule('while (true) { break; }');
          ast.body = [ast.body[0].body.body[0]];
          return ast;
        },
        () => {
          const ast = parseModule('while (true) { continue; }');
          ast.body = [ast.body[0].body.body[0]];
          return ast;
        },
        () => {
          const ast = parseModule('present: while (true) { break present; }');
          ast.body[0].body.body.body[0].label.name = 'missing';
          return ast;
        },
        () => {
          const ast = parseModule(
            'present: while (true) { continue present; }',
          );
          ast.body[0].body.body.body[0].label.name = 'missing';
          return ast;
        },
        () => {
          const ast = parseModule('target: while (true) { continue target; }');
          const iteration = ast.body[0].body;
          ast.body[0].body = {
            type: 'BlockStatement',
            body: [iteration],
          };
          return ast;
        },
        () => {
          const ast = parseModule('outer: inner: while (false) {}');
          ast.body[0].body.label.name = 'outer';
          return ast;
        },
        () => {
          const ast = parseModule('outer: { function nested() {} }');
          ast.body[0].body.body[0].body.body = [
            {
              type: 'BreakStatement',
              label: { type: 'Identifier', name: 'outer' },
            },
          ];
          return ast;
        },
      ];

      for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
        for (const createInvalidProgram of invalidPrograms) {
          assertThrows(
            () => parseCustomModule(entry, createInvalidProgram()),
            SyntaxError,
          );
        }
      }
    },
  },
  {
    name: 'custom module AST control-flow validation accepts valid nested targets',
    run() {
      for (const source of [
        `
          function valid(flag) {
            outer: for (;;) {
              switch (flag) {
                case 0: continue outer;
                case 1: break;
                default: break outer;
              }
            }
            return 1;
          }
        `,
        'first: second: while (false) { continue first; }',
      ]) {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          assertSame(
            parseCustomModule(entry, parseModule(source)).sourceType,
            'module',
          );
        }
      }
    },
  },
  {
    name: 'custom label validation uses constant-time active-label lookup',
    run() {
      const ast = parseModule(
        'outer: inner: while (false) { continue outer; break inner; }',
      );
      const arraySome = Array.prototype.some;

      Array.prototype.some = () => {
        throw new Error('active labels must not be linearly scanned');
      };

      try {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          assertSame(parseCustomModule(entry, ast).sourceType, 'module');
        }
      } finally {
        Array.prototype.some = arraySome;
      }
    },
  },
  {
    name: 'custom ImportDeclaration specifier lists follow ES2015 grammar',
    run() {
      for (const source of [
        'import "dep";',
        'import defaultName from "dep";',
        'import * as namespaceName from "dep";',
        'import { first, second as localSecond } from "dep";',
        'import defaultName, * as namespaceName from "dep";',
        'import defaultName, { first, second as localSecond } from "dep";',
        'import { value as first, value as second } from "dep";',
      ]) {
        for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
          assertSame(
            parseCustomModule(entry, parseModule(source)).sourceType,
            'module',
          );
        }
      }

      assertThrows(
        () =>
          parseModule('import { first as local, second as local } from "dep";'),
        SyntaxError,
      );

      /** @type {readonly (() => any)[]} */
      const invalidImports = [
        () => {
          const ast = parseModule(
            'import first from "a"; import second from "b";',
          );
          ast.body[0].specifiers.push(ast.body[1].specifiers[0]);
          ast.body.splice(1, 1);
          return ast;
        },
        () => {
          const ast = parseModule(
            'import * as first from "a"; import * as second from "b";',
          );
          ast.body[0].specifiers.push(ast.body[1].specifiers[0]);
          ast.body.splice(1, 1);
          return ast;
        },
        () => {
          const ast = parseModule(
            'import * as namespaceName from "a"; import { value } from "b";',
          );
          ast.body[0].specifiers.push(ast.body[1].specifiers[0]);
          ast.body.splice(1, 1);
          return ast;
        },
        () => {
          const ast = parseModule('import defaultName, { value } from "dep";');
          ast.body[0].specifiers.reverse();
          return ast;
        },
        () => {
          const ast = parseModule(
            'import defaultName, * as namespaceName from "dep";',
          );
          ast.body[0].specifiers.reverse();
          return ast;
        },
        () => {
          const ast = parseModule(
            'import { first, second as localSecond } from "dep";',
          );
          ast.body[0].specifiers[1].local.name =
            ast.body[0].specifiers[0].local.name;
          return ast;
        },
      ];

      for (const entry of CUSTOM_MODULE_AST_ENTRIES) {
        for (const createInvalidImport of invalidImports) {
          assertThrows(
            () => parseCustomModule(entry, createInvalidImport()),
            SyntaxError,
          );
        }
      }
    },
  },
  {
    name: 'custom modules enforce capability and strict binding early errors',
    run() {
      const meta = parseModule('function kept() { return 1; }');
      meta.body[0].body.body[0].argument = {
        type: 'MetaProperty',
        meta: { type: 'Identifier', name: 'new' },
        property: { type: 'Identifier', name: 'target' },
      };
      assertThrows(() => parseModule('', { parse: () => meta }), SyntaxError);

      const duplicate = parseModule('function kept(a, b) {}');
      duplicate.body[0].params[1].name = 'a';
      assertThrows(
        () => parseModule('', { parse: () => duplicate }),
        SyntaxError,
      );

      const imported = parseModule('import { value as local } from "dep";');
      imported.body[0].specifiers[0].local.name = 'eval';
      assertThrows(
        () => parseModule('', { parse: () => imported }),
        SyntaxError,
      );

      const regexp = parseModule('var pattern = /a/;');
      const literal = regexp.body[0].declarations[0].init;
      literal.regex.pattern = ']';
      literal.raw = '/]/';
      literal.value = undefined;
      assertThrows(() => parseModule('', { parse: () => regexp }), SyntaxError);
    },
  },
  {
    name: 'parseModule normalizes an anonymous top-level custom-AST ClassDeclaration to SyntaxError',
    run() {
      const anonymousClass = parseModule('class Named {}');
      anonymousClass.body[0].id = null;
      assertThrows(
        () => parseModule('', { parse: () => anonymousClass }),
        SyntaxError,
      );

      // Adjacent valid control: an anonymous class remains admitted when it is
      // the declaration of a module default export, including when replayed
      // through the custom-parser snapshot path exercised above.
      const anonymousDefaultClass = parseModule('export default class {}');
      const parsed = parseModule('', { parse: () => anonymousDefaultClass });
      assertSame(parsed.body[0].declaration.id, null);
    },
  },
];
