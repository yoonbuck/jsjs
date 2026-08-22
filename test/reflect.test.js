import { assertSame } from './harness/assert.js';
import { createAgent, createRealm, evaluateScript } from '../src/index.js';
import { ThrowSignal } from '../src/runtime/completion.js';
import { EngineObject } from '../src/runtime/object.js';
import { HostileExotic } from './harness/hostile-exotic.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineGlobal(realm, name, value) {
  realm.globalObject.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

const OBJECT_TARGET_SIGNATURES = Object.freeze([
  ['defineProperty', 3],
  ['deleteProperty', 2],
  ['getOwnPropertyDescriptor', 2],
  ['getPrototypeOf', 1],
  ['has', 2],
  ['isExtensible', 1],
  ['ownKeys', 1],
  ['preventExtensions', 1],
  ['setPrototypeOf', 2],
]);

const PRIMITIVE_TARGET_SOURCES = Object.freeze([
  'undefined',
  'null',
  'true',
  '0',
  "''",
  'Symbol("s")',
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
        run('try { Reflect(); } catch (error) { error instanceof TypeError; }'),
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
    name: 'object-target Reflect methods expose exact metadata',
    run() {
      for (const [name, length] of OBJECT_TARGET_SIGNATURES) {
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
      assertSame(run('Reflect.getPrototypeOf({}) === Object.prototype;'), true);
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
  {
    name: 'Reflect descriptor and boolean methods preserve exact results',
    run() {
      assertSame(
        run(
          'var object = {};' +
            'Reflect.defineProperty(object, "x", {value: 1}) + ":" +' +
            'object.x;',
        ),
        'true:1',
      );
      assertSame(
        run(
          'var object = {};' +
            'Object.defineProperty(object, "x", {value: 1, configurable: false});' +
            'Reflect.deleteProperty(object, "x");',
        ),
        false,
      );
      assertSame(run('Reflect.has({x: 1}, "x");'), true);
      assertSame(
        run(
          'var key = Symbol("key"); var object = {};' +
            'Reflect.defineProperty(object, key, {value: 4, configurable: true});' +
            'Reflect.has(object, key) + ":" +' +
            'Reflect.getOwnPropertyDescriptor(object, key).value + ":" +' +
            'Reflect.deleteProperty(object, key);',
        ),
        'true:4:true',
      );
      assertSame(
        run(
          'var descriptor = Reflect.getOwnPropertyDescriptor(' +
            '  {x: 1}, "x"' +
            ');' +
            '[descriptor.value, descriptor.writable,' +
            ' descriptor.enumerable, descriptor.configurable].join(":");',
        ),
        '1:true:true:true',
      );
      assertSame(
        run('Reflect.getOwnPropertyDescriptor({}, "missing");'),
        undefined,
      );
      assertSame(
        run(
          'var object = {}; var proto = {};' +
            'Reflect.setPrototypeOf(object, proto) + ":" +' +
            '(Reflect.getPrototypeOf(object) === proto);',
        ),
        'true:true',
      );
      assertSame(
        run(
          'var object = {}; Object.preventExtensions(object);' +
            'Reflect.setPrototypeOf(object, {});',
        ),
        false,
      );
      assertSame(
        run(
          'var message;' +
            'try { Reflect.setPrototypeOf(1, 1); } catch (error) {' +
            'message = error.message;' +
            '}' +
            'message;',
        ),
        'Reflect.setPrototypeOf requires an object',
      );
      assertSame(
        run(
          'var outcome;' +
            'try { Reflect.setPrototypeOf({}, 1); } catch (error) {' +
            'outcome = error instanceof TypeError;' +
            '}' +
            'outcome;',
        ),
        true,
      );
    },
  },
  {
    name: 'Reflect keyed methods preserve validation and descriptor ordering',
    run() {
      assertSame(
        run(
          'var log = [];' +
            'var key = {toString: function () { log.push("key"); return "x"; }};' +
            'var attributes = {};' +
            'Object.defineProperty(attributes, "enumerable", {' +
            'get: function () { log.push("attributes"); return true; }' +
            '});' +
            'Reflect.defineProperty({}, key, attributes);' +
            'log.join(",");',
        ),
        'key,attributes',
      );
      assertSame(
        run(
          'var calls = 0;' +
            'var key = {toString: function () { calls += 1; return "x"; }};' +
            'try { Reflect.deleteProperty(1, key); } catch (error) {}' +
            'calls;',
        ),
        0,
      );
      assertSame(
        run(
          'var log = []; var attributes = {};' +
            '["enumerable","configurable","value","writable","get","set"]' +
            '.forEach(function (name) {' +
            'Object.defineProperty(attributes, name, {' +
            'get: function () {' +
            'log.push(name);' +
            'return name === "get" || name === "set" ? undefined : 1;' +
            '}' +
            '});' +
            '});' +
            'try { Reflect.defineProperty({}, "x", attributes); } catch (error) {}' +
            'log.join(",");',
        ),
        'enumerable,configurable,value,writable,get,set',
      );
    },
  },
  {
    name: 'Reflect.getOwnPropertyDescriptor allocates descriptor wrappers in the method Realm',
    run() {
      const agent = createAgent();
      const callerRealm = createRealm({ agent });
      const methodRealm = createRealm({ agent });
      defineGlobal(
        callerRealm,
        'foreignDescribe',
        evaluateScript(methodRealm, 'Reflect.getOwnPropertyDescriptor;').value,
      );

      const descriptor = /** @type {EngineObject} */ (
        evaluateScript(callerRealm, 'foreignDescribe({x: 1}, "x");').value
      );

      assertSame(
        descriptor.getPrototypeOf(),
        methodRealm.intrinsics.objectPrototype,
      );
      assertSame(descriptor.get('value', descriptor), 1);
      assertSame(descriptor.get('writable', descriptor), true);
      assertSame(descriptor.get('enumerable', descriptor), true);
      assertSame(descriptor.get('configurable', descriptor), true);
    },
  },
  {
    name: 'Reflect dispatches descriptor and boolean methods through Table 5',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        undefined,
      );
      exotic.defineOwnPropertyResult = false;
      exotic.deleteResult = false;
      exotic.setPrototypeResult = true;
      exotic.virtual.set('x', {
        value: 3,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      defineGlobal(realm, 'hostile', exotic);
      defineGlobal(
        realm,
        'nextProto',
        new EngineObject(null, 'Object', realm.agent),
      );

      assertSame(
        evaluateScript(
          realm,
          'Reflect.defineProperty(hostile, "x", {value: 1});',
        ).value,
        false,
      );
      assertSame(
        evaluateScript(realm, 'Reflect.deleteProperty(hostile, "x");').value,
        false,
      );
      assertSame(
        evaluateScript(realm, 'Reflect.has(hostile, "x");').value,
        true,
      );
      assertSame(
        evaluateScript(realm, 'Reflect.setPrototypeOf(hostile, nextProto);')
          .value,
        true,
      );
      assertSame(
        JSON.stringify(exotic.calls.map((call) => call[0])),
        '["defineOwnProperty","delete","hasProperty","setPrototypeOf"]',
      );
      assertSame(exotic.activeRealms.length, 4);
      for (const activeRealm of exotic.activeRealms) {
        assertSame(activeRealm, realm);
      }
    },
  },
  {
    name: 'Reflect.setPrototypeOf validates target and prototype before hostile dispatch',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        undefined,
      );
      defineGlobal(realm, 'hostile', exotic);

      assertSame(
        evaluateScript(
          realm,
          'var message;' +
            'try { Reflect.setPrototypeOf(1, 1); } catch (error) {' +
            'message = error.message;' +
            '}' +
            'message;',
        ).value,
        'Reflect.setPrototypeOf requires an object',
      );
      assertSame(
        evaluateScript(
          realm,
          'var message;' +
            'try { Reflect.setPrototypeOf(hostile, 1); } catch (error) {' +
            'message = error.message;' +
            '}' +
            'message;',
        ).value,
        'Reflect.setPrototypeOf prototype must be an object or null',
      );
      assertSame(exotic.calls.length, 0);
    },
  },
  {
    name: 'Reflect preserves hostile Table 5 abrupt completions by identity',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        undefined,
      );
      const sentinel = new EngineObject(realm.intrinsics.objectPrototype);
      const nextPrototype = new EngineObject(realm.intrinsics.objectPrototype);
      defineGlobal(realm, 'hostile', exotic);
      defineGlobal(realm, 'nextPrototype', nextPrototype);

      for (const [operation, source] of [
        ['getOwnProperty', 'Reflect.getOwnPropertyDescriptor(hostile, "x");'],
        ['defineOwnProperty', 'Reflect.defineProperty(hostile, "x", {});'],
        ['delete', 'Reflect.deleteProperty(hostile, "x");'],
        ['hasProperty', 'Reflect.has(hostile, "x");'],
        ['setPrototypeOf', 'Reflect.setPrototypeOf(hostile, nextPrototype);'],
      ]) {
        exotic.abrupt.clear();
        exotic.abrupt.set(operation, new ThrowSignal(sentinel));
        const completion = evaluateScript(realm, source);
        assertSame(completion.type, 'throw');
        assertSame(completion.value, sentinel);
      }
    },
  },
  {
    name: 'object-target Reflect methods reject primitive targets',
    run() {
      for (const [name] of OBJECT_TARGET_SIGNATURES) {
        for (const targetSource of PRIMITIVE_TARGET_SOURCES) {
          assertSame(
            run(
              `try { Reflect.${name}(${targetSource}); } catch (error) {` +
                'error instanceof TypeError;' +
                '}',
            ),
            true,
          );
        }
      }
    },
  },
];

export default tests;
