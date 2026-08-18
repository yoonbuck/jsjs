import { assertSame } from './harness/assert.js';
import { createAgent, createRealm, evaluateScript } from '../src/index.js';
import { EngineObject } from '../src/runtime/object.js';
import { ThrowSignal } from '../src/runtime/completion.js';
import { createGeneratorExecution } from '../src/evaluator/generator-machine.js';
import { createGeneratorExpressionFrame } from '../src/evaluator/generator-expression-frames.js';

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
  {
    name: 'sequential cross-Realm delegation resumes do not accumulate Agent depth',
    run() {
      const agent = createAgent();
      const realmA = createRealm({ agent, maxStackDepth: 40 });
      const realmB = createRealm({ agent, maxStackDepth: 40 });
      const foreign = evaluateScript(
        realmB,
        '(function* foreign(value) { yield value; })',
      ).value;

      realmA.globalObject.defineOwnProperty('foreign', {
        value: foreign,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const completion = evaluateScript(
        realmA,
        `
          var total = 0;
          for (var index = 0; index < 1000; index = index + 1) {
            var iterator = (function* () { yield* foreign(index); })();
            total = total + iterator.next().value;
            if (!iterator.next().done) {
              throw new Error("delegate did not complete");
            }
          }
          total;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 499500);
      assertSame(realmA.stackGuard.depth, 0);
      assertSame(realmB.stackGuard.depth, 0);
    },
  },
  {
    name: 'generator activations reuse one function-owned yield classification snapshot',
    run() {
      const realm = createRealm();
      const depth = 64;
      let edgeReads = 0;
      let expression = /** @type {any} */ ({
        type: 'YieldExpression',
        delegate: false,
        argument: null,
      });
      /** @type {any[]} */
      const nested = [];

      for (let index = 0; index < depth; index += 1) {
        const right = expression;
        const parent = /** @type {any} */ ({
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Literal', value: index },
        });
        Object.defineProperty(parent, 'right', {
          configurable: true,
          enumerable: true,
          get() {
            edgeReads += 1;
            return right;
          },
        });
        nested.push(parent);
        expression = parent;
      }

      const body = [{ type: 'ExpressionStatement', expression }];
      const functionObject = /** @type {any} */ ({ realm });
      const firstContext = /** @type {any} */ ({ realm });
      const first = createGeneratorExecution({
        functionObject,
        body,
        context: firstContext,
      });
      const snapshot = first.yieldClassification;

      assertSame(snapshot instanceof WeakMap, true);
      assertSame(functionObject.generatorYieldClassification, snapshot);
      assertSame(firstContext.generatorYieldClassification, snapshot);
      for (let repeat = 0; repeat < 8; repeat += 1) {
        assertSame(
          createGeneratorExpressionFrame(expression, firstContext, 'value')
            .kind,
          'binary',
        );
      }
      for (const node of nested) {
        assertSame(snapshot.get(node), true);
        assertSame(
          createGeneratorExpressionFrame(node, firstContext, 'value').kind,
          'binary',
        );
      }
      assertSame(edgeReads, depth);

      const secondContext = /** @type {any} */ ({ realm });
      const second = createGeneratorExecution({
        functionObject,
        body,
        context: secondContext,
      });
      assertSame(second.yieldClassification, snapshot);
      assertSame(secondContext.generatorYieldClassification, snapshot);
      assertSame(edgeReads, depth);
    },
  },
];

export default tests;
