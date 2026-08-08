import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const result = evaluateScript(createRealm(), source);

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return result.value;
}

const tests = [
  {
    name: 'own property keys list array indices ascending before other keys, in creation order',
    run() {
      assertSame(
        run(
          "var o = {}; o.p1 = 'a'; o.p2 = 'b'; o[2] = 'c'; o[0] = 'd'; o[1] = 'e'; " +
            'Object.keys(o).join(",");',
        ),
        '0,1,2,p1,p2',
      );
    },
  },
];

export default tests;
