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

const REFLECT_SIGNATURES = Object.freeze([
  ['apply', 3],
  ['construct', 2],
  ['defineProperty', 3],
  ['deleteProperty', 2],
  ['get', 2],
  ['getOwnPropertyDescriptor', 2],
  ['getPrototypeOf', 1],
  ['has', 2],
  ['isExtensible', 1],
  ['ownKeys', 1],
  ['preventExtensions', 1],
  ['set', 3],
  ['setPrototypeOf', 2],
]);

const OBJECT_TARGET_SIGNATURES = Object.freeze(
  REFLECT_SIGNATURES.filter(
    ([name]) => name !== 'apply' && name !== 'construct',
  ),
);

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
    name: 'Reflect methods expose exact metadata and ignore JavaScript this',
    run() {
      assertSame(REFLECT_SIGNATURES.length, 13);

      for (const [name, length] of REFLECT_SIGNATURES) {
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

      assertSame(
        run(
          'var object = {x: 1}; var proto = {}; var F = function F() {};' +
            'var checks = [];' +
            'checks.push((0, Reflect.apply)(function () { return 1; }, null, []) === 1);' +
            'checks.push((0, Reflect.construct)(F, []) instanceof F);' +
            'checks.push((0, Reflect.defineProperty)(object, "y", {value: 2, configurable: true}));' +
            'checks.push((0, Reflect.deleteProperty)(object, "y"));' +
            'checks.push((0, Reflect.get)(object, "x") === 1);' +
            'checks.push((0, Reflect.getOwnPropertyDescriptor)(object, "x").value === 1);' +
            'checks.push((0, Reflect.getPrototypeOf)(object) === Object.prototype);' +
            'checks.push((0, Reflect.has)(object, "x"));' +
            'checks.push((0, Reflect.isExtensible)(object));' +
            'checks.push((0, Reflect.ownKeys)(object)[0] === "x");' +
            'checks.push((0, Reflect.preventExtensions)({}));' +
            'checks.push((0, Reflect.set)(object, "x", 3));' +
            'checks.push((0, Reflect.setPrototypeOf)({}, proto));' +
            'checks.every(function (value) { return value === true; });',
        ),
        true,
      );
    },
  },
  {
    name: 'Reflect.apply and Reflect.construct use exact receiver, new target, and argument lists',
    run() {
      assertSame(
        run(
          'function target(a, b, c) {' +
            'return this.prefix + ":" + arguments.length + ":" +' +
            'a + ":" + b + ":" + c;' +
            '}' +
            'Reflect.apply(target, {prefix: "ok"}, {' +
            '0: "a", 2: "c", length: 3' +
            '});',
        ),
        'ok:3:a:undefined:c',
      );
      assertSame(
        run(
          'function Target(value) { this.value = value; }' +
            'function NewTarget() {}' +
            'var first = Reflect.construct(Target, [1]);' +
            'var second = Reflect.construct(Target, [2], NewTarget);' +
            '(Object.getPrototypeOf(first) === Target.prototype) + ":" +' +
            '(Object.getPrototypeOf(second) === NewTarget.prototype) + ":" +' +
            'first.value + ":" + second.value;',
        ),
        'true:true:1:2',
      );
      assertSame(
        run(
          'function Target() {} var name;' +
            'try { Reflect.construct(Target, [], undefined); }' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Reflect.apply and Reflect.construct validate target and newTarget before list access',
    run() {
      assertSame(
        run(
          'var reads = 0;' +
            'var list = {get length() { reads += 1; return 0; }};' +
            'var name;' +
            'try { Reflect.apply({}, null, list); }' +
            'catch (error) { name = error.name; }' +
            'name + ":" + reads;',
        ),
        'TypeError:0',
      );
      assertSame(
        run(
          'var reads = 0;' +
            'var list = {get length() { reads += 1; return 0; }};' +
            'var name;' +
            'try { Reflect.construct(function () {}, list, () => {}); }' +
            'catch (error) { name = error.name; }' +
            'name + ":" + reads;',
        ),
        'TypeError:0',
      );
      assertSame(
        run(
          'var reads = 0;' +
            'var list = {get length() { reads += 1; return 0; }};' +
            'var name;' +
            'try { Reflect.construct(() => {}, list); }' +
            'catch (error) { name = error.name; }' +
            'name + ":" + reads;',
        ),
        'TypeError:0',
      );
      assertSame(
        run(
          'function target() {} var name;' +
            'try { Reflect.apply(target, null); }' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'function target() {} var name;' +
            'try { Reflect.construct(target, null); }' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Reflect.construct validates target before an explicit valid newTarget',
    run() {
      const realm = createRealm();
      const target = evaluateScript(realm, '(() => {})').value;
      const newTarget = evaluateScript(
        realm,
        '(function NewTarget() {})',
      ).value;
      const originalHas = WeakSet.prototype.has;
      /** @type {string[]} */
      const checks = [];

      defineGlobal(realm, 'target', target);
      defineGlobal(realm, 'newTarget', newTarget);

      WeakSet.prototype.has = function has(/** @type {object} */ value) {
        if (value === target) {
          checks.push('target');
        } else if (value === newTarget) {
          checks.push('newTarget');
        }

        return originalHas.call(this, value);
      };

      try {
        assertSame(
          evaluateScript(
            realm,
            'var message;' +
              'try { Reflect.construct(target, [], newTarget); }' +
              'catch (error) { message = error.message; } message;',
          ).value,
          'Reflect.construct target is not a constructor',
        );
        assertSame(JSON.stringify(checks), '["target"]');
      } finally {
        WeakSet.prototype.has = originalHas;
      }
    },
  },
  {
    name: 'Reflect.apply and Reflect.construct require private call and construct capabilities',
    run() {
      let spoofCalls = 0;
      const realm = createRealm();
      const spoof = new EngineObject(realm.intrinsics.objectPrototype);
      spoof.defineOwnProperty('callFunction', {
        value() {
          spoofCalls += 1;
        },
        writable: true,
        enumerable: true,
        configurable: true,
      });
      spoof.defineOwnProperty('constructFunction', {
        value() {
          spoofCalls += 1;
          return spoof;
        },
        writable: true,
        enumerable: true,
        configurable: true,
      });
      spoof.defineOwnProperty('_isConstructor', {
        value: true,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(realm, 'spoof', spoof);

      assertSame(
        evaluateScript(
          realm,
          'var applyName, constructName;' +
            'try { Reflect.apply(spoof, null, []); }' +
            'catch (error) { applyName = error.name; }' +
            'try { Reflect.construct(spoof, []); }' +
            'catch (error) { constructName = error.name; }' +
            'applyName + ":" + constructName;',
        ).value,
        'TypeError:TypeError',
      );
      assertSame(spoofCalls, 0);
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
    name: 'Reflect get and set distinguish omitted from explicit undefined receivers',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        undefined,
      );
      exotic.setResult = true;
      defineGlobal(realm, 'hostile', exotic);

      assertSame(
        evaluateScript(realm, 'Reflect.get(hostile, "x");').value,
        'get:x',
      );
      assertSame(
        evaluateScript(realm, 'Reflect.get(hostile, "x", undefined);').value,
        'get:x',
      );
      assertSame(
        evaluateScript(realm, 'Reflect.set(hostile, "x", 1);').value,
        true,
      );
      assertSame(
        evaluateScript(realm, 'Reflect.set(hostile, "x", 2, undefined);').value,
        true,
      );

      assertSame(exotic.calls[0][2], exotic);
      assertSame(exotic.calls[1][2], undefined);
      assertSame(exotic.calls[2][3], exotic);
      assertSame(exotic.calls[3][3], undefined);

      assertSame(
        run(
          'var target = {y: 42};' +
            'Object.defineProperty(target, "x", {' +
            'get: function () { "use strict"; return this; }' +
            '});' +
            '(Reflect.get(target, "x") === target) + ":" +' +
            '(Reflect.get(target, "x", undefined) === undefined);',
        ),
        'true:true',
      );
      assertSame(
        run(
          'var target = {x: 1};' +
            'Reflect.set(target, "x", 2, "primitive") + ":" + target.x;',
        ),
        'false:1',
      );
      assertSame(
        run(
          'var receiver;' +
            'var target = {};' +
            'Object.defineProperty(target, "x", {' +
            'set: function (value) { "use strict"; receiver = this; }' +
            '});' +
            'Reflect.set(target, "x", 1, undefined) + ":" +' +
            '(receiver === undefined);',
        ),
        'true:true',
      );
      assertSame(
        run(
          'var key = Symbol("key"); var target = {};' +
            'Reflect.set(target, key, 9) + ":" + Reflect.get(target, key);',
        ),
        'true:9',
      );
      assertSame(
        run(
          'var calls = 0;' +
            'var key = {toString: function () { calls += 1; return "x"; }};' +
            'try { Reflect.get(1, key); } catch (error) {}' +
            'try { Reflect.set(1, key, 2); } catch (error) {}' +
            'calls;',
        ),
        0,
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
    name: 'Reflect.apply and Reflect.construct use detached method Realm semantics across Agents',
    run() {
      const callerRealm = createRealm({ agent: createAgent() });
      const methodRealm = createRealm({ agent: createAgent() });
      const targetRealm = createRealm({ agent: createAgent() });
      const newTargetRealm = createRealm({ agent: createAgent() });
      const reflect = /** @type {EngineObject} */ (
        methodRealm.intrinsics.reflectObject
      );
      const foreignApply = reflect.get('apply', reflect);
      const foreignConstruct = reflect.get('construct', reflect);
      const sentinel = new EngineObject(targetRealm.intrinsics.objectPrototype);
      defineGlobal(targetRealm, 'sentinel', sentinel);
      const applyTarget = evaluateScript(
        targetRealm,
        '(function applyTarget(value) {' +
          'if (value === "throw") { throw sentinel; }' +
          'return this.tag + ":" + value;' +
          '})',
      ).value;
      const constructTarget = evaluateScript(
        targetRealm,
        '(function ConstructTarget(value) { this.value = value; })',
      ).value;
      const newTarget = evaluateScript(
        newTargetRealm,
        '(function NewTarget() {})',
      ).value;

      defineGlobal(callerRealm, 'foreignApply', foreignApply);
      defineGlobal(callerRealm, 'foreignConstruct', foreignConstruct);
      defineGlobal(callerRealm, 'applyTarget', applyTarget);
      defineGlobal(callerRealm, 'constructTarget', constructTarget);
      defineGlobal(callerRealm, 'newTarget', newTarget);

      assertSame(
        evaluateScript(
          callerRealm,
          'foreignApply(applyTarget, {tag: "ok"}, ["value"]);',
        ).value,
        'ok:value',
      );

      const thrown = evaluateScript(
        callerRealm,
        'var caught; try { foreignApply(applyTarget, null, ["throw"]); }' +
          'catch (value) { caught = value; } caught;',
      ).value;
      assertSame(thrown, sentinel);

      const constructed = evaluateScript(
        callerRealm,
        'foreignConstruct(constructTarget, [7], newTarget);',
      ).value;
      assertSame(
        /** @type {EngineObject} */ (constructed).getPrototypeOf(),
        /** @type {EngineObject} */ (newTarget).get('prototype', newTarget),
      );
      assertSame(
        /** @type {EngineObject} */ (constructed).get('value', constructed),
        7,
      );

      const validationError = evaluateScript(
        callerRealm,
        'var caught; try { foreignConstruct(constructTarget, [], () => {}); }' +
          'catch (value) { caught = value; } caught;',
      ).value;
      assertSame(
        /** @type {EngineObject} */ (validationError).getPrototypeOf(),
        methodRealm.intrinsics.typeErrorPrototype,
      );

      const lengthError = evaluateScript(
        callerRealm,
        'var caught; try {' +
          'foreignApply(applyTarget, null, {length: Symbol()});' +
          '} catch (value) { caught = value; } caught;',
      ).value;
      assertSame(
        /** @type {EngineObject} */ (lengthError).getPrototypeOf(),
        methodRealm.intrinsics.typeErrorPrototype,
      );

      assertSame(callerRealm.agent.activeExecutionRealm, null);
      assertSame(methodRealm.agent.activeExecutionRealm, null);
      assertSame(targetRealm.agent.activeExecutionRealm, null);
      assertSame(newTargetRealm.agent.activeExecutionRealm, null);
    },
  },
  {
    name: 'Reflect methods use the detached method Realm for validation, allocation, and abrupt propagation',
    run() {
      for (const separateAgents of [false, true]) {
        const callerAgent = createAgent();
        const methodAgent = separateAgents ? createAgent() : callerAgent;
        const callerRealm = createRealm({ agent: callerAgent });
        const methodRealm = createRealm({ agent: methodAgent });
        const reflect = /** @type {EngineObject} */ (
          methodRealm.intrinsics.reflectObject
        );
        const target = new EngineObject(callerRealm.intrinsics.objectPrototype);
        target.defineOwnProperty('x', {
          value: 1,
          writable: true,
          enumerable: true,
          configurable: true,
        });

        defineGlobal(callerRealm, 'foreignGet', reflect.get('get', reflect));
        defineGlobal(
          callerRealm,
          'foreignGetOwnPropertyDescriptor',
          reflect.get('getOwnPropertyDescriptor', reflect),
        );
        defineGlobal(
          callerRealm,
          'foreignDefineProperty',
          reflect.get('defineProperty', reflect),
        );
        defineGlobal(
          callerRealm,
          'foreignOwnKeys',
          reflect.get('ownKeys', reflect),
        );
        defineGlobal(callerRealm, 'target', target);

        const error = evaluateScript(
          callerRealm,
          'var caught; try { foreignGet(1, "x"); }' +
            'catch (value) { caught = value; } caught;',
        ).value;
        assertSame(
          /** @type {EngineObject} */ (error).getPrototypeOf(),
          methodRealm.intrinsics.typeErrorPrototype,
        );

        const descriptorError = evaluateScript(
          callerRealm,
          'var caught; try {' +
            'foreignDefineProperty(target, "bad", {get: 1});' +
            '} catch (value) { caught = value; } caught;',
        ).value;
        assertSame(
          /** @type {EngineObject} */ (descriptorError).getPrototypeOf(),
          methodRealm.intrinsics.typeErrorPrototype,
        );

        const descriptor = evaluateScript(
          callerRealm,
          'foreignGetOwnPropertyDescriptor(target, "x");',
        ).value;
        assertSame(
          /** @type {EngineObject} */ (descriptor).getPrototypeOf(),
          methodRealm.intrinsics.objectPrototype,
        );

        const keys = evaluateScript(
          callerRealm,
          'foreignOwnKeys(target);',
        ).value;
        assertSame(
          /** @type {EngineObject} */ (keys).getPrototypeOf(),
          methodRealm.intrinsics.arrayPrototype,
        );

        const hostile = new HostileExotic(
          callerRealm.intrinsics.objectPrototype,
          undefined,
        );
        const sentinel = new EngineObject(
          callerRealm.intrinsics.objectPrototype,
        );
        hostile.abrupt.set('get', new ThrowSignal(sentinel));
        defineGlobal(callerRealm, 'hostile', hostile);
        const abrupt = evaluateScript(
          callerRealm,
          'var caught; try { foreignGet(hostile, "x"); }' +
            'catch (value) { caught = value; } caught;',
        ).value;
        assertSame(abrupt, sentinel);
        assertSame(callerAgent.activeExecutionRealm, null);
        assertSame(methodAgent.activeExecutionRealm, null);
      }
    },
  },
  {
    name: 'all Table 5-backed Reflect methods dispatch once in the method Realm',
    run() {
      const realm = createRealm();
      const exotic = new HostileExotic(
        realm.intrinsics.objectPrototype,
        undefined,
      );
      const nextPrototype = new EngineObject(realm.intrinsics.objectPrototype);
      exotic.setPrototypeResult = true;
      exotic.preventExtensionsResult = true;
      exotic.defineOwnPropertyResult = true;
      exotic.deleteResult = true;
      exotic.setResult = true;
      defineGlobal(realm, 'hostile', exotic);
      defineGlobal(realm, 'nextPrototype', nextPrototype);

      evaluateScript(
        realm,
        'Reflect.getPrototypeOf(hostile);' +
          'Reflect.isExtensible(hostile);' +
          'Reflect.ownKeys(hostile);' +
          'Reflect.preventExtensions(hostile);' +
          'Reflect.defineProperty(hostile, "x", {value: 1});' +
          'Reflect.deleteProperty(hostile, "x");' +
          'Reflect.getOwnPropertyDescriptor(hostile, "x");' +
          'Reflect.has(hostile, "x");' +
          'Reflect.setPrototypeOf(hostile, nextPrototype);' +
          'Reflect.get(hostile, "x");' +
          'Reflect.set(hostile, "x", 1);',
      );

      assertSame(
        JSON.stringify(exotic.calls.map((call) => call[0])),
        '["getPrototypeOf","isExtensible","ownPropertyKeys",' +
          '"preventExtensions","defineOwnProperty","delete",' +
          '"getOwnProperty","hasProperty","setPrototypeOf","get","set"]',
      );
      assertSame(
        exotic.activeRealms.every((activeRealm) => activeRealm === realm),
        true,
      );

      const sentinel = new EngineObject(realm.intrinsics.objectPrototype);
      for (const [operation, source] of [
        ['getPrototypeOf', 'Reflect.getPrototypeOf(hostile);'],
        ['isExtensible', 'Reflect.isExtensible(hostile);'],
        ['ownPropertyKeys', 'Reflect.ownKeys(hostile);'],
        ['preventExtensions', 'Reflect.preventExtensions(hostile);'],
        ['get', 'Reflect.get(hostile, "x");'],
        ['set', 'Reflect.set(hostile, "x", 1);'],
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
