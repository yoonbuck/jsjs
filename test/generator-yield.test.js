import { assertSame } from './harness/assert.js';
import { createRealm } from '../src/runtime/realm.js';
import { evaluateScript } from '../src/api.js';
import { EngineObject } from '../src/runtime/object.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const completion = evaluateScript(createRealm(), source);

  if (completion.type !== 'normal') {
    const detail =
      completion.value instanceof EngineObject
        ? `: ${String(completion.value.get('name'))}: ${String(
            completion.value.get('message'),
          )}`
        : '';
    throw new Error(
      `Expected normal completion, got ${completion.type}${detail}`,
    );
  }

  return completion.value;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'yield expressions suspend and receive each following next value',
    run() {
      assertSame(
        run(`
          function* g() {
            var first = yield 1;
            var second = yield first + 1;
            return second;
          }
          var iterator = g();
          var first = iterator.next(99);
          var second = iterator.next(10);
          var third = iterator.next(20);
          [
            first.value,
            first.done,
            second.value,
            second.done,
            third.value,
            third.done
          ].join(':');
        `),
        '1:false:11:false:20:true',
      );
    },
  },
  {
    name: 'bare yield, empty statements, and return yield preserve resume values',
    run() {
      assertSame(
        run(`
          function* g() {
            ;
            var received = yield;
            ;
            return yield received;
          }
          var iterator = g();
          var first = iterator.next('ignored');
          var second = iterator.next(7);
          var third = iterator.next(9);
          [
            first.value,
            first.done,
            second.value,
            second.done,
            third.value,
            third.done
          ].join(':');
        `),
        ':false:7:false:9:true',
      );
    },
  },
  {
    name: 'resumable declaration lists apply NamedEvaluation before later yields',
    run() {
      assertSame(
        run(`
          function* g() {
            var fn = function () {}, first = yield 'var-ready';
            let arrow = () => {}, second = yield 'let-ready';
            const Klass = class {}, third = yield 'const-ready';
            return [
              fn.name,
              arrow.name,
              Klass.name,
              first,
              second,
              third
            ].join(':');
          }
          var iterator = g();
          var first = iterator.next();
          var second = iterator.next(1);
          var third = iterator.next(2);
          var result = iterator.next(3);
          [
            first.value,
            second.value,
            third.value,
            result.value,
            result.done
          ].join('|');
        `),
        'var-ready|let-ready|const-ready|fn:arrow:Klass:1:2:3|true',
      );
    },
  },
  {
    name: 'throw statements and injected throw and return completions leave a suspended yield abruptly',
    run() {
      assertSame(
        run(`
          var statementReason = {};
          function* throwingStatement() {
            throw yield 'statement-ready';
          }
          var statementIterator = throwingStatement();
          var statementStep = statementIterator.next();
          var statementCaught = false;
          try {
            statementIterator.next(statementReason);
          } catch (error) {
            statementCaught = error === statementReason;
          }

          var injectedReason = {};
          function* suspended() {
            yield 'pause';
            return 'unreachable';
          }
          var throwIterator = suspended();
          throwIterator.next();
          var injectedCaught = false;
          try {
            throwIterator.throw(injectedReason);
          } catch (error) {
            injectedCaught = error === injectedReason;
          }

          var returnIterator = suspended();
          returnIterator.next();
          var returned = returnIterator.return(42);
          [
            statementStep.value,
            statementStep.done,
            statementCaught,
            injectedCaught,
            returned.value,
            returned.done
          ].join(':');
        `),
        'statement-ready:false:true:true:42:true',
      );
    },
  },
  {
    name: 'binary logical conditional and sequence frames retain earlier operands',
    run() {
      assertSame(
        run(`
          var log = [];
          function mark(label, value) {
            log.push(label);
            return value;
          }
          function* g() {
            var binary =
              mark('binary-left', 2) + (yield mark('binary-right', 3));
            var logical =
              mark('logical-left', 1) && (yield mark('logical-right', 4));
            var conditional =
              mark('test', 0)
                ? mark('wrong', 0)
                : (yield mark('alternate', 5));
            var sequence = (
              mark('sequence-first', 6),
              yield mark('sequence-yield', 7),
              mark('sequence-last', 8)
            );
            var shortCircuit =
              mark('short', 0) && (yield mark('never', 9));
            return [
              binary,
              logical,
              conditional,
              sequence,
              shortCircuit,
              log.join(',')
            ].join('|');
          }
          var iterator = g();
          var first = iterator.next();
          var second = iterator.next(10);
          var third = iterator.next(20);
          var fourth = iterator.next(30);
          var result = iterator.next(40);
          [
            first.value,
            second.value,
            third.value,
            fourth.value,
            result.value,
            result.done
          ].join(':');
        `),
        '3:4:5:7:12|20|30|8|0|binary-left,binary-right,logical-left,logical-right,test,alternate,sequence-first,sequence-yield,sequence-last,short:true',
      );
    },
  },
  {
    name: 'unary delete update and member frames retain references and computed bases',
    run() {
      assertSame(
        run(`
          var log = [];
          var holder = { removable: 1 };
          var box = { value: 5 };
          function getBox() {
            log.push('base');
            return box;
          }
          function keyPrefix() {
            log.push('key');
            return 'key-ready';
          }
          function* g() {
            var unary = -(yield 'unary-ready');
            var deleted = delete holder[yield 'delete-ready'];
            var old = getBox()[yield keyPrefix()]++;
            var fresh = ++getBox()[yield keyPrefix()];
            return [
              unary,
              deleted,
              old,
              fresh,
              box.value,
              'removable' in holder,
              log.join(',')
            ].join(':');
          }
          var iterator = g();
          var unary = iterator.next();
          var deletion = iterator.next(4);
          var postfix = iterator.next('removable');
          var prefix = iterator.next('value');
          var result = iterator.next('value');
          [
            unary.value,
            deletion.value,
            postfix.value,
            prefix.value,
            result.value,
            result.done
          ].join('|');
        `),
        'unary-ready|delete-ready|key-ready|key-ready|-4:true:5:7:7:false:base,key,base,key|true',
      );
    },
  },
  {
    name: 'compound assignment saves its target reference and old value across yield',
    run() {
      assertSame(
        run(`
          var log = [];
          var box = { value: 1 };
          function target() {
            log.push('target');
            return box;
          }
          function key() {
            log.push('key');
            return 'value';
          }
          function rhsPrefix() {
            log.push('rhs');
            return 'rhs-ready';
          }
          function* g() {
            target()[key()] += yield rhsPrefix();
            return box.value;
          }
          var iterator = g();
          var first = iterator.next();
          var before = log.join(',');
          var result = iterator.next(4);
          [
            first.value,
            first.done,
            before,
            result.value,
            result.done,
            log.join(',')
          ].join(':');
        `),
        'rhs-ready:false:target,key,rhs:5:true:target,key,rhs',
      );
    },
  },
  {
    name: 'call frames save callee and arguments in left-to-right order',
    run() {
      assertSame(
        run(`
          var log = [];
          function callTarget() {
            log.push('callee');
            return function (first, second, third) {
              log.push('call');
              return first + second + third;
            };
          }
          function arg1() {
            log.push('arg1');
            return 1;
          }
          function arg2() {
            log.push('arg2');
            return 'arg2-ready';
          }
          function arg3() {
            log.push('arg3');
            return 3;
          }
          function* g() {
            return callTarget()(arg1(), yield arg2(), arg3());
          }
          var iterator = g();
          var first = iterator.next();
          var before = log.join(',');
          var result = iterator.next(2);
          [
            first.value,
            first.done,
            before,
            result.value,
            result.done,
            log.join(',')
          ].join(':');
        `),
        'arg2-ready:false:callee,arg1,arg2:6:true:callee,arg1,arg2,arg3,call',
      );
    },
  },
  {
    name: 'call frames retain reference this and direct eval identity across suspension',
    run() {
      assertSame(
        run(`
          var log = [];
          var receiver = {
            base: 10,
            method: function (value) {
              log.push(this === receiver ? 'this' : 'wrong-this');
              return this.base + value;
            }
          };
          function keyPrefix() {
            log.push('key');
            return 'key-ready';
          }
          function argPrefix() {
            log.push('arg');
            return 'arg-ready';
          }
          function* methodCall() {
            return receiver[yield keyPrefix()](yield argPrefix());
          }
          var methodIterator = methodCall();
          var keyStep = methodIterator.next();
          var argStep = methodIterator.next('method');
          receiver.method = function () {
            return -1;
          };
          var methodResult = methodIterator.next(5);

          function* directEval() {
            var local = 7;
            return eval(yield 'source-ready');
          }
          var evalIterator = directEval();
          var evalStep = evalIterator.next();
          eval = function () {
            return -1;
          };
          var evalResult = evalIterator.next('local + 1');
          [
            keyStep.value,
            argStep.value,
            methodResult.value,
            methodResult.done,
            evalStep.value,
            evalResult.value,
            evalResult.done,
            log.join(',')
          ].join(':');
        `),
        'key-ready:arg-ready:15:true:source-ready:8:true:key,arg,this',
      );
    },
  },
  {
    name: 'call frames append large resumed spread lists without host argument spread',
    run() {
      assertSame(
        run(`
          var values = new Array(150000);
          function* g() {
            return Array(...(yield 'call-ready')).length;
          }
          var iterator = g();
          var first = iterator.next();
          var result = iterator.next(values);
          [first.value, result.value, result.done].join(':');
        `),
        'call-ready:150000:true',
      );
    },
  },
  {
    name: 'new frames retain the constructor and expand spread arguments after resume',
    run() {
      assertSame(
        run(`
          var log = [];
          function C(first, second, third, fourth) {
            log.push('construct');
            this.total = first + second + third + fourth;
          }
          function constructorTarget() {
            log.push('constructor');
            return C;
          }
          function first() {
            log.push('first');
            return 1;
          }
          function spreadPrefix() {
            log.push('spread');
            return 'spread-ready';
          }
          function fourth() {
            log.push('fourth');
            return 4;
          }
          function* g() {
            return new (constructorTarget())(
              first(),
              ...(yield spreadPrefix()),
              fourth()
            );
          }
          var iterator = g();
          var firstStep = iterator.next();
          var before = log.join(',');
          C = function () {
            throw 'wrong constructor';
          };
          var result = iterator.next([2, 3]);
          [
            firstStep.value,
            firstStep.done,
            before,
            result.value.total,
            result.done,
            log.join(',')
          ].join(':');
        `),
        'spread-ready:false:constructor,first,spread:10:true:constructor,first,spread,fourth,construct',
      );
    },
  },
  {
    name: 'new frames append large resumed spread lists without host argument spread',
    run() {
      assertSame(
        run(`
          var values = new Array(150000);
          function* g() {
            return new Array(...(yield 'new-ready')).length;
          }
          var iterator = g();
          var first = iterator.next();
          var result = iterator.next(values);
          [first.value, result.value, result.done].join(':');
        `),
        'new-ready:150000:true',
      );
    },
  },
  {
    name: 'array frames preserve holes and expand spread elements once',
    run() {
      assertSame(
        run(`
          var log = [];
          function first() {
            log.push('first');
            return 1;
          }
          function spreadPrefix() {
            log.push('spread');
            return 'spread-ready';
          }
          function lastPrefix() {
            log.push('last');
            return 'last-ready';
          }
          function* g() {
            return [, first(), ...(yield spreadPrefix()), yield lastPrefix(), ,];
          }
          var iterator = g();
          var spreadStep = iterator.next();
          var lastStep = iterator.next([2, 3]);
          var result = iterator.next(4);
          var array = result.value;
          [
            spreadStep.value,
            lastStep.value,
            result.done,
            array.length,
            0 in array,
            array[1],
            array[2],
            array[3],
            array[4],
            5 in array,
            log.join(',')
          ].join(':');
        `),
        'spread-ready:last-ready:true:6:false:1:2:3:4:false:first,spread,last',
      );
    },
  },
  {
    name: 'template and tagged-template frames preserve substitutions tag and receiver',
    run() {
      assertSame(
        run(`
          var log = [];
          function before() {
            log.push('plain-before');
            return 1;
          }
          function middle() {
            log.push('plain-middle');
            return 'plain-ready';
          }
          function after() {
            log.push('plain-after');
            return 3;
          }
          function* plain() {
            return \`a\${before()}b\${yield middle()}c\${after()}d\`;
          }
          var plainIterator = plain();
          var plainStep = plainIterator.next();
          var plainResult = plainIterator.next(2);

          var receiver = {
            prefix: 'T',
            tag: function (site, first, second) {
              log.push(this === receiver ? 'tag-this' : 'wrong-tag-this');
              return (
                this.prefix +
                site[0] +
                first +
                site[1] +
                second +
                site[2]
              );
            }
          };
          function tagFirst() {
            log.push('tag-first');
            return 4;
          }
          function tagSecond() {
            log.push('tag-second');
            return 'tag-ready';
          }
          function* tagged() {
            return receiver.tag\`x\${tagFirst()}y\${yield tagSecond()}z\`;
          }
          var taggedIterator = tagged();
          var taggedStep = taggedIterator.next();
          receiver.tag = function () {
            return 'wrong tag';
          };
          var taggedResult = taggedIterator.next(5);
          [
            plainStep.value,
            plainResult.value,
            plainResult.done,
            taggedStep.value,
            taggedResult.value,
            taggedResult.done,
            log.join(',')
          ].join(':');
        `),
        'plain-ready:a1b2c3d:true:tag-ready:Tx4y5z:true:plain-before,plain-middle,plain-after,tag-first,tag-second,tag-this',
      );
    },
  },
  {
    name: 'super member and call frames retain home object and receiver state',
    run() {
      assertSame(
        run(`
          var log = [];
          var prototype = {
            inherited: 3,
            combine: function (first, second) {
              log.push(this === object ? 'super-this' : 'wrong-super-this');
              return this.own + first + second;
            }
          };
          function keyPrefix() {
            log.push('key');
            return 'key-ready';
          }
          function first() {
            log.push('first');
            return 1;
          }
          function second() {
            log.push('second');
            return 'second-ready';
          }
          var object = {
            __proto__: prototype,
            own: 10,
            *run() {
              var inherited = super[yield keyPrefix()];
              return inherited + super.combine(first(), yield second());
            }
          };
          var iterator = object.run();
          var keyStep = iterator.next();
          var secondStep = iterator.next('inherited');
          var result = iterator.next(2);
          [
            keyStep.value,
            secondStep.value,
            result.value,
            result.done,
            log.join(',')
          ].join(':');
        `),
        'key-ready:second-ready:16:true:key,first,second,super-this',
      );
    },
  },
  {
    name: 'resumed super reads reject a null super base',
    run() {
      assertSame(
        run(`
          var object = {
            __proto__: null,
            *read() {
              return super[yield 'read-key-ready'];
            }
          };
          var iterator = object.read();
          var first = iterator.next();
          var outcome = 'no-error';
          try {
            iterator.next('missing');
          } catch (error) {
            outcome = error.name;
          }
          [first.value, first.done, outcome].join(':');
        `),
        'read-key-ready:false:TypeError',
      );
    },
  },
  {
    name: 'resumed super calls reject a null base before arguments',
    run() {
      assertSame(
        run(`
          var log = [];
          function argument() {
            log.push('argument');
            return 'argument-ready';
          }
          var object = {
            __proto__: null,
            *call() {
              return super[yield 'call-key-ready'](yield argument());
            }
          };
          var iterator = object.call();
          var first = iterator.next();
          var outcome = 'no-error';
          try {
            iterator.next('missing');
          } catch (error) {
            outcome = error.name;
          }
          [first.value, outcome, log.join(',')].join(':');
        `),
        'call-key-ready:TypeError:',
      );
    },
  },
  {
    name: 'resumed super assignments reject a null base after the right side',
    run() {
      assertSame(
        run(`
          var log = [];
          function rightSide() {
            log.push('right');
            return 7;
          }
          var object = {
            __proto__: null,
            *assign() {
              super[yield 'assignment-key-ready'] = rightSide();
            }
          };
          var iterator = object.assign();
          var first = iterator.next();
          var outcome = 'no-error';
          try {
            iterator.next('written');
          } catch (error) {
            outcome = error.name;
          }
          [
            first.value,
            outcome,
            log.join(','),
            'written' in object
          ].join(':');
        `),
        'assignment-key-ready:TypeError:right:false',
      );
    },
  },
  {
    name: 'yield-free bridge converts guest throws and guest errors into machine completions',
    run() {
      assertSame(
        run(`
          var reason = {};
          function fail() {
            throw reason;
          }
          function* throwingCall() {
            yield 'throw-ready';
            return 1 + fail();
          }
          var callIterator = throwingCall();
          callIterator.next();
          var sameReason = false;
          try {
            callIterator.next();
          } catch (error) {
            sameReason = error === reason;
          }

          function* missingBinding() {
            yield 'error-ready';
            return absentGeneratorBinding;
          }
          var bindingIterator = missingBinding();
          bindingIterator.next();
          var errorName = '';
          try {
            bindingIterator.next();
          } catch (error) {
            errorName = error.name;
          }
          sameReason + ':' + errorName;
        `),
        'true:ReferenceError',
      );
    },
  },
];

export default tests;
