import { assertSame } from './harness/assert.js';
import { parseScript, evaluateScript } from '../src/api.js';
import { createRealm } from '../src/runtime/realm.js';
import { EngineArray } from '../src/runtime/array-object.js';

/**
 * @param {string} source
 * @returns {unknown}
 */
function run(source) {
  const result = evaluateScript(createRealm(), source);

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return result.value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {any} program
 * @returns {unknown}
 */
function evaluateProgram(realm, program) {
  const result = evaluateScript(realm, '', { parse: () => program });

  if (result.type === 'throw') {
    throw new Error(`Guest script threw: ${JSON.stringify(result.value)}`);
  }

  return result.value;
}

const tests = [
  {
    name: 'untagged templates convert substitutions and concatenate left to right',
    run() {
      assertSame(
        run(
          'var log = []; ' +
            'var x = { toString: function () { log.push("x"); return "X"; } }; ' +
            'var y = { toString: function () { log.push("y"); return "Y"; } }; ' +
            'var result = `a${x}b${y}c`; result + ":" + log.join(",");',
        ),
        'aXbYc:x,y',
      );
    },
  },
  {
    name: 'tagged templates preserve property-reference receivers and evaluation order',
    run() {
      assertSame(
        run(
          'var log = []; ' +
            'var object = { label: "receiver", get tag() { log.push("tag"); return function (strings, first, second) { ' +
            'log.push(this.label); return strings[0] + first + strings[1] + second + strings[2]; ' +
            '}; } }; ' +
            'function one() { log.push("one"); return "1"; } ' +
            'function two() { log.push("two"); return "2"; } ' +
            'object.tag`a${one()}b${two()}c` + ":" + log.join(",");',
        ),
        'a1b2c:tag,one,two,receiver',
      );
    },
  },
  {
    name: 'tagged templates expose cooked and raw frozen arrays with exact descriptors',
    run() {
      assertSame(
        run(
          'function tag(strings) { ' +
            'var cooked = Object.getOwnPropertyDescriptor(strings, "0"); ' +
            'var rawIndex = Object.getOwnPropertyDescriptor(strings.raw, "0"); ' +
            'var raw = Object.getOwnPropertyDescriptor(strings, "raw"); ' +
            'var cookedLength = Object.getOwnPropertyDescriptor(strings, "length"); ' +
            'var rawLength = Object.getOwnPropertyDescriptor(strings.raw, "length"); ' +
            'return strings[0] === "a\\n" && strings.raw[0] === "a\\\\n" && ' +
            'cooked.writable === false && cooked.enumerable === true && cooked.configurable === false && ' +
            'rawIndex.writable === false && rawIndex.enumerable === true && rawIndex.configurable === false && ' +
            'raw.writable === false && raw.enumerable === false && raw.configurable === false && ' +
            'strings.length === 2 && strings.raw.length === 2 && ' +
            'cookedLength.writable === false && cookedLength.enumerable === false && cookedLength.configurable === false && ' +
            'rawLength.writable === false && rawLength.enumerable === false && rawLength.configurable === false && ' +
            'Object.isFrozen(strings) && Object.isFrozen(strings.raw) && ' +
            '!Object.isExtensible(strings) && !Object.isExtensible(strings.raw); ' +
            '} tag`a\\n${1}b`;',
        ),
        true,
      );
    },
  },
  {
    name: 'a tagged template parse site reuses identity while distinct sites do not',
    run() {
      assertSame(
        run(
          'function tag(strings) { return strings; } ' +
            'function site() { return tag`same`; } ' +
            'var first = site(); var second = site(); var different = tag`same`; ' +
            'first === second && first !== different;',
        ),
        true,
      );
    },
  },
  {
    name: 'the same parsed site creates separate template objects in separate realms',
    run() {
      const program = parseScript('tag`site`;');
      const firstRealm = createRealm();
      const secondRealm = createRealm();

      evaluateScript(firstRealm, 'function tag(strings) { return strings; }');
      evaluateScript(secondRealm, 'function tag(strings) { return strings; }');

      const first = evaluateProgram(firstRealm, program);
      const repeated = evaluateProgram(firstRealm, program);
      const second = evaluateProgram(secondRealm, program);

      assertSame(first === repeated, true);
      assertSame(first === second, false);
      assertSame(first instanceof EngineArray, true);
      assertSame(/** @type {EngineArray} */ (first).getPrototype(), firstRealm.intrinsics.arrayPrototype);
      assertSame(/** @type {EngineArray} */ (second).getPrototype(), secondRealm.intrinsics.arrayPrototype);
    },
  },
  {
    name: 'tagged template objects preserve invalid cooked entries as undefined',
    run() {
      const program = taggedTemplateProgram({
        type: 'TemplateLiteral',
        expressions: [],
        quasis: [
          {
            type: 'TemplateElement',
            value: { raw: '\\unicode', cooked: undefined },
            tail: true,
          },
        ],
      });
      const realm = createRealm();

      evaluateScript(
        realm,
        'function tag(strings) { return strings[0] === undefined && strings.raw[0] === "\\\\unicode"; }',
      );

      assertSame(evaluateProgram(realm, program), true);
    },
  },
  {
    name: 'non-callable tags fail after substitutions are evaluated',
    run() {
      assertSame(
        run(
          'var order = ""; var tag = 1; ' +
            'function substitution() { order = order + "substitution"; return 1; } ' +
            'try { tag`${substitution()}`; } catch (error) { order = order + ":" + error.name; } order;',
        ),
        'substitution:TypeError',
      );
    },
  },
];

/**
 * @param {any} quasi
 * @returns {any}
 */
function taggedTemplateProgram(quasi) {
  return {
    type: 'Program',
    sourceType: 'script',
    body: [
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'TaggedTemplateExpression',
          tag: { type: 'Identifier', name: 'tag' },
          quasi,
        },
      },
    ],
  };
}

export default tests;
