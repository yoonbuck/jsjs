import { charCodeOfCodeUnit, codeUnitsBetween } from './code-units.js';
import { identifierPartRanges } from '../builtins/unicode-case-data.js';

/**
 * A host-free, character-by-character recursive-descent validator for the
 * ES5.1 15.10.1 `Pattern` grammar.
 *
 * This module never touches a host `RegExp`: it is pure string scanning over
 * `source[index]`/`source.length` (the same "representation glue" allowance
 * `code-units.js` documents), plus `charCodeOfCodeUnit`/`codeUnitsBetween` for
 * numeric comparisons. `regexp-compat.js` calls `validatePattern` before it
 * ever builds a host regex, so unsupported modern syntax (named groups,
 * lookbehind, Unicode property escapes, the `u`/`y`/`s` grammar extensions,
 * Annex B octal escapes, …) is rejected here and never reaches the host.
 *
 * `IdentifierPart`: ES5 7.6 defines `IdentifierPart` as `IdentifierStart`
 * (`UnicodeLetter | $ | _`) plus `UnicodeCombiningMark`, `UnicodeDigit`,
 * `UnicodeConnectorPunctuation`, `<ZWNJ>`, and `<ZWJ>`. The Unicode portions
 * are checked with a generated BMP code-point table because this validator
 * scans ES5 SourceCharacters as UTF-16 code units. `$` is deliberately
 * *excluded* from the check even though 7.6 counts it as `IdentifierStart`:
 * every shipping engine accepts `\$` as an identity escape (it is one of the
 * ES2015+ `u`-mode `SyntaxCharacter`s, `^ $ \ . * + ? ( ) [ ] { } |`), and
 * rejecting the ordinary "escape a literal dollar sign" pattern would break
 * ubiquitous real-world code and the pinned Test262 selection.
 */

/**
 * @typedef {{ capturingGroups: number }} PatternInfo
 * @typedef {{ global: boolean, ignoreCase: boolean, multiline: boolean }} FlagSet
 */

/**
 * An engine-internal signal for a rejected `Pattern` or flag string. Callers
 * inside a native function body convert it to a guest `SyntaxError` by
 * throwing `new GuestErrorSignal('SyntaxError', message)`
 * (`src/runtime/completion.js`), which `runNativeBody` turns into a guest
 * throw completion. This class itself must never cross that boundary
 * unconverted.
 */
export class RegExpSyntaxError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'RegExpSyntaxError';
  }
}

/**
 * @param {string} flags
 * @returns {FlagSet}
 */
export function parseFlags(flags) {
  let global = false;
  let ignoreCase = false;
  let multiline = false;

  for (let index = 0; index < flags.length; index += 1) {
    const unit = flags[index];

    if (unit === 'g') {
      if (global) {
        throw new RegExpSyntaxError('Duplicate RegExp flag: g');
      }

      global = true;
    } else if (unit === 'i') {
      if (ignoreCase) {
        throw new RegExpSyntaxError('Duplicate RegExp flag: i');
      }

      ignoreCase = true;
    } else if (unit === 'm') {
      if (multiline) {
        throw new RegExpSyntaxError('Duplicate RegExp flag: m');
      }

      multiline = true;
    } else {
      throw new RegExpSyntaxError(`Invalid RegExp flag: ${unit}`);
    }
  }

  return { global, ignoreCase, multiline };
}

/**
 * Validates `source` against ES5.1 15.10.1's `Pattern` grammar and its
 * 15.10.2.* early errors, throwing `RegExpSyntaxError` for anything the
 * grammar does not admit (including syntax modern hosts accept under Annex B
 * or later editions, which ES5 does not).
 *
 * @param {string} source
 * @returns {PatternInfo}
 */
export function validatePattern(source) {
  const parser = new PatternParser(source);

  parser.parseDisjunction();

  if (parser.pos !== source.length) {
    // Parsing a Disjunction stops at the first unmatched ')', so leftover
    // input at the top level is always a stray, unbalanced ')'.
    throw new RegExpSyntaxError("Unmatched ')' in pattern");
  }

  for (const value of parser.backreferences) {
    if (value > parser.capturingGroups) {
      throw new RegExpSyntaxError(
        `Backreference \\${value} exceeds the pattern's ${parser.capturingGroups} capturing group(s)`,
      );
    }
  }

  return { capturingGroups: parser.capturingGroups };
}

/**
 * @param {string | undefined} unit A single code unit, or `undefined` at end of input.
 * @returns {boolean}
 */
function isAsciiLetter(unit) {
  return (
    unit !== undefined &&
    ((unit >= 'a' && unit <= 'z') || (unit >= 'A' && unit <= 'Z'))
  );
}

/**
 * @param {string | undefined} unit
 * @returns {boolean}
 */
function isDigit(unit) {
  return unit !== undefined && unit >= '0' && unit <= '9';
}

/**
 * @param {string | undefined} unit
 * @returns {boolean}
 */
function isHexDigit(unit) {
  return (
    isDigit(unit) ||
    (unit !== undefined &&
      ((unit >= 'a' && unit <= 'f') || (unit >= 'A' && unit <= 'F')))
  );
}

/**
 * @param {string | undefined} unit
 * @returns {boolean}
 */
function isCharacterClassEscapeLetter(unit) {
  return (
    unit === 'd' ||
    unit === 'D' ||
    unit === 's' ||
    unit === 'S' ||
    unit === 'w' ||
    unit === 'W'
  );
}

/**
 * @param {string} unit A single code unit.
 * @returns {boolean}
 */
function isIdentifierPart(unit) {
  const code = charCodeOfCodeUnit(unit);
  let low = 0;
  let high = identifierPartRanges.length / 2 - 1;

  // ES5 7.6 includes `$` in IdentifierPart, but `\$` is intentionally accepted
  // for compatibility with shipping engines and real-world patterns.
  if (code === 0x24) {
    return false;
  }

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = identifierPartRanges[middle * 2];
    const end = identifierPartRanges[middle * 2 + 1];

    if (code < start) {
      high = middle - 1;
    } else if (code > end) {
      low = middle + 1;
    } else {
      return true;
    }
  }

  return false;
}

/**
 * A single-code-unit value produced by a `ClassAtom`: either a decoded
 * numeric code unit (from a literal character or an escape), usable on
 * either side of a `-` range, or a `CharacterClassEscape` (`\d\D\s\S\w\W`),
 * which the grammar (15.10.2.15) forbids on either side of a range.
 *
 * @typedef {{ kind: 'value', value: number } | { kind: 'class' }} ClassAtomResult
 */

/**
 * Recursive-descent state for one `validatePattern` call. `pos` always
 * advances left to right; every `parse*` method either consumes some prefix
 * of `source` starting at `pos` or throws `RegExpSyntaxError`.
 *
 * Capturing-group counting and backreference-bound checking are split into
 * two phases so forward references validate correctly (ES5.1 15.10.2.9):
 * `capturingGroups` is incremented as `(` groups are opened during the single
 * left-to-right parse, `backreferences` records every referenced value
 * without checking it yet, and `validatePattern` compares the two only after
 * the whole pattern (and therefore the final group count) is known.
 */
class PatternParser {
  /**
   * @param {string} source
   */
  constructor(source) {
    /** @type {string} */
    this.source = source;
    /** @type {number} */
    this.pos = 0;
    /** @type {number} */
    this.capturingGroups = 0;
    /** @type {number[]} */
    this.backreferences = [];
  }

  /**
   * @returns {string | undefined}
   */
  peek() {
    return this.pos < this.source.length ? this.source[this.pos] : undefined;
  }

  /**
   * @param {number} offset
   * @returns {string | undefined}
   */
  peekAt(offset) {
    const index = this.pos + offset;
    return index < this.source.length ? this.source[index] : undefined;
  }

  /**
   * @param {string} unit
   * @returns {void}
   */
  expect(unit) {
    if (this.peek() !== unit) {
      throw new RegExpSyntaxError(`Expected '${unit}' in pattern`);
    }

    this.pos += 1;
  }

  /**
   * `Disjunction :: Alternative | Alternative "|" Disjunction`
   *
   * @returns {void}
   */
  parseDisjunction() {
    this.parseAlternative();

    while (this.peek() === '|') {
      this.pos += 1;
      this.parseAlternative();
    }
  }

  /**
   * `Alternative :: [empty] | Alternative Term`
   *
   * @returns {void}
   */
  parseAlternative() {
    while (
      this.pos < this.source.length &&
      this.peek() !== '|' &&
      this.peek() !== ')'
    ) {
      this.parseTerm();
    }
  }

  /**
   * `Term :: Assertion | Atom | Atom Quantifier`. An `Assertion` may never be
   * followed by a `Quantifier` under this grammar (there is no
   * `Term :: Assertion Quantifier` production), so `(?=x)*`, `^*`, and `\b+`
   * are all early errors here, with no exception for lookahead assertions.
   *
   * @returns {void}
   */
  parseTerm() {
    if (this.tryParseAssertion()) {
      if (this.tryParseQuantifier()) {
        throw new RegExpSyntaxError('A Quantifier cannot follow an Assertion');
      }

      return;
    }

    this.parseAtom();
    this.tryParseQuantifier();
  }

  /**
   * `Assertion :: "^" | "$" | "\b" | "\B" | "(?=" Disjunction ")" | "(?!" Disjunction ")"`
   *
   * @returns {boolean} Whether an assertion was consumed.
   */
  tryParseAssertion() {
    const unit = this.peek();

    if (unit === '^' || unit === '$') {
      this.pos += 1;
      return true;
    }

    if (unit === '\\' && (this.peekAt(1) === 'b' || this.peekAt(1) === 'B')) {
      this.pos += 2;
      return true;
    }

    if (
      unit === '(' &&
      this.peekAt(1) === '?' &&
      (this.peekAt(2) === '=' || this.peekAt(2) === '!')
    ) {
      this.pos += 3;
      this.parseDisjunction();
      this.expect(')');
      return true;
    }

    return false;
  }

  /**
   * `Atom :: PatternCharacter | "." | "\" AtomEscape | CharacterClass
   *        | "(" Disjunction ")" | "(?:" Disjunction ")"`
   *
   * Reached only when `tryParseAssertion` found no assertion, so `^`/`$`/
   * `(?=`/`(?!` never appear here. The remaining chars `PatternCharacter`
   * excludes (`\ . * + ? ( ) [ ] { } |`) are handled one at a time below;
   * `|` and `)` never reach this method because `parseAlternative` stops the
   * term loop before calling it on either.
   *
   * @returns {void}
   */
  parseAtom() {
    const unit = this.peek();

    if (unit === undefined) {
      throw new RegExpSyntaxError('Unexpected end of pattern');
    }

    if (unit === '.') {
      this.pos += 1;
      return;
    }

    if (unit === '\\') {
      this.pos += 1;
      this.parseAtomEscape();
      return;
    }

    if (unit === '[') {
      this.parseCharacterClass();
      return;
    }

    if (unit === '(') {
      this.parseGroup();
      return;
    }

    if (unit === '*' || unit === '+' || unit === '?') {
      throw new RegExpSyntaxError(
        `Quantifier '${unit}' with nothing to repeat`,
      );
    }

    if (unit === '{' || unit === '}' || unit === ']') {
      // ES5 PatternCharacter excludes these three, unlike Annex B's
      // web-compatibility grammar (which reinterprets a bare `{`/`}`/`]` as
      // a literal character). A `{` here is always a fresh Atom position
      // (any quantifier-shaped `{n,m}` is only ever consumed by
      // `tryParseQuantifier` *after* a preceding Atom), so it is always an
      // error, whether or not it looks like a well-formed quantifier.
      throw new RegExpSyntaxError(
        `'${unit}' is not a valid pattern character in ES5`,
      );
    }

    if (unit === ')') {
      throw new RegExpSyntaxError("Unmatched ')' in pattern");
    }

    this.pos += 1;
  }

  /**
   * `"(" Disjunction ")"` or `"(?:" Disjunction ")"`, called with `pos` on
   * the opening `(`. Any other `(?` form (named groups, lookbehind, …) is
   * unsupported ES2018+ syntax and rejected.
   *
   * @returns {void}
   */
  parseGroup() {
    this.pos += 1;
    let capturing = true;

    if (this.peek() === '?') {
      if (this.peekAt(1) === ':') {
        capturing = false;
        this.pos += 2;
      } else {
        throw new RegExpSyntaxError(
          `Unsupported group syntax '(?${this.peekAt(1) ?? ''}'`,
        );
      }
    }

    if (capturing) {
      this.capturingGroups += 1;
    }

    this.parseDisjunction();
    this.expect(')');
  }

  /**
   * `AtomEscape :: DecimalEscape | CharacterEscape | CharacterClassEscape`,
   * called with the leading `\` already consumed.
   *
   * @returns {void}
   */
  parseAtomEscape() {
    const unit = this.peek();

    if (unit === undefined) {
      throw new RegExpSyntaxError('Trailing backslash in pattern');
    }

    if (isDigit(unit)) {
      const value = this.parseDecimalEscapeValue();

      // ES5.1 15.10.2.9: a value of 0 denotes NUL and is never a
      // backreference; a value >= 1 is a backreference, checked against the
      // pattern's total capturing-group count once the whole pattern (and
      // therefore that total) is known.
      if (value !== 0) {
        this.backreferences.push(value);
      }

      return;
    }

    if (isCharacterClassEscapeLetter(unit)) {
      this.pos += 1;
      return;
    }

    this.parseCharacterEscape();
  }

  /**
   * `ClassEscape :: DecimalEscape | "b" | CharacterEscape | CharacterClassEscape`,
   * called with the leading `\` already consumed, inside a `[...]`.
   *
   * @returns {ClassAtomResult}
   */
  parseClassEscape() {
    const unit = this.peek();

    if (unit === undefined) {
      throw new RegExpSyntaxError('Trailing backslash in pattern');
    }

    if (unit === 'b') {
      this.pos += 1;
      return { kind: 'value', value: 0x08 };
    }

    if (isCharacterClassEscapeLetter(unit)) {
      this.pos += 1;
      return { kind: 'class' };
    }

    if (isDigit(unit)) {
      const value = this.parseDecimalEscapeValue();

      // ES5.1 15.10.2.19: inside a character class a DecimalEscape is only
      // legal for the value zero (NUL); there is no backreference form here.
      if (value !== 0) {
        throw new RegExpSyntaxError(
          'Backreferences are not allowed inside a character class',
        );
      }

      return { kind: 'value', value: 0 };
    }

    return this.parseCharacterEscape();
  }

  /**
   * `CharacterEscape :: ControlEscape | "c" ControlLetter
   *                    | HexEscapeSequence | UnicodeEscapeSequence
   *                    | IdentityEscape`,
   * called with the leading `\` already consumed and after the caller has
   * ruled out `DecimalEscape`/`CharacterClassEscape` (and, inside a class,
   * `"b"`).
   *
   * @returns {ClassAtomResult}
   */
  parseCharacterEscape() {
    const unit = this.peek();

    if (unit === undefined) {
      throw new RegExpSyntaxError('Trailing backslash in pattern');
    }

    switch (unit) {
      case 'f':
        this.pos += 1;
        return { kind: 'value', value: 0x0c };
      case 'n':
        this.pos += 1;
        return { kind: 'value', value: 0x0a };
      case 'r':
        this.pos += 1;
        return { kind: 'value', value: 0x0d };
      case 't':
        this.pos += 1;
        return { kind: 'value', value: 0x09 };
      case 'v':
        this.pos += 1;
        return { kind: 'value', value: 0x0b };
      case 'c':
        return this.parseControlLetterEscape();
      case 'x':
        this.pos += 1;
        return { kind: 'value', value: this.parseHexDigits(2) };
      case 'u':
        this.pos += 1;
        return { kind: 'value', value: this.parseHexDigits(4) };
      default:
        return this.parseIdentityEscape();
    }
  }

  /**
   * `"c" ControlLetter`, `ControlLetter :: one of a-z A-Z`, called with
   * `pos` on the `c`. The resulting code unit is the letter's code point
   * modulo 32 (ES5.1 15.10.2.10 step 4-5): ASCII upper- and lowercase
   * letters differ by exactly `0x20`, a multiple of 32, so both cases of the
   * same letter already reduce to the same value and no case conversion
   * (which would mean calling a forbidden host String method) is needed.
   *
   * @returns {ClassAtomResult}
   */
  parseControlLetterEscape() {
    const letter = this.peekAt(1);

    if (!isAsciiLetter(letter)) {
      throw new RegExpSyntaxError(
        "'\\c' must be followed by a control letter a-z or A-Z",
      );
    }

    this.pos += 2;
    return {
      kind: 'value',
      value: charCodeOfCodeUnit(/** @type {string} */ (letter)) % 32,
    };
  }

  /**
   * `IdentityEscape :: SourceCharacter but not IdentifierPart`, called with
   * `pos` on the escaped character.
   *
   * @returns {ClassAtomResult}
   */
  parseIdentityEscape() {
    const unit = this.peek();

    if (unit === undefined) {
      throw new RegExpSyntaxError('Trailing backslash in pattern');
    }

    if (isIdentifierPart(unit)) {
      throw new RegExpSyntaxError(`Invalid identity escape '\\${unit}'`);
    }

    this.pos += 1;
    return { kind: 'value', value: charCodeOfCodeUnit(unit) };
  }

  /**
   * `DecimalEscape :: DecimalIntegerLiteral [lookahead not in DecimalDigit]`,
   * `DecimalIntegerLiteral :: "0" | NonZeroDigit DecimalDigits?`, called with
   * `pos` on the first digit. A leading `0` is always exactly one digit (the
   * NUL escape), but the production's trailing `[lookahead not in
   * DecimalDigit]` still applies to it: `\00`..`\09` are Annex B legacy octal
   * escapes that the ES5 grammar deliberately excludes, so a `0` followed by
   * another digit is a SyntaxError. The `NonZeroDigit DecimalDigits?`
   * alternative consumes the whole following run of digits as one decimal
   * value, which structurally satisfies its own lookahead constraint (there
   * are no more digits left to look ahead at once the run ends).
   *
   * @returns {number}
   */
  parseDecimalEscapeValue() {
    if (this.peek() === '0') {
      this.pos += 1;

      if (isDigit(this.peek())) {
        throw new RegExpSyntaxError(
          "A DecimalEscape of '0' must not be followed by another decimal digit",
        );
      }

      return 0;
    }

    const start = this.pos;

    while (isDigit(this.peek())) {
      this.pos += 1;
    }

    return Number(codeUnitsBetween(this.source, start, this.pos));
  }

  /**
   * Reads exactly `count` hex digits starting at `pos`, used by both
   * `HexEscapeSequence` (`count` 2) and `UnicodeEscapeSequence` (`count` 4).
   *
   * @param {number} count
   * @returns {number}
   */
  parseHexDigits(count) {
    const start = this.pos;

    for (let index = 0; index < count; index += 1) {
      if (!isHexDigit(this.peek())) {
        throw new RegExpSyntaxError(`Expected ${count} hex digits`);
      }

      this.pos += 1;
    }

    return Number.parseInt(codeUnitsBetween(this.source, start, this.pos), 16);
  }

  /**
   * `CharacterClass :: "[" [lookahead not "^"] ClassRanges "]" | "[^" ClassRanges "]"`,
   * called with `pos` on the opening `[`.
   *
   * @returns {void}
   */
  parseCharacterClass() {
    this.pos += 1;

    if (this.peek() === '^') {
      this.pos += 1;
    }

    this.parseClassRanges();
    this.expect(']');
  }

  /**
   * `ClassRanges :: [empty] | NonemptyClassRanges`. This method (together
   * with `parseClassAtom`) implements the whole `NonemptyClassRanges`/
   * `NonemptyClassRangesNoDash` family with one greedy left-to-right pass,
   * matching every shipping engine's practical resolution of that grammar's
   * ambiguity: after reading a `ClassAtom`, a following `-` forms a range
   * with the *next* `ClassAtom` unless that `-` is immediately followed by
   * the closing `]` (a trailing `-` is then a literal `ClassAtom` on the
   * next iteration instead).
   *
   * @returns {void}
   */
  parseClassRanges() {
    while (this.peek() !== ']') {
      if (this.pos >= this.source.length) {
        throw new RegExpSyntaxError('Unterminated character class');
      }

      const left = this.parseClassAtom();

      if (
        this.peek() === '-' &&
        this.peekAt(1) !== ']' &&
        this.peekAt(1) !== undefined
      ) {
        this.pos += 1;
        const right = this.parseClassAtom();
        this.validateClassRange(left, right);
      }
    }
  }

  /**
   * ES5.1 15.10.2.15's `CharacterRange` early errors: a `CharacterClassEscape`
   * (`\d\D\s\S\w\W`) may not stand on either side of a `-` range, and a range
   * whose bounds are out of code-unit order is a SyntaxError.
   *
   * @param {ClassAtomResult} left
   * @param {ClassAtomResult} right
   * @returns {void}
   */
  validateClassRange(left, right) {
    if (left.kind === 'class' || right.kind === 'class') {
      throw new RegExpSyntaxError(
        'A character class range cannot use \\d, \\D, \\s, \\S, \\w, or \\W as either bound',
      );
    }

    if (left.value > right.value) {
      throw new RegExpSyntaxError(
        `Character class range out of order: ${left.value}-${right.value}`,
      );
    }
  }

  /**
   * `ClassAtom :: "-" | ClassAtomNoDash`,
   * `ClassAtomNoDash :: SourceCharacter but not one of "\" or "]" or "-" | "\" ClassEscape`,
   * called with `pos` on the atom (never on the closing `]`, which
   * `parseClassRanges` checks for before calling this).
   *
   * @returns {ClassAtomResult}
   */
  parseClassAtom() {
    const unit = /** @type {string} */ (this.peek());

    if (unit === '\\') {
      this.pos += 1;
      return this.parseClassEscape();
    }

    this.pos += 1;
    return { kind: 'value', value: charCodeOfCodeUnit(unit) };
  }

  /**
   * `Quantifier :: QuantifierPrefix | QuantifierPrefix "?"`,
   * `QuantifierPrefix :: "*" | "+" | "?" | "{" DecimalDigits "}"
   *                    | "{" DecimalDigits ",}" | "{" DecimalDigits "," DecimalDigits "}"`.
   * Backtracks (restoring `pos`) when a `{` does not resolve to a
   * well-formed `{n}`/`{n,}`/`{n,m}` form, so callers can then try parsing a
   * fresh `Atom` at that `{` and get ES5's "not a valid pattern character"
   * error instead of a quantifier-shaped one.
   *
   * @returns {boolean} Whether a quantifier was consumed.
   */
  tryParseQuantifier() {
    const unit = this.peek();

    if (unit === '*' || unit === '+' || unit === '?') {
      this.pos += 1;
      this.consumeOptionalLazyMarker();
      return true;
    }

    if (unit !== '{') {
      return false;
    }

    const saved = this.pos;
    this.pos += 1;

    const min = this.tryParseDecimalDigits();

    if (min === undefined) {
      this.pos = saved;
      return false;
    }

    if (this.peek() === '}') {
      this.pos += 1;
      this.consumeOptionalLazyMarker();
      return true;
    }

    if (this.peek() !== ',') {
      this.pos = saved;
      return false;
    }

    this.pos += 1;

    if (this.peek() === '}') {
      this.pos += 1;
      this.consumeOptionalLazyMarker();
      return true;
    }

    const max = this.tryParseDecimalDigits();

    if (max === undefined || this.peek() !== '}') {
      this.pos = saved;
      return false;
    }

    this.pos += 1;

    // ES5.1 15.10.2.5 step 3's RepeatMatcher construction requires min <= max.
    if (max < min) {
      throw new RegExpSyntaxError(
        `Quantifier range out of order: {${min},${max}}`,
      );
    }

    this.consumeOptionalLazyMarker();
    return true;
  }

  /**
   * The optional trailing `?` in `Quantifier :: QuantifierPrefix "?"`
   * (a non-greedy quantifier).
   *
   * @returns {void}
   */
  consumeOptionalLazyMarker() {
    if (this.peek() === '?') {
      this.pos += 1;
    }
  }

  /**
   * `DecimalDigits :: DecimalDigit | DecimalDigits DecimalDigit` (one or
   * more digits, leading zeros included, unlike `DecimalIntegerLiteral`).
   *
   * @returns {number | undefined} `undefined` when no digit is present.
   */
  tryParseDecimalDigits() {
    const start = this.pos;

    while (isDigit(this.peek())) {
      this.pos += 1;
    }

    if (this.pos === start) {
      return undefined;
    }

    return Number(codeUnitsBetween(this.source, start, this.pos));
  }
}
