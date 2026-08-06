import { assertSame, assertThrows } from './harness/assert.js';
import {
  RegExpSyntaxError,
  parseFlags,
  validatePattern,
} from '../src/runtime/regexp-syntax.js';

/**
 * @param {string} source
 * @returns {void}
 */
function assertRejected(source) {
  assertThrows(() => validatePattern(source), RegExpSyntaxError);
}

/**
 * @param {string} source
 * @param {number} [capturingGroups=0]
 * @returns {void}
 */
function assertAccepted(source, capturingGroups = 0) {
  const info = validatePattern(source);
  assertSame(
    info.capturingGroups,
    capturingGroups,
    `capturingGroups for /${source}/`,
  );
}

const tests = [
  {
    name: 'the empty pattern is valid with zero capturing groups',
    run() {
      assertAccepted('', 0);
    },
  },
  {
    name: 'a table of ordinary ES5 patterns is accepted',
    run() {
      assertAccepted('abc');
      assertAccepted('a.b');
      assertAccepted('a*b+c?d');
      assertAccepted('a{2,3}');
      assertAccepted('a{2,}');
      assertAccepted('a{2}');
      assertAccepted('^abc$');
      assertAccepted('a|b|c');
      assertAccepted('(?:abc)');
      assertAccepted('(?=abc)(?!def)');
      assertAccepted('a\\bb\\B');
      assertAccepted('a\\nb\\r\\t\\v\\f');
      assertAccepted('a\\cA');
      assertAccepted('a\\x41');
      assertAccepted('a\\u0041');
      assertAccepted('[a-z0-9_]');
      assertAccepted('[^a-z]');
      assertAccepted('[]');
      assertAccepted('[-a]');
      assertAccepted('[a-]');
      assertAccepted('\\d\\D\\s\\S\\w\\W');
      assertAccepted('\\-\\/\\$\\[');
      assertAccepted('(a(b)c)', 2);
      assertAccepted('(a)(b)(c)', 3);
    },
  },
  {
    name: 'capturing groups are counted over the whole pattern and non-capturing groups are excluded',
    run() {
      assertAccepted('(a)', 1);
      assertAccepted('(?:a)', 0);
      assertAccepted('((a)(b))', 3);
      assertAccepted('(?=(a))', 1);
    },
  },
  {
    name: 'a backreference to a group that never appears is a SyntaxError',
    run() {
      assertRejected('\\1');
      assertRejected('\\2(a)');
    },
  },
  {
    name: 'a backreference to a preceding capturing group is legal',
    run() {
      assertAccepted('(a)\\1', 1);
    },
  },
  {
    name: 'a backreference to a group that appears later (forward reference) is legal',
    run() {
      assertAccepted('\\1(a)', 1);
    },
  },
  {
    name: 'a NUL decimal escape (\\0) is always legal and is not a backreference',
    run() {
      assertAccepted('\\0');
      assertAccepted('\\0(a)', 1);
      assertAccepted('\\0a');
    },
  },
  {
    name: 'a NUL decimal escape followed by another decimal digit is a SyntaxError (DecimalEscape lookahead)',
    run() {
      // ES5.1 15.10.1 `DecimalEscape :: DecimalIntegerLiteral [lookahead not
      // in DecimalDigit]`. `\00`..`\09` are Annex B legacy octal escapes,
      // which the ES5 grammar deliberately excludes: no AtomEscape or
      // ClassEscape alternative accepts a leading zero followed by a digit.
      assertRejected('\\00');
      assertRejected('\\01');
      assertRejected('\\07');
      assertRejected('\\09');
    },
  },
  {
    name: 'a decimal escape inside a character class is legal only for the value zero',
    run() {
      assertAccepted('[\\0]');
      assertRejected('[\\1]');
      assertRejected('[\\1](a)'); // still rejected even though a group follows elsewhere
    },
  },
  {
    name: 'a NUL decimal escape inside a character class followed by another decimal digit is a SyntaxError (DecimalEscape lookahead)',
    run() {
      assertRejected('[\\00]');
      assertRejected('[\\01]');
      assertRejected('[\\07]');
      assertRejected('[\\09]');
    },
  },
  {
    name: 'a character class range is rejected when either side is a CharacterClassEscape',
    run() {
      assertRejected('[\\d-a]');
      assertRejected('[a-\\w]');
      assertRejected('[\\d-\\w]');
    },
  },
  {
    name: 'a character class range is rejected when it is reversed by code-unit value',
    run() {
      assertRejected('[b-a]');
      assertRejected('[\\u0062-\\u0061]');
    },
  },
  {
    name: 'a character class range in ascending order is accepted',
    run() {
      assertAccepted('[a-b]');
      assertAccepted('[\\x61-\\x62]');
      assertAccepted('[a-a]');
    },
  },
  {
    name: 'a quantifier {n,m} with m < n is a SyntaxError',
    run() {
      assertRejected('a{2,1}');
    },
  },
  {
    name: 'a quantifier {n,m} with m >= n is accepted',
    run() {
      assertAccepted('a{1,2}');
      assertAccepted('a{2,2}');
    },
  },
  {
    name: 'a quantifier with no preceding atom is a SyntaxError',
    run() {
      assertRejected('*a');
      assertRejected('+');
      assertRejected('?');
      assertRejected('{2}');
      assertRejected('a|*');
    },
  },
  {
    name: 'a quantifier applied to an Assertion is a SyntaxError',
    run() {
      assertRejected('^*');
      assertRejected('\\b+');
      assertRejected('$?');
      assertRejected('(?=x)*');
      assertRejected('(?!x)+');
    },
  },
  {
    name: 'an unbalanced ( is a SyntaxError',
    run() {
      assertRejected('(');
      assertRejected('(a');
      assertRejected('(?:a');
    },
  },
  {
    name: 'an unmatched ) is a SyntaxError',
    run() {
      assertRejected(')');
      assertRejected('a)');
    },
  },
  {
    name: 'an unterminated character class is a SyntaxError',
    run() {
      assertRejected('[');
      assertRejected('[a');
      assertRejected('[a-');
    },
  },
  {
    name: 'a trailing backslash is a SyntaxError',
    run() {
      assertRejected('\\');
      assertRejected('a\\');
    },
  },
  {
    name: 'a bare ], }, or ) outside a quantifier is a SyntaxError under strict ES5 grammar',
    run() {
      assertRejected(']');
      assertRejected('{');
      assertRejected('}');
      assertRejected(')');
    },
  },
  {
    name: 'IdentityEscape rejects any approximated IdentifierPart',
    run() {
      assertRejected('\\a');
      assertRejected('\\e');
      assertRejected('\\p{L}');
      assertRejected('\\u{61}');
      assertRejected('\\k<x>');
      assertRejected('\\8');
      assertRejected('\\9');
      assertRejected('\\q');
    },
  },
  {
    name: 'IdentityEscape accepts non-identifier ASCII punctuation',
    run() {
      assertAccepted('\\-');
      assertAccepted('\\/');
      assertAccepted('\\$');
      assertAccepted('\\[');
    },
  },
  {
    name: '\\c must be followed by a control letter a-z or A-Z',
    run() {
      assertRejected('\\c1');
      assertRejected('\\c');
      assertAccepted('\\cA');
      assertAccepted('\\cz');
    },
  },
  {
    name: '\\x must be followed by exactly two hex digits',
    run() {
      assertRejected('\\x');
      assertRejected('\\x1');
      assertRejected('\\xzz');
      assertAccepted('\\x41');
    },
  },
  {
    name: '\\u must be followed by exactly four hex digits',
    run() {
      assertRejected('\\u');
      assertRejected('\\u123');
      assertRejected('\\uzzzz');
      assertAccepted('\\u0041');
    },
  },
  {
    name: 'parseFlags accepts g, i, m in any combination and the empty string',
    run() {
      let flags = parseFlags('');
      assertSame(flags.global, false);
      assertSame(flags.ignoreCase, false);
      assertSame(flags.multiline, false);

      flags = parseFlags('gim');
      assertSame(flags.global, true);
      assertSame(flags.ignoreCase, true);
      assertSame(flags.multiline, true);

      flags = parseFlags('mg');
      assertSame(flags.global, true);
      assertSame(flags.ignoreCase, false);
      assertSame(flags.multiline, true);
    },
  },
  {
    name: 'parseFlags rejects an unknown flag letter',
    run() {
      assertThrows(() => parseFlags('x'), RegExpSyntaxError);
      assertThrows(() => parseFlags('gx'), RegExpSyntaxError);
    },
  },
  {
    name: 'parseFlags rejects a duplicate flag letter',
    run() {
      assertThrows(() => parseFlags('gg'), RegExpSyntaxError);
      assertThrows(() => parseFlags('ii'), RegExpSyntaxError);
      assertThrows(() => parseFlags('mm'), RegExpSyntaxError);
    },
  },
];

export default tests;
