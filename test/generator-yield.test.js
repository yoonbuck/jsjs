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
    name: 'yield classification snapshots include nested yield arguments',
    run() {
      assertSame(
        run(`
          function* g() {
            return yield (yield 1);
          }
          var iterator = g();
          var first = iterator.next();
          var second = iterator.next(2);
          var third = iterator.next(3);
          [
            first.value,
            first.done,
            second.value,
            second.done,
            third.value,
            third.done
          ].join(':');
        `),
        '1:false:2:false:3:true',
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
    name: 'generator super reads capture their base before key coercion',
    run() {
      assertSame(
        run(`
          var first = { selected: 'first' };
          var second = { selected: 'second' };
          var key = {
            toString: function () {
              Object.setPrototypeOf(object, second);
              return 'selected';
            }
          };
          var object = {
            __proto__: first,
            *read() {
              return super[yield 'key-ready'];
            }
          };
          var iterator = object.read();
          var firstStep = iterator.next();
          var result = iterator.next(key);
          [
            firstStep.value,
            result.value,
            Object.getPrototypeOf(object) === second
          ].join(':');
        `),
        'key-ready:first:true',
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
    name: 'binding patterns suspend in nested defaults computed keys and rest positions',
    run() {
      assertSame(
        run(`
          var log = [];
          function mark(label, value) {
            log.push(label);
            return value;
          }
          function* declaration(source) {
            var [
              a = yield mark('a-default', 1),
              { b = yield mark('b-default', 2) },
              ...rest
            ] = source;
            let {
              [yield mark('object-key', 3)]: c =
                yield mark('c-default', 4)
            } = {};
            const [d = yield mark('d-default', 5)] = [];
            return [
              a,
              b,
              c,
              d,
              rest.length,
              log.join(',')
            ].join(':');
          }
          var iterator = declaration([
            undefined,
            { b: undefined },
            8,
            9
          ]);
          var first = iterator.next();
          var second = iterator.next(10);
          var third = iterator.next(20);
          var fourth = iterator.next('missing');
          var fifth = iterator.next(30);
          var result = iterator.next(40);
          [
            first.value,
            second.value,
            third.value,
            fourth.value,
            fifth.value,
            result.value,
            result.done
          ].join('|');
        `),
        '1|2|3|4|5|10:20:30:40:2:a-default,b-default,object-key,c-default,d-default|true',
      );
    },
  },
  {
    name: 'resumable pattern defaults preserve anonymous inferred names',
    run() {
      assertSame(
        run(`
          function Base() {}
          function* namedDefaults() {
            var [
              fn = function () {},
              gen = function* () {},
              Klass = class extends (yield Base) {}
            ] = [];
            return [
              fn.name,
              gen.name,
              Klass.name,
              Object.getPrototypeOf(Klass) === Base
            ].join(':');
          }
          var iterator = namedDefaults();
          var first = iterator.next();
          var result = iterator.next(Base);
          [
            first.value === Base,
            first.done,
            result.value,
            result.done
          ].join('|');
        `),
        'true|false|fn:gen:Klass:true|true',
      );
    },
  },
  {
    name: 'assignment patterns retain prepared targets and exact default order',
    run() {
      assertSame(
        run(`
          var log = [];
          var holder = {};
          var key = {
            toString: function () {
              log.push('coerce-key');
              return 'slot';
            }
          };
          function target() {
            log.push('target-base');
            return holder;
          }
          function targetKey() {
            log.push('target-key');
            return 'target-ready';
          }
          function defaultValue() {
            log.push('default');
            return 'default-ready';
          }
          var iterable = {};
          iterable[Symbol.iterator] = function () {
            log.push('iterator');
            return {
              next: function () {
                log.push('next');
                return { value: undefined, done: false };
              },
              return: function () {
                log.push('close');
                return {};
              }
            };
          };
          function* assignment(source) {
            [target()[yield targetKey()] = yield defaultValue()] = source;
            return source;
          }
          var iterator = assignment(iterable);
          var first = iterator.next();
          var second = iterator.next(key);
          var result = iterator.next(7);
          [
            first.value,
            second.value,
            result.value === iterable,
            result.done,
            holder.slot,
            log.join(',')
          ].join(':');
        `),
        'target-ready:default-ready:true:true:7:iterator,target-base,target-key,next,default,coerce-key,close',
      );
    },
  },
  {
    name: 'object assignment patterns evaluate each key target and default once',
    run() {
      assertSame(
        run(`
          var log = [];
          var holder = {};
          function sourceKey() {
            log.push('source-key');
            return 'source-key-ready';
          }
          function target() {
            log.push('target-base');
            return holder;
          }
          function targetKey() {
            log.push('target-key');
            return 'target-key-ready';
          }
          function defaultValue() {
            log.push('default');
            return 'default-ready';
          }
          function* assignment(source) {
            ({
              [yield sourceKey()]:
                target()[yield targetKey()] = yield defaultValue()
            } = source);
          }
          var iterator = assignment({});
          var first = iterator.next();
          var second = iterator.next('missing');
          var third = iterator.next('written');
          var result = iterator.next(9);
          [
            first.value,
            second.value,
            third.value,
            result.done,
            holder.written,
            log.join(',')
          ].join(':');
        `),
        'source-key-ready:target-key-ready:default-ready:true:9:source-key,target-base,target-key,default',
      );
    },
  },
  {
    name: 'injected throw closes a pattern iterator and keeps the original throw',
    run() {
      assertSame(
        run(`
          var closeCalls = 0;
          var original = {};
          var closeError = {};
          var iterable = {};
          iterable[Symbol.iterator] = function () {
            return {
              next: function () {
                return { value: undefined, done: false };
              },
              return: function () {
                closeCalls += 1;
                throw closeError;
              }
            };
          };
          function* declaration(source) {
            var [value = yield 'default-ready'] = source;
            return value;
          }
          var iterator = declaration(iterable);
          var first = iterator.next();
          var caught;
          try {
            iterator.throw(original);
          } catch (error) {
            caught = error;
          }
          [
            first.value,
            first.done,
            caught === original,
            closeCalls
          ].join(':');
        `),
        'default-ready:false:true:1',
      );
    },
  },
  {
    name: 'injected return closes a suspended target and close failure wins',
    run() {
      assertSame(
        run(`
          var nextCalls = 0;
          var closeCalls = 0;
          var closeError = {};
          var holder = {};
          var iterable = {};
          iterable[Symbol.iterator] = function () {
            return {
              next: function () {
                nextCalls += 1;
                return { value: 1, done: false };
              },
              return: function () {
                closeCalls += 1;
                throw closeError;
              }
            };
          };
          function* assignment(source) {
            [holder[yield 'target-ready']] = source;
            return 'unreachable';
          }
          var iterator = assignment(iterable);
          var first = iterator.next();
          var caught;
          try {
            iterator.return(42);
          } catch (error) {
            caught = error;
          }
          [
            first.value,
            caught === closeError,
            nextCalls,
            closeCalls,
            'written' in holder
          ].join(':');
        `),
        'target-ready:true:0:1:false',
      );
    },
  },
  {
    name: 'object literals suspend keys and values without entering generator methods',
    run() {
      assertSame(
        run(`
          var parent = { value: 9 };
          function* build() {
            return {
              __proto__: parent,
              [yield 'key']: yield 'value',
              *[yield 'method-name']() {
                yield super.value;
              }
            };
          }
          var iterator = build();
          var first = iterator.next();
          var second = iterator.next('answer');
          var third = iterator.next(42);
          var result = iterator.next('run');
          var object = result.value;
          var data = Object.getOwnPropertyDescriptor(object, 'answer');
          var method = Object.getOwnPropertyDescriptor(object, 'run');
          var nested = object.run();
          var nestedFirst = nested.next();
          var nestedResult = nested.next();
          [
            first.value,
            second.value,
            third.value,
            result.done,
            object.answer,
            object.run.name,
            data.writable,
            data.enumerable,
            data.configurable,
            method.writable,
            method.enumerable,
            method.configurable,
            nestedFirst.value,
            nestedFirst.done,
            nestedResult.done
          ].join(':');
        `),
        'key:value:method-name:true:42:run:true:true:true:true:true:true:9:false:true',
      );
    },
  },
  {
    name: 'resumable object properties infer anonymous definition names',
    run() {
      assertSame(
        run(`
          function Base() {}
          function* build() {
            return {
              [yield 'function-key']: function () {},
              [yield 'generator-key']: function* () {},
              [yield 'class-key']: class extends (yield Base) {}
            };
          }
          var iterator = build();
          var first = iterator.next();
          var second = iterator.next('fn');
          var third = iterator.next('gen');
          var fourth = iterator.next('Klass');
          var result = iterator.next(Base);
          var object = result.value;
          [
            first.value,
            second.value,
            third.value,
            fourth.value === Base,
            object.fn.name,
            object.gen.name,
            object.Klass.name,
            Object.getPrototypeOf(object.Klass) === Base,
            result.done
          ].join(':');
        `),
        'function-key:generator-key:class-key:true:fn:gen:Klass:true:true',
      );
    },
  },
  {
    name: 'resumable assignment infers an anonymous class name',
    run() {
      assertSame(
        run(`
          function Base() {}
          function* assign() {
            var Assigned;
            Assigned = class extends (yield Base) {};
            return Assigned.name;
          }
          var iterator = assign();
          var first = iterator.next();
          var result = iterator.next(Base);
          [
            first.value === Base,
            result.value,
            result.done
          ].join(':');
        `),
        'true:Assigned:true',
      );
    },
  },
  {
    name: 'class heritage and computed names suspend once in source order',
    run() {
      assertSame(
        run(`
          var order = [];
          function mark(label, value) {
            order.push(label);
            return value;
          }
          class Base {
            base() {
              return this === undefined;
            }
            static get value() {
              return 11;
            }
          }
          function* build(BaseValue) {
            var C = class extends (yield mark('heritage', BaseValue)) {
              [yield mark('instance-name', 'instance-ready')]() {
                return super.base();
              }
              static *[yield mark('generator-name', 'generator-ready')]() {
                yield super.value;
              }
            };
            return C;
          }
          var iterator = build(Base);
          var first = iterator.next();
          var second = iterator.next(Base);
          var third = iterator.next('method');
          var result = iterator.next('produce');
          var C = result.value;
          var instance = new C();
          var instanceDescriptor =
            Object.getOwnPropertyDescriptor(C.prototype, 'method');
          var staticDescriptor =
            Object.getOwnPropertyDescriptor(C, 'produce');
          var detached = C.prototype.method;
          var nested = C.produce();
          var nestedFirst = nested.next();
          var nestedResult = nested.next();
          [
            first.value === Base,
            second.value,
            third.value,
            result.done,
            C.name,
            order.join(','),
            Object.getPrototypeOf(C) === Base,
            Object.getPrototypeOf(C.prototype) === Base.prototype,
            instance instanceof Base,
            detached(),
            instanceDescriptor.writable,
            instanceDescriptor.enumerable,
            instanceDescriptor.configurable,
            staticDescriptor.writable,
            staticDescriptor.enumerable,
            staticDescriptor.configurable,
            C.prototype.produce === undefined,
            nestedFirst.value,
            nestedFirst.done,
            nestedResult.done
          ].join(':');
        `),
        'true:instance-ready:generator-ready:true:C:heritage,instance-name,generator-name:true:true:true:true:true:false:true:true:false:true:true:11:false:true',
      );
    },
  },
  {
    name: 'named class expressions retain their TDZ and inner binding across suspension',
    run() {
      assertSame(
        run(`
          function Base() {}
          function* invalid() {
            return class Inner extends (yield Inner) {};
          }
          var invalidIterator = invalid();
          var errorName = '';
          try {
            invalidIterator.next();
          } catch (error) {
            errorName = error.name;
          }

          function* stable() {
            return class Inner extends (yield Base) {
              static self() {
                return Inner;
              }
            };
          }
          var stableIterator = stable();
          var first = stableIterator.next();
          var result = stableIterator.next(Base);
          var ClassValue = result.value;
          [
            errorName,
            first.value === Base,
            result.done,
            ClassValue.name,
            ClassValue.self() === ClassValue,
            typeof Inner
          ].join(':');
        `),
        'ReferenceError:true:true:Inner:true:undefined',
      );
    },
  },
  {
    name: 'class declarations resume heritage and computed names before initialization',
    run() {
      assertSame(
        run(`
          function Base() {}
          function* declaration() {
            class Declared extends (yield Base) {
              [yield 'method-ready']() {
                return 7;
              }
            }
            return Declared;
          }
          var iterator = declaration();
          var first = iterator.next();
          var second = iterator.next(Base);
          var result = iterator.next('method');
          var Declared = result.value;
          [
            first.value === Base,
            second.value,
            result.done,
            Declared.name,
            Object.getPrototypeOf(Declared) === Base,
            new Declared().method()
          ].join(':');
        `),
        'true:method-ready:true:Declared:true:7',
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
