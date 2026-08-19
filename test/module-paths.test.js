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
  {
    name: 'portable module paths reject encoded structural traversal and separators',
    run: () => {
      for (const specifier of [
        './%2e%2e/escaped.js',
        './%2E%2e/escaped.js',
        './nested%2fchild.js',
        './nested%2Fchild.js',
        './nested%5cchild.js',
        './nested%5Cchild.js',
      ]) {
        const error = captureError(() =>
          resolveTest262ModulePath(
            specifier,
            'test/language/module-code/root.js',
          ),
        );

        assertSame(error.message.includes('encoded'), true);
      }

      const encodedReferrer = captureError(() =>
        resolveTest262ModulePath(
          './child.js',
          'test/language/module-code/%2e%2e/root.js',
        ),
      );
      assertSame(encodedReferrer.message.includes('encoded'), true);
    },
  },
  {
    name: 'portable module paths reject URL-sensitive identifier characters',
    run: () => {
      for (const [specifier, referrer] of [
        ['./literal%name.js', 'test/language/module-code/root.js'],
        ['./literal%25name.js', 'test/language/module-code/root.js'],
        ['./child.js?query', 'test/language/module-code/root.js'],
        ['./child.js#fragment', 'test/language/module-code/root.js'],
        ['../../file:/outside.js', 'test/language/root.js'],
        ['../../C|/outside.js', 'test/language/root.js'],
        ['./child.js', 'test/language/module-code/root.js?query'],
        ['./child.js', 'test/language/module-code/root.js#fragment'],
      ]) {
        const error = captureError(() =>
          resolveTest262ModulePath(specifier, referrer),
        );
        assertSame(error.message.includes('URL-sensitive'), true);
      }
    },
  },
  {
    name: 'portable module paths reject URL-stripped control whitespace',
    run: () => {
      for (const control of ['\t', '\n', '\r']) {
        const error = captureError(() =>
          resolveTest262ModulePath(
            `./dependency${control}name_FIXTURE.js`,
            'test/language/module-code/root.js',
          ),
        );
        assertSame(error.message.includes('URL-sensitive'), true);
      }
    },
  },
  {
    name: 'portable module paths reject literal backslashes before normalization',
    run: () => {
      for (const [specifier, referrer] of [
        ['./nested\\child.js', 'test/language/module-code/root.js'],
        ['./child.js', 'test\\language/module-code/root.js'],
      ]) {
        const error = captureError(() =>
          resolveTest262ModulePath(specifier, referrer),
        );
        assertSame(error.message.includes('literal backslashes'), true);
      }
    },
  },
];
