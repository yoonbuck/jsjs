import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';
import { ThrowSignal } from '../src/runtime/completion.js';

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {EngineObject}
 */
function createIterator(realm, source) {
  const completion = evaluateScript(realm, source);

  assertSame(completion.type, 'normal');
  assertSame(realm.stackGuard.depth, 0);

  const iterator = realm.globalObject.get('iterator');
  assertSame(iterator instanceof EngineObject, true);
  return /** @type {EngineObject} */ (iterator);
}

/**
 * @param {EngineObject} iterator
 * @param {unknown} value
 * @returns {EngineObject}
 */
function next(iterator, value) {
  const method = iterator.get('next');

  try {
    return /** @type {EngineObject} */ (
      /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
        method
      ).callFunction(iterator, [value])
    );
  } catch (error) {
    if (error instanceof ThrowSignal && error.value instanceof EngineObject) {
      throw new Error(
        `${String(error.value.get('name'))}: ${String(
          error.value.get('message'),
        )}`,
      );
    }

    throw error;
  }
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'hundreds of sequential yields release every StackGuard entry',
    run() {
      const realm = createRealm({ maxStackDepth: 12 });
      const expected = [];
      const statements = [];

      for (let index = 0; index < 150; index += 1) {
        expected.push(index);
        statements.push(`yield ${index};`);
      }

      statements.push('var nested = (((((1 + 2) + 3) + 4) + 5) + 6);');
      expected.push(21);
      statements.push('yield nested;');

      for (let index = 150; index < 300; index += 1) {
        expected.push(index);
        statements.push(`yield ${index};`);
      }

      const iterator = createIterator(
        realm,
        `function* many() { ${statements.join('\n')} } var iterator = many();`,
      );

      for (let index = 0; index < expected.length; index += 1) {
        const result = next(iterator, index);

        assertSame(result.get('value'), expected[index]);
        assertSame(result.get('done'), false);
        assertSame(realm.stackGuard.depth, 0);
      }

      const completed = next(iterator, undefined);
      assertSame(completed.get('value'), undefined);
      assertSame(completed.get('done'), true);
      assertSame(realm.stackGuard.depth, 0);
    },
  },
  {
    name: 'thousands of resume cycles do not grow a host continuation chain',
    run() {
      const realm = createRealm({ maxStackDepth: 12 });
      const count = 2500;
      const statements = [];

      for (let index = 0; index < count; index += 1) {
        statements.push(`yield ${index};`);
      }

      const iterator = createIterator(
        realm,
        `function* many() { ${statements.join('\n')} } var iterator = many();`,
      );

      for (let index = 0; index < count; index += 1) {
        const result = next(iterator, index);

        assertSame(result.get('value'), index);
        assertSame(result.get('done'), false);
        assertSame(realm.stackGuard.depth, 0);
      }

      const completed = next(iterator, undefined);
      assertSame(completed.get('done'), true);
      assertSame(realm.stackGuard.depth, 0);
    },
  },
];

export default tests;
