import { assertSame, assertThrows } from './harness/assert.js';
import { createRealm } from '../src/index.js';
import { parseModule, parseScript } from '../src/parser.js';
import { SourceTextModuleRecord } from '../src/runtime/module-record.js';

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
