import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  return evaluateScript(createRealm(), source).value;
}

const tests = [
  {
    name: 'Boolean called as a function converts its argument with ToBoolean and never boxes',
    run() {
      assertSame(run('typeof Boolean(true);'), 'boolean');
      assertSame(run('Boolean();'), false);
      assertSame(run('Boolean(undefined);'), false);
      assertSame(run('Boolean(null);'), false);
      assertSame(run('Boolean(0);'), false);
      assertSame(run('Boolean(-0);'), false);
      assertSame(run('Boolean(NaN);'), false);
      assertSame(run('Boolean("");'), false);
      assertSame(run('Boolean(1);'), true);
      assertSame(run('Boolean(-1);'), true);
      assertSame(run('Boolean("0");'), true);
      assertSame(run('Boolean("false");'), true);
      assertSame(run('Boolean({});'), true);
      assertSame(run('Boolean([]);'), true);
      assertSame(run('Boolean(function () {});'), true);
    },
  },
  {
    name: 'new Boolean boxes the ToBoolean-converted primitive as a Boolean object',
    run() {
      assertSame(run('typeof new Boolean(true);'), 'object');
      assertSame(
        run('Object.prototype.toString.call(new Boolean(true));'),
        '[object Boolean]',
      );
      assertSame(run('new Boolean(true) instanceof Boolean;'), true);
      assertSame(run('new Boolean("nonempty").valueOf();'), true);
      assertSame(run('new Boolean("").valueOf();'), false);
      assertSame(run('new Boolean().valueOf();'), false);
      assertSame(run('new Boolean(0).valueOf();'), false);
      assertSame(run('new Boolean(1).valueOf();'), true);
    },
  },
  {
    name: 'a Boolean object boxing false is still truthy, unlike the primitive false it wraps',
    run() {
      assertSame(run('new Boolean(false) ? "truthy" : "falsy";'), 'truthy');
      assertSame(run('Boolean(new Boolean(false));'), true);
      assertSame(run('!!new Boolean(false);'), true);
      assertSame(run('!new Boolean(false);'), false);
      assertSame(run('false ? "truthy" : "falsy";'), 'falsy');
    },
  },
  {
    name: 'Boolean.prototype.toString and valueOf work on primitives and matching wrapper objects',
    run() {
      assertSame(run('true.toString();'), 'true');
      assertSame(run('false.toString();'), 'false');
      assertSame(run('(new Boolean(true)).toString();'), 'true');
      assertSame(run('(new Boolean(false)).toString();'), 'false');
      assertSame(run('true.valueOf();'), true);
      assertSame(run('false.valueOf();'), false);
      assertSame(run('(new Boolean(true)).valueOf();'), true);
      assertSame(run('(new Boolean(false)).valueOf();'), false);
      assertSame(run('Boolean.prototype.toString();'), 'false');
      assertSame(run('Boolean.prototype.valueOf();'), false);
    },
  },
  {
    name: 'Boolean.prototype.valueOf and toString accept a matching wrapper from a foreign realm',
    run() {
      const first = createRealm();
      const second = createRealm();

      evaluateScript(first, 'var boxed = new Boolean(true);');

      const boxed = first.globalObject.get('boxed');

      second.globalObject.defineOwnProperty('foreign', {
        value: boxed,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      assertSame(
        evaluateScript(second, 'foreign instanceof Boolean;').value,
        false,
      );
      assertSame(
        evaluateScript(second, 'Boolean.prototype.valueOf.call(foreign);')
          .value,
        true,
      );
      assertSame(
        evaluateScript(second, 'Boolean.prototype.toString.call(foreign);')
          .value,
        'true',
      );
    },
  },
  {
    name: 'Boolean.prototype.toString and valueOf reject incompatible receivers with a guest TypeError',
    run() {
      assertSame(
        run(
          'var name; try { Boolean.prototype.toString.call(1); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Boolean.prototype.valueOf.call("true"); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Boolean.prototype.toString.call({}); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Boolean.prototype.valueOf.call(undefined); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );
      assertSame(
        run(
          'var name; try { Boolean.prototype.valueOf.call(new Number(1)); } ' +
            'catch (error) { name = error.name; } name;',
        ),
        'TypeError',
      );

      const realm = createRealm();
      const completion = evaluateScript(
        realm,
        'Boolean.prototype.toString.call(5);',
      );

      assertSame(completion.type, 'throw');
      assertSame(
        /** @type {{ get: (key: string) => unknown }} */ (completion.value).get(
          'name',
        ),
        'TypeError',
      );
    },
  },
  {
    name: 'Boolean, Boolean.prototype.toString, and Boolean.prototype.valueOf carry ES5 length/name and descriptors',
    run() {
      assertSame(run('Boolean.length;'), 1);
      assertSame(run('Boolean.name;'), 'Boolean');
      assertSame(run('Boolean.prototype.toString.length;'), 0);
      assertSame(run('Boolean.prototype.toString.name;'), 'toString');
      assertSame(run('Boolean.prototype.valueOf.length;'), 0);
      assertSame(run('Boolean.prototype.valueOf.name;'), 'valueOf');

      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Boolean.prototype, "valueOf"); ' +
            'd.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:false:true',
      );
      assertSame(
        run(
          'var d = Object.getOwnPropertyDescriptor(Boolean.prototype, "toString"); ' +
            'd.writable + ":" + d.enumerable + ":" + d.configurable;',
        ),
        'true:false:true',
      );
    },
  },
];

export default tests;
