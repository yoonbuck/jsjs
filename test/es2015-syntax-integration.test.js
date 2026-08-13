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
    throw new Error(`Expected normal completion, got ${completion.type}`);
  }

  return completion.value;
}

/** @type {import('./harness/runner.js').TestCase[]} */
const tests = [
  {
    name: 'classes compose defaults rest spread array patterns computed properties and templates',
    run() {
      assertSame(
        run(
          'class Counter {' +
            'constructor(start = 0) { this.values = [start]; } ' +
            'addAll(...items) { items.forEach((item) => this.values.push(item)); return this; } ' +
            'summary(tag = `${this.values.length}`) {' +
            'var [first, ...rest] = this.values; ' +
            'return { [tag]: `${first}:${rest.join(",")}` };' +
            '}' +
            '} ' +
            'var key = "result"; ' +
            'new Counter().addAll(...[1, 2]).summary(key)[key];',
        ),
        '0:1,2',
      );
    },
  },
  {
    name: 'a tagged method gives its arrow the enclosing this super receiver and template site',
    run() {
      assertSame(
        run(
          'var firstSite; ' +
            'var proto = { format(value) { return this.prefix + ":" + value; } }; ' +
            'var receiver = {' +
            'prefix: "receiver", ' +
            'tag(strings, value) {' +
            'var sameSite = firstSite === undefined || firstSite === strings; ' +
            'firstSite = strings; ' +
            'var arrow = () => `${this.prefix}:${super.format(value)}`; ' +
            'return `${this === receiver}:${sameSite}:${arrow()}`;' +
            '}' +
            '}; ' +
            'Object.setPrototypeOf(receiver, proto); ' +
            'function invoke(value) { return receiver.tag`entry=${value}`; } ' +
            'invoke("first") + "|" + invoke("second");',
        ),
        'true:true:receiver:receiver:first|true:true:receiver:receiver:second',
      );
    },
  },
  {
    name: 'class methods combine destructured non-simple parameters defaults rest and unmapped arguments',
    run() {
      assertSame(
        run(
          'class Collector {' +
            'collect({ value = 1 } = {}, [head = value, ...tail] = [], ...rest) {' +
            'value = 9; arguments[0] = { value: 10 }; ' +
            'return [value, arguments[0].value, head, tail.join(","), rest.join(","), arguments.length].join(":");' +
            '}' +
            '} ' +
            'var collector = new Collector(); ' +
            'collector.collect({ value: 2 }, [undefined, 4, 5], 6, 7) + "|" + ' +
            'collector.collect(undefined, undefined, 8);',
        ),
        '9:10:2:4,5:6,7:4|9:10:1::8:3',
      );
    },
  },
  {
    name: 'computed Symbol methods compose across class and object method calls',
    run() {
      assertSame(
        run(
          'var methodKey = Symbol("method"); var objectKey = Symbol("object"); ' +
            'class C {' +
            '[methodKey](value = 1) { return value + 1; } ' +
            'static [methodKey](...values) { return values.join(","); }' +
            '} ' +
            'var object = {' +
            '[objectKey](instance, ...values) {' +
            'return instance[methodKey](...values) + ":" + C[methodKey](...values);' +
            '}' +
            '}; ' +
            'object[objectKey](new C(), ...[2, 3]);',
        ),
        '3:2,3',
      );
    },
  },
  {
    name: 'default derived forwarding and explicit super spread share class construction behavior',
    run() {
      assertSame(
        run(
          'class Parent {' +
            'constructor(first = 1, ...rest) { this.value = `${first}:${rest.join(",")}`; }' +
            '} ' +
            'class DefaultChild extends Parent {} ' +
            'class ExplicitChild extends Parent {' +
            'constructor(first = 2, ...rest) { super(first, ...rest); }' +
            '} ' +
            'new DefaultChild(...[4, 5, 6]).value + "|" + ' +
            'new ExplicitChild(undefined, 7, 8).value;',
        ),
        '4:5,6|2:7,8',
      );
    },
  },
  {
    name: 'direct eval composes every supported syntax family in its caller lexical scope',
    run() {
      const source = [
        'class Base {',
        '  constructor(start = lexical) { this.values = [start]; }',
        '  label(value) { return `${value}-${this.values[0]}`; }',
        '}',
        'class Child extends Base {',
        '  method({ [key]: first = lexical } = { [key]: undefined }, ...rest) {',
        '    var [head, ...tail] = [first, ...rest];',
        '    var arrow = (value = head) => `${super.label(value)}:${rest.join(",")}`;',
        '    var tag = {',
        '      prefix: "tag",',
        '      format(strings, value, tail) {',
        '        return `${this.prefix}:${strings[0]}${value}${strings[1]}${tail}${strings[2]}`;',
        '      }',
        '    };',
        '    return { [key]: tag.format`value=${arrow(...[head])}:tail=${tail.join(",")}` }[key];',
        '  }',
        '}',
        'new Child().method({ [key]: undefined }, ...[7, 8]);',
      ].join('\n');

      assertSame(
        run(
          'function directScope() {' +
            'let lexical = 4; var key = Symbol("result"); ' +
            `return eval(${JSON.stringify(source)});` +
            '} directScope();',
        ),
        'tag:value=4-4:7,8:tail=7,8',
      );
    },
  },
  {
    name: 'dynamic Function composes supported parameter forms and function-body syntax',
    run() {
      const body =
        'var format = (first = value) => `${prefix}:${first}:${rest.join(",")}`; ' +
        'var object = { [prefix]: format(...[value]) }; ' +
        'return object[prefix];';

      assertSame(
        run(
          'var format = new Function(' +
            '"prefix = \\"entry\\"", ' +
            '"{ value = 1 } = {}", ' +
            '"...rest", ' +
            `${JSON.stringify(body)}` +
            '); format("dynamic", { value: 2 }, 3, 4);',
        ),
        'dynamic:2:3,4',
      );
    },
  },
  {
    name: 'a class parameter default preserves its error when iterator closing from a pattern throws',
    run() {
      assertSame(
        run(
          'var returnCalls = 0; ' +
            'var iterable = {}; ' +
            'iterable[Symbol.iterator] = function () {' +
            'return {' +
            'next: function () { return { value: undefined, done: false }; }, ' +
            'return: function () { returnCalls += 1; throw new Error("close"); }' +
            '};' +
            '}; ' +
            'function fail() { throw new RangeError(`original-${returnCalls}`); } ' +
            'class Consumer {' +
            'consume([value = fail()] = iterable) { return value; }' +
            '} ' +
            'var result; ' +
            'try { new Consumer().consume(); } ' +
            'catch (error) { result = error.name + ":" + error.message + ":" + returnCalls; } ' +
            'result;',
        ),
        'RangeError:original-0:1',
      );
    },
  },
];

export default tests;
