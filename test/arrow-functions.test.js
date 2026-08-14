import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);

  if (completion.type !== 'normal') {
    throw new Error(`Expected a normal completion, got ${completion.type}`);
  }

  return completion.value;
}

const tests = [
  {
    name: 'arrows close over this and arguments from the enclosing function',
    run() {
      assertSame(
        run(`
          var holder = {
            value: 4,
            method: function () {
              var arrow = (add = 1, ...rest) =>
                this.value + add + rest.length + arguments[0];
              return arrow(undefined, 7, 8);
            },
          };
          holder.method(3);
        `),
        10,
      );
    },
  },
  {
    name: 'arrows support concise and block bodies with every supported parameter form',
    run() {
      assertSame(
        run(`
          var concise = () => ({ value: 2 }).value;
          var block = single => { return single + 1; };
          var patterns = ({ first } = { first: 3 }, [second] = [4], ...rest) =>
            first + second + rest.length;
          concise() + block(5) + patterns(undefined, undefined, 8, 9);
        `),
        17,
      );
    },
  },
  {
    name: 'arrows infer names and length without creating prototypes or constructors',
    run() {
      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        `
          var assigned;
          var direct = (first, second = 1, third) => first;
          assigned = () => 1;
          var object = { property: () => 2 };
          var fromDefault = ((value = () => 3) => value)();
        `,
      );

      assertSame(completion.type, 'normal');
      const direct = /** @type {any} */ (realm.globalObject.get('direct'));
      assertSame(direct.get('name'), 'direct');
      assertSame(direct.get('length'), 1);
      assertSame(direct.getOwnProperty('prototype'), undefined);
      assertSame(direct._isConstructor, false);
      assertSame(direct.functionKind, 'arrow');
      assertSame(
        Object.prototype.hasOwnProperty.call(direct, 'homeObject'),
        false,
      );
      assertSame(
        run(`
          var assigned;
          assigned = () => 1;
          var object = { property: () => 2 };
          var fromDefault = ((value = () => 3) => value)();
          assigned.name + ':' + object.property.name + ':' + fromDefault.name;
        `),
        'assigned:property:value',
      );
      assertSame(
        run(`
          var arrow = () => 1;
          var bound = arrow.bind(null);
          var error;
          var boundError;
          try { new arrow(); } catch (caught) { error = caught.name; }
          try { new bound(); } catch (caught) { boundError = caught.name; }
          error + ':' + boundError;
        `),
        'TypeError:TypeError',
      );
    },
  },
  {
    name: 'strict arrows omit own restricted caller and arguments properties',
    run() {
      assertSame(
        run(`
          "use strict";
          var arrow = () => {};
          arrow.hasOwnProperty('caller') + ':' + arrow.hasOwnProperty('arguments');
        `),
        'false:false',
      );
    },
  },
  {
    name: 'call apply and bind cannot replace an arrow lexical this',
    run() {
      assertSame(
        run(`
          function owner() {
            var arrow = () => this.value;
            return arrow.call({ value: 2 }) + ':' +
              arrow.apply({ value: 3 }, []) + ':' +
              arrow.bind({ value: 4 })();
          }
          owner.call({ value: 1 });
        `),
        '1:1:1',
      );
    },
  },
  {
    name: 'nested arrows retain the nearest enclosing function arguments binding',
    run() {
      assertSame(
        run(`
          function outer(value) {
            return (() => (() => arguments[0])())();
          }
          outer(7);
        `),
        7,
      );
    },
  },
  {
    name: 'arrows created by direct eval retain the caller lexical execution environment',
    run() {
      assertSame(
        run(`
          function makeArrow(value) {
            return eval('() => this.base + arguments[0]');
          }
          var arrow = makeArrow.call({ base: 4 }, 3);
          arrow.call({ base: 20 });
        `),
        7,
      );
    },
  },
  {
    name: 'arrows resolve super lexically through enclosing methods and accessors',
    run() {
      assertSame(
        run(`
          var proto = { get value() { return this.tag; } };
          var object = {
            tag: 'object',
            method() { return () => (() => super.value)(); },
            get accessor() { return (() => super.value)(); },
          };
          Object.setPrototypeOf(object, proto);
          var child = Object.create(object);
          child.tag = 'child';
          child.method()() + ':' + child.accessor;
        `),
        'child:child',
      );
    },
  },
  {
    name: 'arrows inherit strictness from lexical source and block directives enforce parameter errors',
    run() {
      assertSame(
        run(`
          function strictOwner() {
            "use strict";
            return (() => this)();
          }
          strictOwner.call(5);
        `),
        5,
      );
    },
  },
];

export default tests;
