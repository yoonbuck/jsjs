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

/**
 * @param {readonly [string, unknown][]} cases
 * @returns {void}
 */
function assertExpressions(cases) {
  for (const [source, expected] of cases) {
    assertSame(run(`${source};`), expected, source);
  }
}

/**
 * @param {readonly string[]} sources
 * @returns {void}
 */
function assertTypeErrors(sources) {
  for (const source of sources) {
    assertSame(
      run(
        `try { ${source}; "no-throw"; } catch (e) { ` +
          'e instanceof TypeError ? "TypeError" : "wrong:" + e.name; }',
      ),
      'TypeError',
      source,
    );
  }
}

const tests = [
  {
    name: 'JSON.stringify has its ES5 shape and property attributes',
    run() {
      assertExpressions([
        ['typeof JSON.stringify', 'function'],
        ['JSON.stringify.length', 3],
        ['JSON.stringify.name', 'stringify'],
        ['JSON.stringify.prototype', undefined],
        ['Object.getOwnPropertyDescriptor(JSON, "stringify").writable', true],
        [
          'Object.getOwnPropertyDescriptor(JSON, "stringify").enumerable',
          false,
        ],
        [
          'Object.getOwnPropertyDescriptor(JSON, "stringify").configurable',
          true,
        ],
        // The two methods are the only own properties of JSON.
        [
          'Object.getOwnPropertyNames(JSON).sort().join(",")',
          'parse,stringify',
        ],
        [
          'try { new JSON.stringify(1); } catch (e) { e instanceof TypeError; }',
          true,
        ],
      ]);
    },
  },
  {
    name: 'JSON.stringify writes the JSON primitives, and undefined for the rest',
    run() {
      assertExpressions([
        ['JSON.stringify(null)', 'null'],
        ['JSON.stringify(true)', 'true'],
        ['JSON.stringify(false)', 'false'],
        ['JSON.stringify(0)', '0'],
        ['JSON.stringify(-0)', '0'],
        ['JSON.stringify(1.5)', '1.5'],
        ['JSON.stringify(-1.5)', '-1.5'],
        ['JSON.stringify(1e21)', '1e+21'],
        ['JSON.stringify(1e-7)', '1e-7'],
        // Non-finite numbers have no JSON form, so they become null.
        ['JSON.stringify(NaN)', 'null'],
        ['JSON.stringify(Infinity)', 'null'],
        ['JSON.stringify(-Infinity)', 'null'],
        ['JSON.stringify("abc")', '"abc"'],
        // undefined and callables produce no text at all at the top level.
        ['JSON.stringify(undefined)', undefined],
        ['JSON.stringify()', undefined],
        ['JSON.stringify(function () {})', undefined],
        ['JSON.stringify(JSON.parse)', undefined],
        // Primitive wrappers are unwrapped before they are written.
        ['JSON.stringify(new Number(1.5))', '1.5'],
        ['JSON.stringify(new String("a"))', '"a"'],
        ['JSON.stringify(new Boolean(true))', 'true'],
        ['JSON.stringify(new Boolean(false))', 'false'],
        ['JSON.stringify(Object(0))', '0'],
        // A Number wrapper is unwrapped with ToNumber, so valueOf runs.
        [
          'var n = new Number(1); n.valueOf = function () { return 9; }; JSON.stringify(n)',
          '9',
        ],
      ]);
    },
  },
  {
    name: 'JSON.stringify quotes strings with JSON escapes only',
    run() {
      assertExpressions([
        ['JSON.stringify("")', '""'],
        ['JSON.stringify("a\\"b")', '"a\\"b"'],
        ['JSON.stringify("a\\\\b")', '"a\\\\b"'],
        ['JSON.stringify("\\b\\f\\n\\r\\t")', '"\\b\\f\\n\\r\\t"'],
        // Other control characters use the \\uXXXX form with lowercase hex.
        ['JSON.stringify("\\u0000")', '"\\u0000"'],
        ['JSON.stringify("\\u0001")', '"\\u0001"'],
        ['JSON.stringify("\\u001f")', '"\\u001f"'],
        ['JSON.stringify("\\u000b")', '"\\u000b"'],
        // U+007F is not a JSON control character and is written raw.
        ['JSON.stringify("\\u007f")', '"\u007f"'],
        // "/" is escapable in JSON but never escaped on output.
        ['JSON.stringify("a/b")', '"a/b"'],
        // Non-ASCII and line separators are written raw too.
        ['JSON.stringify("\\u00e9")', '"\u00e9"'],
        ['JSON.stringify("\\u2028\\u2029")', '"\u2028\u2029"'],
        ['JSON.stringify("\\ud83d\\ude00")', '"\ud83d\ude00"'],
        // An unpaired surrogate survives ES5 stringification unescaped. (The
        // well-formed `\udXXX` escaping a modern host emits here is ES2019's
        // change to Quote, not ES5's, so this engine writes the raw unit.)
        ['JSON.stringify("\\ud800").length', 3],
        ['JSON.stringify("\\ud800").charCodeAt(1)', 0xd800],
        // Object keys are quoted the same way as values.
        ['var o = {}; o["a\\"b"] = 1; JSON.stringify(o)', '{"a\\"b":1}'],
        ['var o = {}; o["\\u0001"] = 1; JSON.stringify(o)', '{"\\u0001":1}'],
      ]);
    },
  },
  {
    name: 'JSON.stringify writes arrays, with null for every value JSON cannot hold',
    run() {
      assertExpressions([
        ['JSON.stringify([])', '[]'],
        ['JSON.stringify([1,2,3])', '[1,2,3]'],
        ['JSON.stringify([[1],[2,[3]]])', '[[1],[2,[3]]]'],
        ['JSON.stringify(["a",null,true])', '["a",null,true]'],
        // Holes, undefined, and callables all become null inside an array.
        ['JSON.stringify([1,,3])', '[1,null,3]'],
        ['JSON.stringify([undefined])', '[null]'],
        ['JSON.stringify([function () {}])', '[null]'],
        ['JSON.stringify([NaN,Infinity])', '[null,null]'],
        // Only the index properties are written; extra ones are ignored.
        ['var a = [1]; a.extra = 2; JSON.stringify(a)', '[1]'],
        // The length is read once, through ToUint32.
        ['JSON.stringify(new Array(3))', '[null,null,null]'],
      ]);
    },
  },
  {
    name: 'JSON.stringify writes an object own enumerable properties in order',
    run() {
      assertExpressions([
        ['JSON.stringify({})', '{}'],
        ['JSON.stringify({a:1})', '{"a":1}'],
        ['JSON.stringify({b:1,a:2,c:3})', '{"b":1,"a":2,"c":3}'],
        ['JSON.stringify({a:{b:{c:1}}})', '{"a":{"b":{"c":1}}}'],
        ['JSON.stringify({a:[1,{b:2}]})', '{"a":[1,{"b":2}]}'],
        ['JSON.stringify({"":1})', '{"":1}'],
        // A property whose value has no JSON form is omitted entirely.
        ['JSON.stringify({a:undefined,b:1})', '{"b":1}'],
        ['JSON.stringify({a:function () {},b:1})', '{"b":1}'],
        ['JSON.stringify({a:undefined})', '{}'],
        // Non-enumerable and inherited properties are skipped.
        [
          'var o = {}; Object.defineProperty(o, "h", { value: 1, enumerable: false }); ' +
            'o.v = 2; JSON.stringify(o)',
          '{"v":2}',
        ],
        [
          'function F() {} F.prototype.p = 1; var o = new F(); o.own = 2; JSON.stringify(o)',
          '{"own":2}',
        ],
        // Accessors are read, so a getter's result is what gets written.
        ['JSON.stringify({ get a() { return 5; } })', '{"a":5}'],
        // The same object twice is not a cycle.
        [
          'var shared = {x:1}; JSON.stringify([shared, shared])',
          '[{"x":1},{"x":1}]',
        ],
      ]);
    },
  },
  {
    name: 'JSON.stringify calls toJSON with the key and uses its result',
    run() {
      assertExpressions([
        [
          'JSON.stringify({ toJSON: function (k) { return "tj:" + k; } })',
          '"tj:"',
        ],
        [
          'JSON.stringify({ a: { toJSON: function (k) { return k; } } })',
          '{"a":"a"}',
        ],
        ['JSON.stringify([{ toJSON: function (k) { return k; } }])', '["0"]'],
        // `this` inside toJSON is the object that carries it.
        [
          'JSON.stringify({ v: 7, toJSON: function () { return this.v; } })',
          '7',
        ],
        // A toJSON returning undefined removes the property.
        [
          'JSON.stringify({ a: { toJSON: function () { return undefined; } }, b: 1 })',
          '{"b":1}',
        ],
        // The result of toJSON is serialised in full, not re-consulted.
        [
          'JSON.stringify({ toJSON: function () { return { a: [1] }; } })',
          '{"a":[1]}',
        ],
        // A non-callable toJSON is ignored.
        ['JSON.stringify({ toJSON: 5, a: 1 })', '{"toJSON":5,"a":1}'],
        // toJSON runs before the replacer sees the value.
        [
          'JSON.stringify({ a: { toJSON: function () { return "T"; } } }, ' +
            'function (k, v) { return k === "a" ? v + "!" : v; })',
          '{"a":"T!"}',
        ],
        // A wrapper is unwrapped only after toJSON has had its chance.
        [
          'var n = new Number(1); n.toJSON = function () { return "n"; }; JSON.stringify(n)',
          '"n"',
        ],
      ]);
    },
  },
  {
    name: 'JSON.stringify applies a replacer function to every key',
    run() {
      assertExpressions([
        [
          'JSON.stringify({a:1,b:2}, function (k, v) { return k === "b" ? undefined : v; })',
          '{"a":1}',
        ],
        ['JSON.stringify([1,2], function (k, v) { return v; })', '[1,2]'],
        // Removing an array element yields null, not a gap.
        [
          'JSON.stringify([1,2], function (k, v) { return k === "0" ? undefined : v; })',
          '[null,2]',
        ],
        // Every key is visited, root first, with the root key "".
        [
          'var seen = []; JSON.stringify({a:{b:1}}, function (k, v) { seen.push(k); return v; }); ' +
            'seen.join("|")',
          '|a|b',
        ],
        // `this` is the holder of the visited key.
        [
          'JSON.stringify({a:1}, function (k, v) { return k === "a" ? typeof this : v; })',
          '{"a":"object"}',
        ],
        [
          'JSON.stringify({a:1}, function (k, v) { return k === "a" ? this.a + 1 : v; })',
          '{"a":2}',
        ],
        // The replacer can return a whole structure, which is then written.
        [
          'JSON.stringify({a:1}, function (k, v) { return k === "a" ? [1,2] : v; })',
          '{"a":[1,2]}',
        ],
        // Replacing the root replaces everything.
        ['JSON.stringify({a:1}, function () { return 5; })', '5'],
        // Array indices arrive as strings.
        [
          'var keys = []; JSON.stringify([9], function (k, v) { keys.push(typeof k + ":" + k); return v; }); ' +
            'keys.join("|")',
          'string:|string:0',
        ],
        // A replacer that is neither callable nor an array is ignored.
        ['JSON.stringify({a:1}, 5)', '{"a":1}'],
        ['JSON.stringify({a:1}, null)', '{"a":1}'],
        ['JSON.stringify({a:1}, {})', '{"a":1}'],
        ['JSON.stringify({a:1}, "a")', '{"a":1}'],
      ]);
    },
  },
  {
    name: 'JSON.stringify filters object keys through a replacer array',
    run() {
      assertExpressions([
        ['JSON.stringify({a:1,b:2,c:3}, ["b","a"])', '{"b":2,"a":1}'],
        ['JSON.stringify({a:1,b:2}, [])', '{}'],
        // A name that is not present is simply skipped.
        ['JSON.stringify({a:1}, ["a","zz"])', '{"a":1}'],
        // Duplicates are collapsed, keeping the first position.
        ['JSON.stringify({a:1,b:2}, ["a","a","b"])', '{"a":1,"b":2}'],
        // Numbers and String/Number wrappers become names; nothing else does.
        [
          'var o = {}; o[1] = "x"; o[2] = "y"; JSON.stringify(o, [1])',
          '{"1":"x"}',
        ],
        ['JSON.stringify({a:1}, [new String("a")])', '{"a":1}'],
        [
          'var o = {}; o[1] = "x"; JSON.stringify(o, [new Number(1)])',
          '{"1":"x"}',
        ],
        ['JSON.stringify({a:1,b:2}, [true,"a"])', '{"a":1}'],
        ['JSON.stringify({a:1,b:2}, [null,"a"])', '{"a":1}'],
        ['JSON.stringify({a:1,b:2}, [{},"a"])', '{"a":1}'],
        // Holes contribute nothing.
        ['JSON.stringify({a:1,b:2}, ["a",,"b"])', '{"a":1,"b":2}'],
        // The list applies at every level, but never to an array's indices.
        ['JSON.stringify({a:{a:1,b:2},b:{a:3}}, ["a"])', '{"a":{"a":1}}'],
        ['JSON.stringify([1,2,3], ["0"])', '[1,2,3]'],
        ['JSON.stringify({a:[{a:1,b:2}]}, ["a"])', '{"a":[{"a":1}]}'],
        // A callable replacer is a replacer function, never a name list.
        [
          'var f = function (k, v) { return v; }; JSON.stringify({a:1}, f)',
          '{"a":1}',
        ],
      ]);
    },
  },
  {
    name: 'JSON.stringify indents with the gap that space describes',
    run() {
      assertExpressions([
        [
          'JSON.stringify({a:[1,2]}, null, 2)',
          '{\n  "a": [\n    1,\n    2\n  ]\n}',
        ],
        [
          'JSON.stringify([1,[2,[3]]], null, 1)',
          '[\n 1,\n [\n  2,\n  [\n   3\n  ]\n ]\n]',
        ],
        [
          'JSON.stringify({a:{b:{c:1}}}, null, 1)',
          '{\n "a": {\n  "b": {\n   "c": 1\n  }\n }\n}',
        ],
        // Empty objects and arrays never gain a newline.
        ['JSON.stringify({a:[],b:{}}, null, 2)', '{\n  "a": [],\n  "b": {}\n}'],
        // A gap of zero width is no gap at all.
        ['JSON.stringify({a:1}, null, 0)', '{"a":1}'],
        ['JSON.stringify({a:1}, null, -1)', '{"a":1}'],
        ['JSON.stringify({a:1}, null, "")', '{"a":1}'],
        // ToInteger truncates a fractional width.
        ['JSON.stringify({a:1}, null, 1.9)', '{\n "a": 1\n}'],
        // Ten is the widest gap either form can ask for.
        ['JSON.stringify({a:1}, null, 11)', '{\n          "a": 1\n}'],
        ['JSON.stringify({a:1}, null, 100)', '{\n          "a": 1\n}'],
        [
          'JSON.stringify({a:1}, null, "0123456789abc")',
          '{\n0123456789"a": 1\n}',
        ],
        // A string gap is used verbatim.
        ['JSON.stringify({a:1}, null, "--")', '{\n--"a": 1\n}'],
        ['JSON.stringify([1], null, "\\t")', '[\n\t1\n]'],
        // Number and String wrappers are unwrapped first.
        ['JSON.stringify({a:1}, null, new Number(2))', '{\n  "a": 1\n}'],
        ['JSON.stringify({a:1}, null, new String(".."))', '{\n..\"a\": 1\n}'],
        // Anything else means no gap.
        ['JSON.stringify({a:1}, null, true)', '{"a":1}'],
        ['JSON.stringify({a:1}, null, null)', '{"a":1}'],
        ['JSON.stringify({a:1}, null, {})', '{"a":1}'],
        ['JSON.stringify({a:1}, null, undefined)', '{"a":1}'],
        // A gap changes nothing about a top-level primitive.
        ['JSON.stringify(1, null, 2)', '1'],
        ['JSON.stringify("a", null, 2)', '"a"'],
      ]);
    },
  },
  {
    name: 'JSON.stringify throws a TypeError on a cyclical structure',
    run() {
      assertTypeErrors([
        'var o = {}; o.self = o; JSON.stringify(o)',
        'var a = []; a.push(a); JSON.stringify(a)',
        'var o = { a: { b: {} } }; o.a.b.back = o; JSON.stringify(o)',
        'var a = [], o = { a: a }; a.push(o); JSON.stringify(o)',
        // A cycle reached through toJSON or a replacer is caught the same way.
        'var c = {}; c.self = c; JSON.stringify({ toJSON: function () { return c; } })',
        'var c = {}; c.self = c; JSON.stringify({a:1}, function (k, v) { return k === "a" ? c : v; })',
      ]);

      // The TypeError belongs to the throwing realm.
      const realm = createRealm();

      assertSame(
        evaluateScript(
          realm,
          'var o = {}; o.self = o; ' +
            'try { JSON.stringify(o); } catch (e) { e instanceof TypeError; }',
        ).value,
        true,
      );
    },
  },
  {
    name: 'JSON.stringify propagates abrupt completions from the guest code it calls',
    run() {
      assertExpressions([
        [
          'try { JSON.stringify({ toJSON: function () { throw new RangeError("x"); } }); } ' +
            'catch (e) { e instanceof RangeError; }',
          true,
        ],
        [
          'try { JSON.stringify({a:1}, function () { throw new RangeError("x"); }); } ' +
            'catch (e) { e instanceof RangeError; }',
          true,
        ],
        [
          'try { JSON.stringify({ get a() { throw new RangeError("x"); } }); } ' +
            'catch (e) { e instanceof RangeError; }',
          true,
        ],
        [
          'var n = new Number(1); n.valueOf = function () { throw new RangeError("x"); }; ' +
            'try { JSON.stringify(n); } catch (e) { e instanceof RangeError; }',
          true,
        ],
        [
          'var s = new Number(1); s.valueOf = function () { throw new RangeError("x"); }; ' +
            'try { JSON.stringify({a:1}, null, s); } catch (e) { e instanceof RangeError; }',
          true,
        ],
        // A plain object is not a Number or String wrapper, so `space` never
        // coerces it and its valueOf is never called.
        [
          'JSON.stringify({a:1}, null, { valueOf: function () { throw new RangeError("x"); } })',
          '{"a":1}',
        ],
      ]);
    },
  },
  {
    name: 'JSON.stringify and JSON.parse round trip through each other',
    run() {
      assertExpressions([
        [
          'JSON.stringify(JSON.parse(\'{"a":[1,2,{"b":"c"}],"d":null}\'))',
          '{"a":[1,2,{"b":"c"}],"d":null}',
        ],
        [
          'var t = \'{"a":[1,2,{"b":"c"}],"d":null}\'; JSON.stringify(JSON.parse(JSON.stringify(JSON.parse(t))))',
          '{"a":[1,2,{"b":"c"}],"d":null}',
        ],
        ['JSON.parse(JSON.stringify("a\\"b\\\\c\\u0000\\u2028")).length', 7],
        ['JSON.parse(JSON.stringify({a:1})).a', 1],
        ['JSON.parse(JSON.stringify([1,[2]]))[1][0]', 2],
        ['JSON.parse(JSON.stringify({a:1,b:[1,2]}, null, 4)).b[1]', 2],
      ]);
    },
  },
];

export default tests;
