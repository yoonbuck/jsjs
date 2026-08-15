import { assertSame } from './harness/assert.js';
import { resolveTest262ModulePath } from '../tools/test262/module-paths.js';

/**
 * @param {() => unknown} action
 * @returns {Error}
 */
function captureError(action) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`Expected an Error, got ${String(error)}`);
  }

  throw new Error('Expected module path resolution to fail');
}

export default [
  {
    name: 'portable module paths normalize relative Test262 requests by string segments',
    run: () => {
      assertSame(
        resolveTest262ModulePath(
          './basic_FIXTURE.js',
          'test/language/module-code/basic.js',
        ),
        'test/language/module-code/basic_FIXTURE.js',
      );
      assertSame(
        resolveTest262ModulePath(
          '../shared_FIXTURE.js',
          'test/language/module-code/nested/root.js',
        ),
        'test/language/module-code/shared_FIXTURE.js',
      );
      assertSame(
        resolveTest262ModulePath(
          './nested/../basic_FIXTURE.js',
          'test/language/module-code/root.js',
        ),
        'test/language/module-code/basic_FIXTURE.js',
      );
    },
  },
  {
    name: 'portable module paths reject bare specifiers and traversal above the Test262 root',
    run: () => {
      const bare = captureError(() =>
        resolveTest262ModulePath(
          'bare-specifier',
          'test/language/module-code/root.js',
        ),
      );
      const escaping = captureError(() =>
        resolveTest262ModulePath('../../../../outside.js', 'test/root.js'),
      );

      assertSame(bare.message.includes('relative'), true);
      assertSame(escaping.message.includes('above the Test262 root'), true);
    },
  },
];
