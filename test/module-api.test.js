import { assertSame } from './harness/assert.js';
import {
  createModuleLoader,
  createRealm,
  ModuleLoaderError,
  parseModule,
} from '../src/index.js';

export default [
  {
    name: 'public module API composes through the documented loader boundary',
    async run() {
      const ast = parseModule('export const answer = 42;');
      assertSame(ast.sourceType, 'module');
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load() {
          return 'export const answer = 42;';
        },
      });
      const namespace = await loader.loadAndEvaluate('answer');

      assertSame(namespace.get('answer'), 42);
      assertSame(typeof ModuleLoaderError, 'function');
    },
  },
  {
    name: 'public ModuleLoader evaluates an identifier default export',
    async run() {
      const loader = createModuleLoader(createRealm(), {
        resolve(specifier) {
          return specifier;
        },
        load() {
          return 'const value = 7; export default value;';
        },
      });

      const namespace = await loader.loadAndEvaluate('identifier-default');

      assertSame(namespace.get('default'), 7);
    },
  },
];
