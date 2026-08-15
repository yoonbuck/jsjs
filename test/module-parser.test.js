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
      assertSame(record.localExportEntries[0].exportName, 'z');
      assertSame(record.starExportEntries[0].moduleRequest, 'b');
      assertSame(Object.isFrozen(record.requestedModules), true);
      assertSame(Object.isFrozen(record.importEntries[0]), true);
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
      assertSame(record.localExportEntries[3].exportName, 'renamed');
      assertSame(record.indirectExportEntries[0].moduleRequest, 'indirect');
      assertSame(record.indirectExportEntries[0].importName, 'sourceName');
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
];
