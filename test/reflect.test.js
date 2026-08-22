import { assertSame } from './harness/assert.js';
import { createRealm, evaluateScript } from '../src/index.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

const TARGET_ONLY_SIGNATURES = Object.freeze([
  ['getPrototypeOf', 1],
  ['isExtensible', 1],
  ['ownKeys', 1],
  ['preventExtensions', 1],
]);

const tests = [
  {
    name: 'Reflect is an ordinary tagged non-callable object',
    run() {
      assertSame(run('typeof Reflect;'), 'object');
      assertSame(
        run('Object.getPrototypeOf(Reflect) === Object.prototype;'),
        true,
      );
      assertSame(run('Reflect.prototype;'), undefined);
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(this, "Reflect");' +
            '[d.writable, d.enumerable, d.configurable].join(":");',
        ),
        'true:false:true',
      );
      assertSame(
        run('Object.prototype.toString.call(Reflect);'),
        '[object Reflect]',
      );
      assertSame(run('Reflect.enumerate;'), undefined);
      assertSame(
        run(
          'try { Reflect(); } catch (error) { error instanceof TypeError; }',
        ),
        true,
      );
      assertSame(
        run(
          'try { new Reflect(); } catch (error) {' +
            'error instanceof TypeError;' +
            '}',
        ),
        true,
      );

      const descriptor =
        'Object.getOwnPropertyDescriptor(Reflect, Symbol.toStringTag)';
      assertSame(run(`${descriptor}.value;`), 'Reflect');
      assertSame(run(`${descriptor}.writable;`), false);
      assertSame(run(`${descriptor}.enumerable;`), false);
      assertSame(run(`${descriptor}.configurable;`), true);
    },
  },
  {
    name: 'target-only Reflect methods expose exact metadata',
    run() {
      for (const [name, length] of TARGET_ONLY_SIGNATURES) {
        assertSame(run(`Reflect.${name}.name;`), name);
        assertSame(run(`Reflect.${name}.length;`), length);
        assertSame(run(`Reflect.${name}.prototype;`), undefined);
        assertSame(
          run(
            `var d = Object.getOwnPropertyDescriptor(Reflect, "${name}");` +
              '[d.writable, d.enumerable, d.configurable].join(":");',
          ),
          'true:false:true',
        );
        assertSame(
          run(
            `try { new Reflect.${name}({}); } catch (error) {` +
              'error instanceof TypeError;' +
              '}',
          ),
          true,
        );
      }
    },
  },
  {
    name: 'target-only Reflect methods use object targets and boolean results',
    run() {
      assertSame(
        run('Reflect.getPrototypeOf({}) === Object.prototype;'),
        true,
      );
      assertSame(run('Reflect.getPrototypeOf(Object.create(null));'), null);
      assertSame(run('Reflect.isExtensible({});'), true);
      assertSame(
        run(
          'var object = {}; Object.preventExtensions(object);' +
            'Reflect.isExtensible(object);',
        ),
        false,
      );
      assertSame(
        run(
          'var object = {}; Reflect.preventExtensions(object) + ":" +' +
            'Reflect.isExtensible(object);',
        ),
        'true:false',
      );
      assertSame(
        run(
          'var symbol = Symbol("s"); var object = {2: 2, a: 1};' +
            'object[symbol] = 3;' +
            'var keys = Reflect.ownKeys(object);' +
            'keys[0] + ":" + keys[1] + ":" + (keys[2] === symbol);',
        ),
        '2:a:true',
      );
    },
  },
];

export default tests;
