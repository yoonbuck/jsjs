import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * @param {string} source
 * @returns {{ type: string, value: unknown }}
 */
function run(source) {
  return runIn(createRealm(), source);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {{ type: string, value: unknown }}
 */
function runIn(realm, source) {
  return evaluateScript(realm, source);
}

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {unknown} expected
 * @returns {void}
 */
function assertNormal(completion, expected) {
  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {readonly string[]} args
 * @returns {void}
 */
function assertGeneratorSyntaxError(realm, args) {
  const argumentSource = args.map((value) => JSON.stringify(value)).join(', ');
  const completion = runIn(
    realm,
    `function* sample() {}
     var GF = sample.constructor;
     GF(${argumentSource});`,
  );

  assertSame(completion.type, 'throw');

  if (!(completion.value instanceof EngineObject)) {
    throw new Error('Expected a guest SyntaxError object');
  }

  assertSame(
    completion.value.getPrototype(),
    realm.intrinsics.syntaxErrorPrototype,
  );
}

/**
 * @param {import('../src/runtime/realm.js').Realm} owner
 * @param {import('../src/runtime/realm.js').Realm} caller
 * @returns {void}
 */
function publishGeneratorFunction(owner, caller) {
  caller.globalObject.defineOwnProperty('ForeignGeneratorFunction', {
    value: owner.intrinsics.generatorFunctionConstructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'GeneratorFunction is inherited without a global and call and construct create generators',
    run() {
      assertNormal(
        run(`
          (function () {
            function* sample() {}
            var GeneratorFunction = sample.constructor;
            var called = GeneratorFunction('a', 'yield a; return 2;');
            var constructed = new GeneratorFunction('a', 'yield a; return 2;');
            var calledIterator = called(4);
            var constructedIterator = constructed(5);
            var calledYield = calledIterator.next();
            var calledReturn = calledIterator.next();
            var constructedYield = constructedIterator.next();
            var constructedReturn = constructedIterator.next();
            var calledError;
            var constructedError;

            try {
              new called();
            } catch (error) {
              calledError = error.name;
            }

            try {
              new constructed();
            } catch (error) {
              constructedError = error.name;
            }

            return [
              typeof GeneratorFunction,
              typeof this.GeneratorFunction,
              typeof called,
              typeof constructed,
              called.name,
              constructed.name,
              called.length,
              constructed.length,
              Object.getPrototypeOf(called) === GeneratorFunction.prototype,
              Object.getPrototypeOf(constructed) === GeneratorFunction.prototype,
              Object.getPrototypeOf(called.prototype) === GeneratorFunction.prototype.prototype,
              Object.getPrototypeOf(constructed.prototype) === GeneratorFunction.prototype.prototype,
              calledYield.value,
              calledYield.done,
              calledReturn.value,
              calledReturn.done,
              constructedYield.value,
              constructedYield.done,
              constructedReturn.value,
              constructedReturn.done,
              calledError,
              constructedError
            ].join(':');
          })();
        `),
        'function:undefined:function:function:anonymous:anonymous:1:1:true:true:true:true:4:false:2:true:5:false:2:true:TypeError:TypeError',
      );
    },
  },
  {
    name: 'GeneratorFunction splits zero one and many arguments like Function',
    run() {
      assertNormal(
        run(`
          function* sample() {}
          var GF = sample.constructor;
          var empty = GF();
          var bodyOnly = GF('yield 7;');
          var many = GF('a', 'b', 'yield a + b;');
          var grouped = GF('a, b', 'c', 'yield a + b + c;');
          var emptyResult = empty().next();
          var bodyResult = bodyOnly().next();
          var manyResult = many(2, 3).next();
          var groupedResult = grouped(1, 2, 3).next();

          [
            empty.length,
            emptyResult.value === undefined,
            emptyResult.done,
            bodyOnly.length,
            bodyResult.value,
            bodyResult.done,
            many.length,
            manyResult.value,
            manyResult.done,
            grouped.length,
            groupedResult.value
          ].join(':');
        `),
        '0:true:true:0:7:false:2:5:false:3:6',
      );
    },
  },
  {
    name: 'GeneratorFunction coerces arguments left to right and short-circuits abrupt coercion',
    run() {
      assertNormal(
        run(`
          function* sample() {}
          var GF = sample.constructor;
          var log = '';
          var marker = {};

          function part(tag, text) {
            return {
              toString: function () {
                log += tag;
                return text;
              }
            };
          }

          var generated = GF(
            part('p1', 'a'),
            part('p2', 'b'),
            part('body', 'yield a + b;')
          );
          var yielded = generated(2, 3).next();
          var bad = {
            toString: function () {
              log += 'bad';
              throw marker;
            }
          };
          var skipped = part('skipped', 'yield 0;');
          var preserved;

          try {
            GF(bad, skipped);
          } catch (error) {
            preserved = error === marker;
          }

          log + '|' + yielded.value + ':' + yielded.done + ':' + preserved;
        `),
        'p1p2bodybad|5:false:true',
      );
    },
  },
  {
    name: 'GeneratorFunction keeps comments bounded and independently rejects escaped fragments',
    run() {
      assertNormal(
        run(`
          function* sample() {}
          var GF = sample.constructor;
          var generated = GF(
            'value // parameter comment',
            'yield value; // body comment'
          );
          var result = generated(9).next();
          result.value + ':' + result.done;
        `),
        '9:false',
      );

      const realm = createRealm();

      assertGeneratorSyntaxError(realm, [') { yield 99; /*', '/**/']);
      assertGeneratorSyntaxError(realm, ['value', '*/ yield value;']);
      assertGeneratorSyntaxError(realm, [
        'value',
        'yield value;} function* escaped(){',
      ]);
    },
  },
  {
    name: 'GeneratorFunction rejects yield in formal parameters',
    run() {
      const realm = createRealm();

      assertGeneratorSyntaxError(realm, ['value = yield 1', 'yield value;']);
      assertGeneratorSyntaxError(realm, ['yield', 'yield 1;']);
    },
  },
  {
    name: 'GeneratorFunction ignores caller strictness and obeys its body directive',
    run() {
      assertNormal(
        run(`
          "use strict";
          function* sample() {}
          var GF = sample.constructor;
          var sloppy = GF(
            'dynamicGeneratorGlobal = 5; yield dynamicGeneratorGlobal;'
          );
          var strict = GF('"use strict"; yield this;');
          var sloppyResult = sloppy().next();
          var strictResult = strict().next();
          sloppyResult.value + ':' + (strictResult.value === undefined);
        `),
        '5:true',
      );
    },
  },
  {
    name: 'GeneratorFunction body strictness controls parameter early errors',
    run() {
      assertNormal(
        run(`
          function* sample() {}
          var GF = sample.constructor;
          GF('value', 'value', 'yield value;')(1, 2).next().value;
        `),
        2,
      );

      const realm = createRealm();

      assertGeneratorSyntaxError(realm, [
        'value',
        'value',
        '"use strict"; yield value;',
      ]);
      assertGeneratorSyntaxError(realm, [
        'value = 1',
        '"use strict"; yield value;',
      ]);
    },
  },
  {
    name: 'GeneratorFunction rejects async generators modules and post-ES2015 syntax',
    run() {
      const realm = createRealm();

      assertGeneratorSyntaxError(realm, ['async function* later() {}']);
      assertGeneratorSyntaxError(realm, ['import value from "module";']);
      assertGeneratorSyntaxError(realm, ['yield value?.field;']);
    },
  },
  {
    name: 'GeneratorFunction closes over its Realm global environment rather than caller locals',
    run() {
      assertNormal(
        run(`
          var marker = 'global';
          function* sample() {}
          var GF = sample.constructor;

          function outer() {
            var marker = 'local';
            return GF('yield marker;')().next().value;
          }

          outer();
        `),
        'global',
      );
    },
  },
  {
    name: 'cross-Realm GeneratorFunction call and construct allocate every generator artifact in the owner Realm',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();

      realmA.globalObject.defineOwnProperty('marker', {
        value: 'A',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      realmB.globalObject.defineOwnProperty('marker', {
        value: 'B',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      publishGeneratorFunction(realmA, realmB);

      assertNormal(
        runIn(
          realmB,
          `
            var called = ForeignGeneratorFunction(
              'yield marker; return marker + "-done";'
            );
            var constructed = new ForeignGeneratorFunction(
              'yield marker; return marker + "-done";'
            );
            var calledIterator = called();
            var constructedIterator = constructed();
            var calledYield = calledIterator.next();
            var calledReturn = calledIterator.next();
            var constructedYield = constructedIterator.next();
          `,
        ),
        undefined,
      );

      const called =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          realmB.globalObject.get('called')
        );
      const constructed =
        /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
          realmB.globalObject.get('constructed')
        );
      const calledPrototype = /** @type {EngineObject} */ (
        called.get('prototype')
      );
      const constructedPrototype = /** @type {EngineObject} */ (
        constructed.get('prototype')
      );
      const calledIterator = /** @type {EngineObject} */ (
        realmB.globalObject.get('calledIterator')
      );
      const constructedIterator = /** @type {EngineObject} */ (
        realmB.globalObject.get('constructedIterator')
      );
      const calledYield = /** @type {EngineObject} */ (
        realmB.globalObject.get('calledYield')
      );
      const calledReturn = /** @type {EngineObject} */ (
        realmB.globalObject.get('calledReturn')
      );
      const constructedYield = /** @type {EngineObject} */ (
        realmB.globalObject.get('constructedYield')
      );

      assertSame(
        called.getPrototype(),
        realmA.intrinsics.generatorFunctionPrototype,
      );
      assertSame(
        constructed.getPrototype(),
        realmA.intrinsics.generatorFunctionPrototype,
      );
      assertSame(
        calledPrototype.getPrototype(),
        realmA.intrinsics.generatorPrototype,
      );
      assertSame(
        constructedPrototype.getPrototype(),
        realmA.intrinsics.generatorPrototype,
      );
      assertSame(calledIterator.getPrototype(), calledPrototype);
      assertSame(constructedIterator.getPrototype(), constructedPrototype);
      assertSame(calledYield.getPrototype(), realmA.intrinsics.objectPrototype);
      assertSame(
        calledReturn.getPrototype(),
        realmA.intrinsics.objectPrototype,
      );
      assertSame(
        constructedYield.getPrototype(),
        realmA.intrinsics.objectPrototype,
      );
      assertSame(
        calledYield.getPrototype() === realmB.intrinsics.objectPrototype,
        false,
      );
      assertSame(calledYield.get('value'), 'A');
      assertSame(calledYield.get('done'), false);
      assertSame(calledReturn.get('value'), 'A-done');
      assertSame(calledReturn.get('done'), true);
      assertSame(constructedYield.get('value'), 'A');
      assertSame(called.realm, realmA);
      assertSame(constructed.realm, realmA);
      assertSame(called.scope, realmA.globalEnvironment);
      assertSame(constructed.scope, realmA.globalEnvironment);
      assertSame(called._isConstructor, false);
      assertSame(constructed._isConstructor, false);
    },
  },
  {
    name: 'cross-Realm GeneratorFunction parse failures use the owner Realm SyntaxError',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();

      publishGeneratorFunction(realmA, realmB);

      const completion = runIn(
        realmB,
        `ForeignGeneratorFunction('value /*', 'yield value;');`,
      );

      assertSame(completion.type, 'throw');

      if (!(completion.value instanceof EngineObject)) {
        throw new Error('Expected a guest SyntaxError object');
      }

      assertSame(
        completion.value.getPrototype(),
        realmA.intrinsics.syntaxErrorPrototype,
      );
      assertSame(
        completion.value.getPrototype() ===
          realmB.intrinsics.syntaxErrorPrototype,
        false,
      );
    },
  },
  {
    name: 'cross-Realm dynamic generator preserves a foreign thrown value by identity',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();

      publishGeneratorFunction(realmA, realmB);

      const completion = runIn(
        realmB,
        `
          var foreignThrown = {};
          var throwing = ForeignGeneratorFunction(
            'value',
            'yield 0; throw value;'
          );
          var iterator = throwing(foreignThrown);
          iterator.next();
          iterator.next();
        `,
      );

      assertSame(completion.type, 'throw');
      assertSame(completion.value, realmB.globalObject.get('foreignThrown'));
    },
  },
];

export default tests;
