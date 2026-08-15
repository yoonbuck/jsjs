// The parser dependency is reached through `./parser-dependency.js`, the one
// engine module that names it: see that file for why the vendored build exists
// and how it keeps Node, browser, and `jsc` runs on the same source.
import { Parser } from './parser-dependency.js';
import {
  normalizeSyntaxError,
  UnsupportedNodeError,
} from './runtime/errors.js';
import { hasUseStrictDirective } from './evaluator/directive.js';
import {
  summarizeBoundNames,
  topLevelLexicallyDeclaredNames,
  topLevelVarDeclaredNames,
} from './evaluator/static-semantics.js';
import {
  parseFlags,
  RegExpSyntaxError,
  validatePattern,
} from './runtime/regexp-syntax.js';

const HostRegExp = RegExp;
const PARSER_OPTIONS = Object.freeze({
  ecmaVersion: 6,
  sourceType: 'script',
  locations: true,
  ranges: true,
});

/**
 * Parses with Acorn's base script parser. A named wrapper rather than a
 * detached `Parser.parse` reference because Acorn's static `parse` reads `this`
 * (`new this(...)`), so it must stay a method call.
 *
 * At `ecmaVersion: 6` Acorn interprets an identifier's Unicode escape
 * sequences *before* applying the ES §12.6 reserved-word rule, so an identifier
 * whose code points spell a reserved word (`var \u0063lass = 1`, a strict
 * escaped `yield` label, escaped `implements`/`package`/`private` bindings,
 * escaped `let` in a lexical declaration) is already a parse-phase
 * `SyntaxError`. The `ecmaVersion < 6` plugin that used to restore that check by
 * hand is therefore obsolete and has been removed; the upstream
 * `val-*-via-escape` / `value-yield-strict-escaped` tests still pass on Acorn's
 * native behavior.
 *
 * @param {string} source
 * @param {any} options
 * @returns {any}
 */
function parseWithScriptParser(source, options) {
  return Parser.parse(source, options);
}

/**
 * A parser subclass that begins parsing already in strict mode (ECMA-262
 * 10.1.1). Acorn only switches a script into strict parsing when it actually
 * reads a `"use strict"` directive, but `eval` code can be strict by
 * *inheritance* from a direct strict caller with no directive of its own
 * (10.4.2.1). Forcing `this.strict = true` in the constructor makes the
 * parser apply every strict-mode early error — rejecting `var eval = 1`,
 * `with (x) {}`, legacy octal literals, duplicate parameter names, and the
 * rest — to source that carries no directive, which is exactly what strict
 * eval requires. Prepending a synthetic `"use strict";` to the source would
 * shift positions and is deliberately avoided.
 *
 * At `ecmaVersion: 6` Acorn re-applies the reserved-word rule to escaped
 * identifiers itself (see `parseWithScriptParser`), so a strict eval rejects an
 * escaped strict FutureReservedWord (`\u0079ield`) exactly as a script does
 * without any plugin of ours.
 *
 * Constructed lazily and memoized so the subclass is built once.
 *
 * @type {typeof Parser | undefined}
 */
let strictParser;
/** @type {typeof Parser | undefined} */
let sloppyScriptParser;
/** @type {typeof Parser | undefined} */
let directSuperParser;
/** @type {typeof Parser | undefined} */
let strictDirectSuperParser;

/**
 * @returns {typeof Parser}
 */
function getStrictParser() {
  if (strictParser === undefined) {
    strictParser = Parser.extend(
      (Base) =>
        class extends Base {
          /**
           * @param {any} options
           * @param {string} input
           * @param {number} [startPos]
           */
          constructor(options, input, startPos) {
            super(options, input, startPos);
            this.strict = true;
          }
        },
    );
  }

  return strictParser;
}

/**
 * Acorn normally discovers a script's strictness from its own leading
 * directives. When appending after a closed directive prologue, those strings
 * are no longer directives in the combined Program, so top-level parsing must
 * remain sloppy. Function bodies still discover their own directives normally.
 *
 * @returns {typeof Parser}
 */
function getSloppyScriptParser() {
  if (sloppyScriptParser === undefined) {
    sloppyScriptParser = Parser.extend(
      (Base) =>
        class extends Base {
          /**
           * @param {any} options
           * @param {string} input
           * @param {number} [startPos]
           */
          constructor(options, input, startPos) {
            super(options, input, startPos);
            this.strict = false;
          }
        },
    );
  }

  return sloppyScriptParser;
}

/**
 * Acorn's public `allowSuperOutsideMethod` option admits super-property syntax
 * but deliberately still rejects direct `super(...)`. Eval code needs both
 * forms to reach this module's context-sensitive early-error pass when the
 * direct caller is a derived constructor.
 *
 * @param {boolean} strict
 * @param {boolean} allowDirectSuper
 * @returns {typeof Parser}
 */
function getEvalParser(strict, allowDirectSuper) {
  if (!allowDirectSuper) {
    return strict ? getStrictParser() : Parser;
  }

  if (directSuperParser === undefined) {
    directSuperParser = Parser.extend(
      (Base) =>
        class extends Base {
          get allowDirectSuper() {
            return true;
          }
        },
    );
  }

  if (strictDirectSuperParser === undefined) {
    strictDirectSuperParser = getStrictParser().extend(
      (Base) =>
        class extends Base {
          get allowDirectSuper() {
            return true;
          }
        },
    );
  }

  return strict
    ? /** @type {typeof Parser} */ (strictDirectSuperParser)
    : directSuperParser;
}

/**
 * @param {string} source
 * @param {Record<string, unknown>} [options]
 * @returns {any}
 */
export function parseScript(source, options = {}) {
  const { parse = parseWithScriptParser, ...parserOptions } = options;
  const hasCustomParse = parse !== parseWithScriptParser;
  // `parserOptions` has exactly the own enumerable properties that the spread
  // below forwards to Acorn. An inherited `program` is therefore irrelevant,
  // while even an own `undefined` or `null` value makes this parser result
  // untrusted: Acorn can append to a supplied Program object.
  const hasCustomProgram = Object.prototype.propertyIsEnumerable.call(
    parserOptions,
    'program',
  );
  const hasReusableProgram =
    !hasCustomParse && hasCustomProgram && Boolean(parserOptions.program);
  const reusableProgram = hasReusableProgram
    ? parserOptions.program
    : undefined;
  let reusableProgramSnapshot;
  /** @type {WeakSet<object> | undefined} */
  let reusableProgramSnapshotValues;
  let reusableDirectivePrologueOpen = false;
  let reusableProgramStrict = false;

  if (typeof parse !== 'function') {
    throw new TypeError('Expected options.parse to be a function');
  }

  if (hasReusableProgram) {
    reusableProgramSnapshotValues = new WeakSet();
    reusableProgramSnapshot = snapshotProgramGraph(
      reusableProgram,
      reusableProgramSnapshotValues,
    );
    validateReusableProgram(reusableProgramSnapshot);
    const reusableBody = /** @type {any[]} */ (
      ownDataPropertyValue(
        /** @type {object} */ (reusableProgramSnapshot),
        'body',
      )
    );
    reusableDirectivePrologueOpen = hasOpenDirectivePrologue(reusableBody);
    reusableProgramStrict = hasUseStrictDirective(reusableBody);
    delete parserOptions.program;
  }

  let program;

  try {
    const effectiveOptions = {
      ...parserOptions,
      ...PARSER_OPTIONS,
    };

    if (hasReusableProgram && reusableProgramStrict) {
      program = getStrictParser().parse(source, effectiveOptions);
    } else if (hasReusableProgram && !reusableDirectivePrologueOpen) {
      program = getSloppyScriptParser().parse(source, effectiveOptions);
    } else {
      program = parse(source, effectiveOptions);
    }
  } catch (error) {
    // Only the engine's own parser gets the stack-overflow conversion below.
    // An embedder that injected its own `parse` owns whatever that throws;
    // relabelling its overflow as a parse failure would hide its defect the
    // same way relabelling a host error inside the engine would hide ours.
    throw asParseFailure(error, parse === parseWithScriptParser);
  }

  if (hasCustomParse) {
    program = snapshotProgramGraph(program);
  }

  if (hasReusableProgram) {
    if (
      reusableDirectivePrologueOpen &&
      !reusableProgramStrict &&
      hasUseStrictDirective(program.body)
    ) {
      checkStrictDirectiveLiterals(
        /** @type {any[]} */ (
          ownDataPropertyValue(
            /** @type {object} */ (reusableProgramSnapshot),
            'body',
          )
        ),
      );
    }

    program = mergeReusableProgram(
      /** @type {any} */ (reusableProgramSnapshot),
      program,
    );
  }

  return validateScriptProgram(
    program,
    source,
    false,
    hasCustomParse || hasCustomProgram,
    hasReusableProgram,
    reusableProgramSnapshotValues,
  );
}

/**
 * Parses dynamic `eval` source as a `Program` (ECMA-262 15.1.2.1 step 2).
 *
 * When `strict` is true the forced-strict parser is used so a strict eval
 * gets ES5 strict early errors even though the source carries no `"use
 * strict"` directive; otherwise the ordinary parser runs and Acorn still
 * turns on strict parsing by itself if the source *does* open with a
 * directive. A parse failure is normalized to a host `SyntaxError` exactly
 * as `parseScript` does — the eval entry point in `src/evaluator/eval.js`
 * converts that into a realm-local guest `SyntaxError`.
 *
 * @param {string} source
 * @param {boolean} [strict=false]
 * @param {{ superAllowed?: boolean, superCallAllowed?: boolean }} [context]
 * @returns {any}
 */
export function parseEval(source, strict = false, context = {}) {
  const superCallAllowed = context.superCallAllowed === true;
  const superAllowed = context.superAllowed === true || superCallAllowed;
  const parser = getEvalParser(strict, superCallAllowed);
  const parserOptions = superAllowed
    ? { ...PARSER_OPTIONS, allowSuperOutsideMethod: true }
    : PARSER_OPTIONS;

  let program;

  try {
    program = parser.parse(source, parserOptions);
  } catch (error) {
    throw asParseFailure(error, true);
  }

  return validateScriptProgram(
    program,
    source,
    strict,
    false,
    false,
    undefined,
    { superAllowed, superCallAllowed },
  );
}

/**
 * Validates the parsed program's shape and runs the parse-time early-error
 * pass. `strict` is the strictness the program *inherits* from its context —
 * always `false` for a script (whose strictness is decided solely by its own
 * directive prologue), and the caller-supplied flag for a strict `eval` that
 * inherits strictness with no directive of its own. The early-error pass folds
 * the program's own `"use strict"` directive in on top of it.
 *
 * `source` is the exact text the parser consumed, threaded through so the
 * unsupported-ES2015 pass can compare an `Identifier`'s raw source span
 * (`source.slice(node.start, node.end)`) against its interpreted `name` to
 * detect an ES2015 code-point escape (`\u{...}`), the way `checkUnreserved`
 * once compared the two.
 *
 * @param {unknown} program
 * @param {string} source
 * @param {boolean} [strict=false]
 * @param {boolean} [customAst=false]
 * @param {boolean} [customAstValidated=false]
 * @param {WeakSet<object>} [sourceIndependentNodes]
 * @param {{ superAllowed: boolean, superCallAllowed: boolean }} [rootContext]
 * @returns {any}
 */
function validateScriptProgram(
  program,
  source,
  strict = false,
  customAst = false,
  customAstValidated = false,
  sourceIndependentNodes,
  rootContext = { superAllowed: false, superCallAllowed: false },
) {
  if (customAst && !customAstValidated) {
    checkUntrustedAstDescriptors(program);
  }

  if (!isScriptProgram(program)) {
    throw new TypeError('Expected parser to return a script Program node');
  }

  if (customAst && !customAstValidated) {
    checkCustomAstDefenses(/** @type {any} */ (program));
  }

  checkStatementPositionFunctionDeclarations(
    /** @type {any} */ (program),
    source,
    strict,
    customAst,
    sourceIndependentNodes,
    rootContext,
  );
  checkProgramDeclarationEarlyErrors(/** @type {any} */ (program).body);

  return /** @type {any} */ (program);
}

/**
 * Takes ownership of an untrusted AST graph before validation can inspect it.
 * Own data properties are copied descriptor-by-descriptor into ordinary objects
 * and arrays, preserving cycles and shared references without invoking
 * accessors. Non-index array properties are omitted so a shadowed `map`,
 * `every`, or iterator cannot become executable validation state; their
 * detached values are still scanned to ensure the omission cannot hide an AST
 * node or function. Functions are rejected everywhere because no
 * evaluator-relevant ESTree value requires one and retaining one would preserve
 * caller-owned executable state.
 *
 * Reflection is unavoidable for Proxy inputs, but no ordinary property read or
 * caller-supplied method is used.
 *
 * @param {unknown} program
 * @param {WeakSet<object>} [snapshotValues]
 * @returns {unknown}
 */
function snapshotProgramGraph(program, snapshotValues) {
  /** @type {WeakMap<object, object>} */
  const copies = new WeakMap();
  /** @type {{ source: object, target: object, array: boolean }[]} */
  const pending = [];
  /** @type {unknown[]} */
  const omittedArrayMetadata = [];

  /**
   * @param {unknown} value
   * @returns {unknown}
   */
  function copyValue(value) {
    if (typeof value === 'function') {
      throw untrustedAstSyntaxError(
        'Untrusted AST values must not be functions',
      );
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const existing = copies.get(value);

    if (existing !== undefined) {
      return existing;
    }

    const array = Array.isArray(value);
    const copy = array ? [] : {};
    copies.set(value, copy);
    snapshotValues?.add(copy);
    pending.push({ source: value, target: copy, array });
    return copy;
  }

  const snapshot = copyValue(program);

  while (pending.length > 0) {
    const { source, target, array } =
      /** @type {{ source: object, target: object, array: boolean }} */ (
        pending.pop()
      );
    const keys = Reflect.ownKeys(source);
    let arrayLength = 0;
    let arrayLengthWritable = true;
    const regexpLiteralValue = array
      ? undefined
      : createSnapshotRegExpLiteralValue(source);

    checkSnapshotSourceSyntaxInheritance(source);

    if (array) {
      const length = Reflect.getOwnPropertyDescriptor(source, 'length');

      if (
        length === undefined ||
        !Object.prototype.hasOwnProperty.call(length, 'value') ||
        !Number.isSafeInteger(length.value) ||
        length.value < 0
      ) {
        throw new TypeError('Expected Program body to be an ordinary array');
      }

      arrayLength = length.value;
      arrayLengthWritable = length.writable === true;
      Reflect.defineProperty(target, 'length', {
        value: arrayLength,
        writable: true,
        enumerable: false,
        configurable: false,
      });
    }

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];

      if (array && key === 'length') {
        continue;
      }

      const descriptor = Reflect.getOwnPropertyDescriptor(source, key);

      if (descriptor === undefined) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw untrustedAstSyntaxError(
          'Untrusted AST properties must be own data properties',
        );
      }

      if (array && !isDirectArrayElementKey(key, arrayLength)) {
        omittedArrayMetadata.push(descriptor.value);
        continue;
      }

      const copiedValue = copyValue(descriptor.value);
      const copiedDescriptor = {
        value:
          key === 'value' && regexpLiteralValue !== undefined
            ? regexpLiteralValue
            : copiedValue,
        writable: descriptor.writable === true,
        enumerable: descriptor.enumerable === true,
        configurable: descriptor.configurable === true,
      };

      if (!Reflect.defineProperty(target, key, copiedDescriptor)) {
        throw new TypeError('Unable to snapshot untrusted AST property');
      }
    }

    if (
      array &&
      !arrayLengthWritable &&
      !Reflect.defineProperty(target, 'length', { writable: false })
    ) {
      throw new TypeError('Unable to snapshot untrusted AST array');
    }
  }

  checkOmittedArrayMetadata(omittedArrayMetadata);
  return snapshot;
}

/**
 * Reconstructs Acorn's host-RegExp convenience value only from the literal's
 * validated, descriptor-safe pattern record. The caller's value object is
 * never queried or invoked.
 *
 * @param {object} source
 * @returns {RegExp | undefined}
 */
function createSnapshotRegExpLiteralValue(source) {
  const type = Reflect.getOwnPropertyDescriptor(source, 'type');
  const regex = Reflect.getOwnPropertyDescriptor(source, 'regex');

  if (
    type === undefined ||
    !Object.prototype.hasOwnProperty.call(type, 'value') ||
    type.value !== 'Literal' ||
    regex === undefined ||
    !Object.prototype.hasOwnProperty.call(regex, 'value') ||
    !isRegexLiteralRecord(regex.value)
  ) {
    return undefined;
  }

  const pattern = /** @type {PropertyDescriptor} */ (
    Reflect.getOwnPropertyDescriptor(regex.value, 'pattern')
  ).value;
  const flags = /** @type {PropertyDescriptor} */ (
    Reflect.getOwnPropertyDescriptor(regex.value, 'flags')
  ).value;

  try {
    parseFlags(flags);
    validatePattern(pattern);
  } catch {
    return undefined;
  }

  return new HostRegExp(pattern, flags);
}

/**
 * Rejects inherited syntax before ordinary snapshot objects discard the
 * caller's prototypes. Prototype descriptors are inspected without reading
 * their values, so inherited accessors never execute.
 *
 * @param {object} value
 * @returns {void}
 */
function checkSnapshotSourceSyntaxInheritance(value) {
  const type = Reflect.getOwnPropertyDescriptor(value, 'type');

  if (type === undefined) {
    if (hasInheritedAstSyntaxField(value, 'type')) {
      throw untrustedAstSyntaxError(
        'Untrusted AST syntax fields must not be inherited',
      );
    }
    return;
  }

  if (
    !Object.prototype.hasOwnProperty.call(type, 'value') ||
    typeof type.value !== 'string'
  ) {
    return;
  }

  for (const field of UNTRUSTED_AST_SYNTAX_FIELD_NAMES) {
    if (
      field !== 'type' &&
      Reflect.getOwnPropertyDescriptor(value, field) === undefined &&
      hasInheritedAstSyntaxField(value, field)
    ) {
      throw untrustedAstSyntaxError(
        'Untrusted AST syntax fields must not be inherited',
      );
    }
  }

  checkUntrustedAstSourceLocation(value);
}

/**
 * Array metadata is not retained on the engine-owned snapshot. Scan its data
 * graph first so an omitted method-shadow or symbol property cannot conceal an
 * AST node from the capability boundary.
 *
 * @param {unknown[]} roots
 * @returns {void}
 */
function checkOmittedArrayMetadata(roots) {
  /** @type {unknown[]} */
  const pending = roots.slice();
  /** @type {WeakSet<object>} */
  const seen = new WeakSet();

  while (pending.length > 0) {
    const value = pending.pop();

    if (typeof value === 'function') {
      throw untrustedAstSyntaxError(
        'Untrusted AST values must not be functions',
      );
    }

    if (!value || typeof value !== 'object') {
      continue;
    }

    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    checkSnapshotSourceSyntaxInheritance(value);

    const keys = Reflect.ownKeys(value);

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);

      if (descriptor === undefined) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw untrustedAstSyntaxError(
          'Untrusted AST properties must be own data properties',
        );
      }

      if (key === 'type' && typeof descriptor.value === 'string') {
        throw untrustedAstSyntaxError(
          'Untrusted AST nodes cannot be hidden in array metadata',
        );
      }

      pending.push(descriptor.value);
    }
  }
}

/**
 * Validates a Program supplied for Acorn-style statement appending. parseScript
 * never gives the caller-owned graph to Acorn: it validates and uses only the
 * engine-owned snapshot while callbacks can mutate the ignored original.
 * Requiring Acorn's location shape also turns malformed reuse targets into a
 * parser-boundary TypeError without partially writing to them.
 *
 * @param {unknown} program
 * @returns {void}
 */
function validateReusableProgram(program) {
  checkUntrustedAstDescriptors(program);

  if (!isScriptProgram(program)) {
    throw new TypeError('Expected parser to return a script Program node');
  }

  if (!hasReusableProgramPositionShape(/** @type {any} */ (program))) {
    throw new TypeError(
      'Expected a reusable Acorn Program with locations and ranges',
    );
  }

  checkCustomAstDefenses(/** @type {any} */ (program));
}

/**
 * @param {any} program
 * @returns {boolean}
 */
function hasReusableProgramPositionShape(program) {
  const loc = ownDataPropertyValue(program, 'loc');
  const range = ownDataPropertyValue(program, 'range');

  return (
    isOwnNonnegativeInteger(program, 'start') &&
    isOwnNonnegativeInteger(program, 'end') &&
    !!loc &&
    typeof loc === 'object' &&
    isSourcePosition(ownDataPropertyValue(loc, 'start')) &&
    isSourcePosition(ownDataPropertyValue(loc, 'end')) &&
    Array.isArray(range) &&
    isOwnNonnegativeInteger(range, '0') &&
    isOwnNonnegativeInteger(range, '1')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isSourcePosition(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    isOwnPositiveInteger(value, 'line') &&
    isOwnNonnegativeInteger(value, 'column')
  );
}

/**
 * @param {object} value
 * @param {string} key
 * @returns {unknown}
 */
function ownDataPropertyValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  return descriptor !== undefined &&
    Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

/**
 * @param {object} value
 * @param {string} key
 * @returns {boolean}
 */
function isOwnNonnegativeInteger(value, key) {
  const field = ownDataPropertyValue(value, key);

  return Number.isInteger(field) && /** @type {number} */ (field) >= 0;
}

/**
 * @param {object} value
 * @param {string} key
 * @returns {boolean}
 */
function isOwnPositiveInteger(value, key) {
  const field = ownDataPropertyValue(value, key);

  return Number.isInteger(field) && /** @type {number} */ (field) > 0;
}

/**
 * Produces an Acorn-owned Program and body without writing to the supplied
 * Program or calling any method on its graph.
 *
 * @param {any} existingProgram
 * @param {any} parsedProgram
 * @returns {any}
 */
function mergeReusableProgram(existingProgram, parsedProgram) {
  const existingBody = /** @type {any[]} */ (
    ownDataPropertyValue(existingProgram, 'body')
  );
  const parsedBody = /** @type {any[]} */ (
    ownDataPropertyValue(parsedProgram, 'body')
  );
  const mergedBody = /** @type {any[]} */ ([]);
  const existingLength = ownArrayLength(existingBody);
  const parsedLength = ownArrayLength(parsedBody);

  for (let index = 0; index < existingLength; index += 1) {
    defineArrayElement(
      mergedBody,
      mergedBody.length,
      ownDenseArrayElementValue(existingBody, index),
    );
  }

  if (!hasOpenDirectivePrologue(existingBody)) {
    for (let index = 0; index < parsedLength; index += 1) {
      const statement = ownDenseArrayElementValue(parsedBody, index);

      if (statement && typeof statement === 'object') {
        Reflect.deleteProperty(statement, 'directive');
      }
    }
  }

  for (let index = 0; index < parsedLength; index += 1) {
    defineArrayElement(
      mergedBody,
      mergedBody.length,
      ownDenseArrayElementValue(parsedBody, index),
    );
  }

  Object.defineProperty(parsedProgram, 'body', {
    value: mergedBody,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  return parsedProgram;
}

/**
 * Applies ScriptBody's declaration early errors to a Program.
 *
 * The shared top-level static semantics preserve the important distinctions:
 * classes and destructuring contribute all bound lexical names, direct and
 * labelled functions are var-scoped, and block functions stay out of the
 * top-level var list so Annex B eligibility is not approximated here.
 *
 * @param {readonly any[]} body
 * @returns {void}
 */
function checkProgramDeclarationEarlyErrors(body) {
  const lexicalNames = topLevelLexicallyDeclaredNames(body);
  const varNames = new Set(topLevelVarDeclaredNames(body));
  const seenLexicalNames = new Set();

  for (const name of lexicalNames) {
    if (seenLexicalNames.has(name) || varNames.has(name)) {
      throw new SyntaxError(`Identifier '${name}' has already been declared`);
    }

    seenLexicalNames.add(name);
  }
}

/**
 * @param {any[]} body
 * @returns {number}
 */
function ownArrayLength(body) {
  const length = ownDataPropertyValue(body, 'length');

  if (!Number.isSafeInteger(length) || /** @type {number} */ (length) < 0) {
    throw new TypeError('Expected Program body to be an ordinary array');
  }

  return /** @type {number} */ (length);
}

/**
 * @param {any[]} body
 * @returns {boolean}
 */
function hasOpenDirectivePrologue(body) {
  const length = ownArrayLength(body);

  for (let index = 0; index < length; index += 1) {
    const statement = ownDenseArrayElementValue(body, index);
    const expression =
      statement && typeof statement === 'object'
        ? ownDataPropertyValue(statement, 'expression')
        : undefined;
    const directive =
      statement && typeof statement === 'object'
        ? Object.getOwnPropertyDescriptor(statement, 'directive')
        : undefined;

    if (
      !statement ||
      typeof statement !== 'object' ||
      ownDataPropertyValue(statement, 'type') !== 'ExpressionStatement' ||
      !expression ||
      typeof expression !== 'object' ||
      ownDataPropertyValue(expression, 'type') !== 'Literal' ||
      typeof ownDataPropertyValue(expression, 'value') !== 'string' ||
      directive === undefined ||
      !Object.prototype.hasOwnProperty.call(directive, 'value') ||
      typeof (/** @type {PropertyDescriptor} */ (directive).value) !== 'string'
    ) {
      return false;
    }
  }

  return true;
}

/**
 * When a later appended directive activates strict mode, Acorn has only seen
 * the appended source. Recheck the snapshotted directive literals' raw text for
 * the legacy decimal escapes its strict lexer rejects.
 *
 * @param {any[]} body
 * @returns {void}
 */
function checkStrictDirectiveLiterals(body) {
  const length = ownArrayLength(body);

  for (let index = 0; index < length; index += 1) {
    const statement = /** @type {object} */ (
      ownDenseArrayElementValue(body, index)
    );
    const expression = /** @type {object} */ (
      ownDataPropertyValue(statement, 'expression')
    );
    const raw = ownDataPropertyValue(expression, 'raw');

    if (typeof raw !== 'string') {
      throw untrustedAstSyntaxError(
        'Reusable directive literals require raw source text',
      );
    }

    if (hasStrictForbiddenStringEscape(raw)) {
      throw new SyntaxError('Invalid escape sequence in strict directive');
    }
  }
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function hasStrictForbiddenStringEscape(raw) {
  for (let index = 0; index < raw.length; index += 1) {
    if (raw.charCodeAt(index) !== 92) {
      continue;
    }

    const escaped = raw.charCodeAt(index + 1);

    if (
      (escaped >= 49 && escaped <= 57) ||
      (escaped === 48 &&
        raw.charCodeAt(index + 2) >= 48 &&
        raw.charCodeAt(index + 2) <= 57)
    ) {
      return true;
    }

    index += 1;
  }

  return false;
}

/**
 * @param {any[]} target
 * @param {number} index
 * @param {unknown} value
 * @returns {void}
 */
function defineArrayElement(target, index, value) {
  Object.defineProperty(target, String(index), {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {unknown} program
 * @returns {boolean}
 */
function isScriptProgram(program) {
  return (
    !!program &&
    typeof program === 'object' &&
    /** @type {any} */ (program).type === 'Program' &&
    /** @type {any} */ (program).sourceType === 'script' &&
    Array.isArray(/** @type {any} */ (program).body)
  );
}

/**
 * Rejects descriptor and prototype tricks in untrusted parser output before a
 * later shape or early-error helper can read guest-owned syntax state. Every
 * own data property is followed, including non-enumerable and symbol keys, so
 * metadata cannot hide an AST node from the capability boundary. A global
 * visited set intentionally permits a cyclic metadata container; structural
 * child cycles remain the responsibility of `checkAcyclicAstChildren`.
 *
 * @param {unknown} root
 * @returns {void}
 */
function checkUntrustedAstDescriptors(root) {
  /** @type {unknown[]} */
  const pending = [root];
  /** @type {WeakSet<object>} */
  const seen = new WeakSet();

  while (pending.length > 0) {
    const value = pending.pop();

    if (!value || typeof value !== 'object') {
      continue;
    }

    if (seen.has(value)) {
      continue;
    }

    seen.add(value);

    if (
      Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Array.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw untrustedAstSyntaxError(
        'Untrusted AST arrays must not have custom prototypes',
      );
    }

    const keys = Reflect.ownKeys(value);

    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (descriptor === undefined) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw untrustedAstSyntaxError(
          'Untrusted AST properties must be own data properties',
        );
      }

      pending.push(descriptor.value);
    }

    const type = Object.getOwnPropertyDescriptor(value, 'type');

    if (type === undefined) {
      if (hasInheritedAstSyntaxField(value, 'type')) {
        throw untrustedAstSyntaxError(
          'Untrusted AST syntax fields must not be inherited',
        );
      }
      continue;
    }

    if (typeof type.value !== 'string') {
      continue;
    }

    for (const field of UNTRUSTED_AST_SYNTAX_FIELD_NAMES) {
      if (
        field !== 'type' &&
        Object.getOwnPropertyDescriptor(value, field) === undefined &&
        hasInheritedAstSyntaxField(value, field)
      ) {
        throw untrustedAstSyntaxError(
          'Untrusted AST syntax fields must not be inherited',
        );
      }
    }

    checkUntrustedAstSourceLocation(value);
  }
}

/**
 * The parser's positioned-error helpers read `loc.start.line` and
 * `loc.start.column` after the main capability walk. Keep those records
 * descriptor-safe too, without treating unrelated literal values such as a
 * `RegExp` as AST records.
 *
 * @param {object} node
 * @returns {void}
 */
function checkUntrustedAstSourceLocation(node) {
  const loc = Reflect.getOwnPropertyDescriptor(node, 'loc');

  if (
    loc === undefined ||
    !Object.prototype.hasOwnProperty.call(loc, 'value') ||
    !loc.value ||
    typeof loc.value !== 'object'
  ) {
    return;
  }

  for (const endpoint of ['start', 'end']) {
    const position = Reflect.getOwnPropertyDescriptor(loc.value, endpoint);

    if (position === undefined) {
      if (hasInheritedAstSyntaxField(loc.value, endpoint)) {
        throw untrustedAstSyntaxError(
          'Untrusted AST syntax fields must not be inherited',
        );
      }
      continue;
    }

    if (
      !Object.prototype.hasOwnProperty.call(position, 'value') ||
      !position.value ||
      typeof position.value !== 'object'
    ) {
      continue;
    }

    for (const field of ['line', 'column']) {
      if (
        Reflect.getOwnPropertyDescriptor(position.value, field) === undefined &&
        hasInheritedAstSyntaxField(position.value, field)
      ) {
        throw untrustedAstSyntaxError(
          'Untrusted AST syntax fields must not be inherited',
        );
      }
    }
  }
}

/**
 * Checks an object's prototype chain without reading a potentially accessor
 * backed field.
 *
 * @param {object} value
 * @param {string} field
 * @returns {boolean}
 */
function hasInheritedAstSyntaxField(value, field) {
  let prototype = Reflect.getPrototypeOf(value);

  while (prototype !== null) {
    if (Reflect.getOwnPropertyDescriptor(prototype, field) !== undefined) {
      return true;
    }

    prototype = Reflect.getPrototypeOf(prototype);
  }

  return false;
}

/**
 * @param {string} message
 * @returns {SyntaxError}
 */
function untrustedAstSyntaxError(message) {
  return new SyntaxError(message);
}

/**
 * Requires a custom parser's evaluator-relevant child graph to be a tree.
 * Native Acorn output has this shape, while rejecting shared nodes and child
 * arrays at the untrusted boundary prevents later tree-oriented static
 * semantics from expanding a compact DAG exponentially. Metadata is outside
 * `AST_CHILD_PROPERTY_KEYS`, so it may still share or cycle. The explicit
 * worklist avoids recursive host stack use.
 *
 * @param {any} root
 * @returns {void}
 */
function checkStructuralAstTree(root) {
  /** @type {unknown[]} */
  const pending = [root];
  const seen = new WeakSet();

  while (pending.length > 0) {
    const value = pending.pop();

    if (!value || typeof value !== 'object') {
      continue;
    }

    const array = Array.isArray(value);
    const node =
      !array && typeof (/** @type {any} */ (value).type) === 'string';

    if (!array && !node) {
      continue;
    }

    if (seen.has(value)) {
      throw unsupportedEs2015Error(
        'Custom AST must be a structural tree',
        value,
      );
    }

    seen.add(value);

    if (array) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const descriptor = ownArrayElementDescriptor(value, index);

        if (descriptor === undefined) {
          throw unsupportedEs2015Error(
            'AST child arrays must contain own data elements',
            value,
          );
        }

        pending.push(descriptor.value);
      }
      continue;
    }

    const keys = Reflect.ownKeys(value);

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];

      if (typeof key === 'string' && AST_CHILD_PROPERTY_KEYS.has(key)) {
        pending.push(/** @type {any} */ (value)[key]);
      }
    }
  }
}

/**
 * Applies the checks needed only for an untrusted custom parser result. Acorn
 * creates an acyclic ESTree graph with evaluator-consumed edges, so keeping
 * these generic scans off its ordinary output avoids rewalking every source
 * tree while the main syntax and capability gate remains in place below.
 *
 * @param {any} root
 * @returns {void}
 */
function checkCustomAstDefenses(root) {
  checkStructuralAstTree(root);

  /** @type {{ value: unknown, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, nestedArray: boolean, patternContext: 'binding' | 'assignment' | undefined }[]} */
  const pending = [
    {
      value: root,
      parent: null,
      parentKey: undefined,
      parentIndex: undefined,
      nestedArray: false,
      patternContext: undefined,
    },
  ];
  /** @type {WeakMap<object, ValidationContextRecord | Map<any, any>>} */
  const seen = new WeakMap();

  while (pending.length > 0) {
    const item =
      /** @type {{ value: any, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, nestedArray: boolean, patternContext: 'binding' | 'assignment' | undefined }} */ (
        pending.pop()
      );
    const value = item.value;

    if (!value || typeof value !== 'object') {
      continue;
    }

    if (
      rememberValidationContext(
        seen,
        value,
        item.parent,
        item.parentKey,
        item.parentIndex,
        basicValidationContextKey(item.nestedArray, item.patternContext),
      )
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      if (typeof (/** @type {any} */ (value).type) === 'string') {
        throw unsupportedEs2015Error('arrays cannot be AST nodes', value);
      }

      for (let index = value.length - 1; index >= 0; index -= 1) {
        const descriptor = ownArrayElementDescriptor(value, index);

        if (descriptor === undefined) {
          continue;
        }

        const element = descriptor.value;
        const nestedArray = item.nestedArray || Array.isArray(element);

        pending.push({
          value: element,
          parent: nestedArray ? null : item.parent,
          parentKey: nestedArray ? undefined : item.parentKey,
          parentIndex: nestedArray ? undefined : index,
          nestedArray,
          patternContext: item.patternContext,
        });
      }

      const keys = Reflect.ownKeys(value);

      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index];

        if (key === 'length' || isDirectArrayElementKey(key, value.length)) {
          continue;
        }

        pending.push({
          value: /** @type {any} */ (value)[key],
          parent: value,
          parentKey: typeof key === 'string' ? key : undefined,
          parentIndex: undefined,
          nestedArray: item.nestedArray,
          patternContext: item.patternContext,
        });
      }

      continue;
    }

    const keys = Reflect.ownKeys(value);
    const typedNode = typeof value.type === 'string';

    if (typedNode) {
      if (item.nestedArray) {
        throw unsupportedEs2015Error(
          'AST nodes cannot appear in nested arrays',
          value,
        );
      }

      const scalarMessage = validateEvaluatorScalarSyntax(value);

      if (scalarMessage !== undefined) {
        throw unsupportedEs2015Error(scalarMessage, value);
      }

      const childMessage = validateEvaluatorChildEdges(value);

      if (childMessage !== undefined) {
        throw unsupportedEs2015Error(childMessage, value);
      }

      const placementMessage = validateCustomAstNodePlacement(
        value,
        item.parent,
        item.parentKey,
        item.parentIndex,
        item.patternContext,
      );

      if (placementMessage !== undefined) {
        throw unsupportedEs2015Error(placementMessage, value);
      }
    }

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const parentKey = typeof key === 'string' ? key : undefined;

      pending.push({
        value: value[key],
        parent: value,
        parentKey,
        parentIndex: undefined,
        nestedArray: item.nestedArray,
        patternContext:
          typedNode && parentKey !== undefined
            ? patternContextForChild(value, parentKey, item.patternContext)
            : item.patternContext,
      });
    }
  }
}

/**
 * Records one validation context in fixed-depth identity/primitive maps. The
 * outer WeakMap keeps node ownership weak; the nested Maps retain parents only
 * for the duration of the current validation pass. A node's first context stays
 * as one compact record; a second context promotes it to the indexed form, so
 * ordinary trees do not allocate several maps for every uniquely visited node.
 *
 * @typedef {{ parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, primitiveKey: number }} ValidationContextRecord
 *
 * @param {WeakMap<object, ValidationContextRecord | Map<any, any>>} seen
 * @param {object} value
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @param {number} primitiveKey
 * @returns {boolean} Whether the exact context was already present.
 */
function rememberValidationContext(
  seen,
  value,
  parent,
  parentKey,
  parentIndex,
  primitiveKey,
) {
  const contexts = seen.get(value);

  if (contexts === undefined) {
    seen.set(value, { parent, parentKey, parentIndex, primitiveKey });
    return false;
  }

  if (contexts instanceof Map) {
    return rememberMappedValidationContext(
      contexts,
      parent,
      parentKey,
      parentIndex,
      primitiveKey,
    );
  }

  if (
    contexts.parent === parent &&
    contexts.parentKey === parentKey &&
    contexts.parentIndex === parentIndex &&
    contexts.primitiveKey === primitiveKey
  ) {
    return true;
  }

  const byParent = new Map();
  rememberMappedValidationContext(
    byParent,
    contexts.parent,
    contexts.parentKey,
    contexts.parentIndex,
    contexts.primitiveKey,
  );
  rememberMappedValidationContext(
    byParent,
    parent,
    parentKey,
    parentIndex,
    primitiveKey,
  );
  seen.set(value, byParent);
  return false;
}

/**
 * @param {Map<any, any>} byParent
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @param {number} primitiveKey
 * @returns {boolean}
 */
function rememberMappedValidationContext(
  byParent,
  parent,
  parentKey,
  parentIndex,
  primitiveKey,
) {
  let byParentKey = byParent.get(parent);

  if (byParentKey === undefined) {
    byParentKey = new Map();
    byParent.set(parent, byParentKey);
  }

  let byParentIndex = byParentKey.get(parentKey);

  if (byParentIndex === undefined) {
    byParentIndex = new Map();
    byParentKey.set(parentKey, byParentIndex);
  }

  const primitiveKeys = byParentIndex.get(parentIndex);

  if (primitiveKeys === undefined) {
    byParentIndex.set(parentIndex, primitiveKey);
    return false;
  }

  if (typeof primitiveKeys === 'number') {
    if (primitiveKeys === primitiveKey) {
      return true;
    }

    byParentIndex.set(parentIndex, new Set([primitiveKeys, primitiveKey]));
    return false;
  }

  if (/** @type {Set<number>} */ (primitiveKeys).has(primitiveKey)) {
    return true;
  }

  /** @type {Set<number>} */ (primitiveKeys).add(primitiveKey);
  return false;
}

/**
 * A collision-free mixed-radix key for the primitive context dimensions shared
 * by the custom-AST defense walk.
 *
 * @param {boolean} nestedArray
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @returns {number}
 */
function basicValidationContextKey(nestedArray, patternContext) {
  const patternKey =
    patternContext === undefined ? 0 : patternContext === 'binding' ? 1 : 2;
  return patternKey * 2 + (nestedArray ? 1 : 0);
}

/**
 * Extends the basic mixed-radix key with every execution-context dimension
 * carried by the syntax walk.
 *
 * @param {boolean} nestedArray
 * @param {boolean} strict
 * @param {boolean} yieldAllowed
 * @param {boolean} superAllowed
 * @param {boolean} superCallAllowed
 * @param {boolean | undefined} classDerived
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @returns {number}
 */
function syntaxValidationContextKey(
  nestedArray,
  strict,
  yieldAllowed,
  superAllowed,
  superCallAllowed,
  classDerived,
  patternContext,
) {
  const classKey =
    classDerived === undefined ? 0 : classDerived === false ? 1 : 2;
  let key = basicValidationContextKey(nestedArray, patternContext);
  key = key * 2 + (strict ? 1 : 0);
  key = key * 2 + (yieldAllowed ? 1 : 0);
  key = key * 2 + (superAllowed ? 1 : 0);
  key = key * 2 + (superCallAllowed ? 1 : 0);
  return key * 3 + classKey;
}

/**
 * @param {string | symbol} key
 * @param {number} length
 * @returns {boolean}
 */
function isDirectArrayElementKey(key, length) {
  if (typeof key !== 'string') {
    return false;
  }

  const index = Number(key);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

/**
 * Reads an array member through its own descriptor so a sparse array never
 * falls through to a numeric property on `Array.prototype`.
 *
 * @param {any[]} value
 * @param {number} index
 * @returns {PropertyDescriptor | undefined}
 */
function ownArrayElementDescriptor(value, index) {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

  if (
    descriptor !== undefined &&
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    throw untrustedAstSyntaxError(
      'Untrusted AST array elements must be own data properties',
    );
  }

  return descriptor;
}

/**
 * @param {any[]} value
 * @param {number} index
 * @returns {unknown}
 */
function ownDenseArrayElementValue(value, index) {
  const descriptor = ownArrayElementDescriptor(value, index);

  if (descriptor === undefined) {
    throw untrustedAstSyntaxError(
      'AST child arrays must contain own data elements',
    );
  }

  return descriptor.value;
}

/**
 * The five statement forms whose ES5.1 grammar body is a single `Statement`
 * and therefore cannot be a `FunctionDeclaration`.
 *
 * A `Map` rather than an object literal so a node whose `type` happens to
 * name an `Object.prototype` member (`constructor`, `toString`) cannot be
 * mistaken for one of these parents.
 *
 * @type {ReadonlyMap<string, string>}
 */
const STATEMENT_BODY_PARENT_LABELS = new Map([
  ['WithStatement', 'with statement'],
  ['WhileStatement', 'while statement'],
  ['DoWhileStatement', 'do-while statement'],
  ['ForStatement', 'for statement'],
  ['ForInStatement', 'for-in statement'],
  ['ForOfStatement', 'for-of statement'],
]);

/**
 * The ES2015 node types the engine parses (because `ecmaVersion: 6` makes
 * Acorn accept them and run its own lexical-scope analysis) but does not yet
 * evaluate, mapped to the guest `SyntaxError` message that names the construct.
 *
 * Raising `PARSER_OPTIONS.ecmaVersion` to 6 is what enables `let`/`const`,
 * block scope, and their static early errors — the scope of this milestone —
 * but it also makes Acorn accept every *other* ES2015 grammar addition. None of
 * those are implemented, and silently parsing a `class` or an arrow function
 * that the evaluator then mishandles would be worse than refusing it, so this
 * pass — reached from `checkStatementPositionFunctionDeclarations`, which both
 * `parseScript` and `parseEval` funnel through — rejects each as a parse-time
 * early error, exactly the way the statement-position and regexp passes beside
 * it already do. `src/evaluator/eval.js` and `src/evaluator/dynamic-function.js`
 * convert the host `SyntaxError` into a realm-local guest one.
 *
 * A `Map` rather than an object literal for the same reason
 * `STATEMENT_BODY_PARENT_LABELS` gives: a node whose `type` names an
 * `Object.prototype` member (`constructor`, `toString`, `valueOf`) must not be
 * mistaken for an entry. `MethodDefinition`'s presence here makes that concrete
 * — a bare-object literal keyed by node type would answer `has('constructor')`
 * for every node.
 *
 * The three ES2015 additions that are not a distinct node type — a `Property`
 * that is computed/shorthand/method, a generator/async `Function*`, and a
 * binary/octal or code-point-escape `Literal` — are handled by
 * `checkUnsupportedEs2015Node` directly, since they turn on a flag rather than
 * on `node.type`.
 *
 * Each entry is one of three kinds, by *why* it fires (or does not). This was
 * established empirically: for every entry, a `sourceType: 'script'`,
 * `ecmaVersion: 6` snippet that would produce the node was parsed against the
 * vendored Acorn and the resulting AST inspected for the node type; the walk's
 * parent-first order (see `checkStatementPositionFunctionDeclarations`) then
 * determines which ancestor, if any, this pass rejects first.
 *
 * *Reachable* — this pass is what rejects the construct, because the node is the
 * first unsupported one the walk visits on some accepted parse:
 * `ObjectPattern`, `ArrayPattern`,
 * `AssignmentPattern`, `RestElement`, and
 * `MetaProperty` (via `new.target` inside a function). `SpreadElement` is
 * handled shape-sensitively by `unsupportedEs2015Message`, because array
 * elements and call/construction argument lists are implemented while all
 * other placements remain unsupported.
 *
 * *Parent-blocked* — the node genuinely appears in ASTs Acorn produces, but the
 * walk always rejects an ancestor first, so this entry never fires on its own.
 * These are defence-in-depth: were the walk order or a parent's flag ever to
 * change, the node would still be refused rather than silently evaluated.
 * Template literals, elements, and tagged-template expressions are supported,
 * but their dedicated validators still require the exact ESTree parent,
 * quasi/expression count, raw/cooked value, and tail shapes before evaluator
 * dispatch can reach them.
 *
 * `Super` is deliberately absent from the table: object-literal methods and
 * accessors both carry a `[[HomeObject]]`, so their `super` property references
 * are implemented (see `src/runtime/super-reference.js`). A concise method is a
 * `Property` with `method: true`; an accessor has `kind: 'get'`/`'set'` and
 * `method: false`. `super` outside either context is a parse error Acorn raises
 * itself.
 *
 * *Acorn-blocked* — the parser refuses the source before any such node exists,
 * so this pass never sees it. Kept so a later `sourceType`/`ecmaVersion` change
 * cannot let one slip through silently.
 * - `AwaitExpression` is an ES2017 feature; at `ecmaVersion: 6` `await x` and
 *   `async function`/`async () =>` are parse errors Acorn raises itself, and the
 *   `async` flag is never set (see the flag check in `checkUnsupportedEs2015Node`).
 * - `ImportDeclaration` / `ExportNamedDeclaration` / `ExportDefaultDeclaration` /
 *   `ExportAllDeclaration` require `sourceType: 'module'`; in a script Acorn
 *   rejects them itself ("'import' and 'export' may appear only with
 *   'sourceType: module'"). `ImportExpression` (dynamic `import()`) is likewise
 *   rejected in a script at `ecmaVersion: 6` — it only becomes a script node at
 *   `ecmaVersion: 11`.
 *
 * @type {ReadonlyMap<string, string>}
 */
const UNSUPPORTED_ES2015_NODE_MESSAGES = new Map([
  ['AwaitExpression', '`await` expressions are not supported'],
  ['ObjectPattern', 'destructuring patterns are not supported'],
  ['ArrayPattern', 'destructuring patterns are not supported'],
  ['AssignmentPattern', 'default value patterns are not supported'],
  ['RestElement', 'rest elements are not supported'],
  ['MetaProperty', '`new.target` is not supported'],
  ['ImportDeclaration', 'import declarations are not supported'],
  ['ImportExpression', 'dynamic `import` is not supported'],
  ['ExportNamedDeclaration', 'export declarations are not supported'],
  ['ExportDefaultDeclaration', 'export declarations are not supported'],
  ['ExportAllDeclaration', 'export declarations are not supported'],
]);

/**
 * Every expression node the evaluator dispatches. The parser keeps this
 * capability boundary explicit because custom parser hooks can attach a
 * recognized expression-shaped object to arbitrary metadata fields.
 *
 * @type {ReadonlySet<string>}
 */
const SUPPORTED_EXPRESSION_TYPES = new Set([
  'Literal',
  'Identifier',
  'ThisExpression',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'CallExpression',
  'MemberExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'SequenceExpression',
  'TemplateLiteral',
  'TaggedTemplateExpression',
  'YieldExpression',
]);

/**
 * Every statement node the evaluator dispatches. Kept beside the expression
 * capability table so custom parser output can be checked against the same
 * statement/expression boundary before evaluation reaches an internal
 * dispatcher.
 *
 * @type {ReadonlySet<string>}
 */
const SUPPORTED_STATEMENT_TYPES = new Set([
  'ExpressionStatement',
  'EmptyStatement',
  'BlockStatement',
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'BreakStatement',
  'ContinueStatement',
  'ReturnStatement',
  'ThrowStatement',
  'TryStatement',
  'SwitchStatement',
  'LabeledStatement',
  'DebuggerStatement',
  'WithStatement',
]);

const UNSUPPORTED_CLASS_DEFINITION_FIELDS = [
  'decorators',
  'typeParameters',
  'typeArguments',
  'superTypeParameters',
  'superTypeArguments',
  'implements',
  'abstract',
  'declare',
];

const UNSUPPORTED_CLASS_METHOD_FIELDS = [
  'decorators',
  'accessibility',
  'abstract',
  'declare',
  'definite',
  'optional',
  'override',
  'readonly',
  'returnType',
  'typeParameters',
  'typeArguments',
  'variance',
];

const UNSUPPORTED_CLASS_METHOD_FUNCTION_FIELDS = [
  'decorators',
  'typeParameters',
  'typeArguments',
  'returnType',
  'predicate',
  'declare',
];

/**
 * Every AST node type this parser capability boundary recognizes. The direct
 * statement and expression types match the evaluator dispatch tables; the
 * remaining structural nodes are consumed by the evaluator or parser's
 * context-sensitive gates. Explicitly blocked ES2015 types stay recognized so
 * their dedicated early-error messages remain reachable.
 *
 * Objects without a string `type` are metadata rather than AST nodes and are
 * intentionally skipped by the iterative walk below.
 *
 * @type {ReadonlySet<string>}
 */
const RECOGNIZED_AST_NODE_TYPES = new Set([
  'Program',
  'ExpressionStatement',
  'EmptyStatement',
  'BlockStatement',
  'VariableDeclaration',
  'FunctionDeclaration',
  'IfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'BreakStatement',
  'ContinueStatement',
  'ReturnStatement',
  'ThrowStatement',
  'TryStatement',
  'SwitchStatement',
  'LabeledStatement',
  'DebuggerStatement',
  'WithStatement',
  'Literal',
  'Identifier',
  'ThisExpression',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'CallExpression',
  'MemberExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'ClassBody',
  'MethodDefinition',
  'ObjectExpression',
  'ArrayExpression',
  'NewExpression',
  'SequenceExpression',
  'VariableDeclarator',
  'SwitchCase',
  'CatchClause',
  'Property',
  'Super',
  'SpreadElement',
  'TemplateLiteral',
  'TemplateElement',
  'TaggedTemplateExpression',
  'YieldExpression',
  ...UNSUPPORTED_ES2015_NODE_MESSAGES.keys(),
]);

/**
 * The ESTree fields that can recursively contain evaluator-relevant AST nodes
 * or their direct child lists. Metadata stays outside this boundary: it is
 * still inspected by the main capability walk for hidden AST nodes, but a
 * self-referential metadata record cannot make a well-formed syntax tree
 * cyclic.
 *
 * @type {ReadonlySet<string>}
 */
const AST_CHILD_PROPERTY_KEYS = new Set([
  'alternate',
  'argument',
  'arguments',
  'block',
  'body',
  'callee',
  'cases',
  'consequent',
  'declarations',
  'discriminant',
  'elements',
  'expression',
  'expressions',
  'finalizer',
  'handler',
  'id',
  'init',
  'key',
  'label',
  'left',
  'object',
  'param',
  'params',
  'properties',
  'property',
  'quasi',
  'quasis',
  'right',
  'superClass',
  'tag',
  'test',
  'update',
  'value',
]);

/**
 * Own fields that can affect parsing or evaluation when attached to a typed
 * ESTree node. Untrusted nodes may omit fields that their individual shape
 * allows, but cannot source one from a prototype.
 *
 * @type {ReadonlySet<string>}
 */
const UNTRUSTED_AST_SYNTAX_FIELD_NAMES = new Set([
  ...AST_CHILD_PROPERTY_KEYS,
  'type',
  'sourceType',
  'directive',
  'kind',
  'name',
  'operator',
  'prefix',
  'computed',
  'optional',
  'generator',
  'async',
  'expression',
  'method',
  'shorthand',
  'static',
  'await',
  'delegate',
  'raw',
  'regex',
  'tail',
  'bigint',
  'start',
  'end',
  'line',
  'column',
  'loc',
  'range',
  ...UNSUPPORTED_CLASS_DEFINITION_FIELDS,
  ...UNSUPPORTED_CLASS_METHOD_FIELDS,
  ...UNSUPPORTED_CLASS_METHOD_FUNCTION_FIELDS,
]);

const SUPPORTED_UNARY_OPERATORS = new Set([
  'delete',
  'typeof',
  'void',
  '!',
  '-',
  '+',
  '~',
]);

const SUPPORTED_BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  '<<',
  '>>',
  '>>>',
  '&',
  '^',
  '|',
  'in',
  'instanceof',
]);

const SUPPORTED_LOGICAL_OPERATORS = new Set(['&&', '||']);

const SUPPORTED_ASSIGNMENT_OPERATORS = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '^=',
  '|=',
]);

const SUPPORTED_UPDATE_OPERATORS = new Set(['++', '--']);

const SUPPORTED_VARIABLE_DECLARATION_KINDS = new Set(['var', 'let', 'const']);

/**
 * Untrusted AST scalar syntax is capability-gated here rather than delegated to
 * evaluator switches. Every evaluator-recognized node has an explicit entry;
 * entries with no scalar state use the shared no-op validator.
 *
 * @type {ReadonlyMap<string, (node: any) => string | undefined>}
 */
const UNTRUSTED_AST_SCALAR_VALIDATORS = new Map([
  ['Program', validateProgramScalarSyntax],
  ['ExpressionStatement', validateExpressionStatementScalarSyntax],
  ['EmptyStatement', validateNoScalarSyntax],
  ['BlockStatement', validateNoScalarSyntax],
  ['VariableDeclaration', validateVariableDeclarationScalarSyntax],
  ['FunctionDeclaration', validateFunctionScalarSyntax],
  ['ClassDeclaration', validateNoScalarSyntax],
  ['IfStatement', validateNoScalarSyntax],
  ['WhileStatement', validateNoScalarSyntax],
  ['DoWhileStatement', validateNoScalarSyntax],
  ['ForStatement', validateNoScalarSyntax],
  ['ForInStatement', validateNoScalarSyntax],
  ['ForOfStatement', validateForOfScalarSyntax],
  ['BreakStatement', validateNoScalarSyntax],
  ['ContinueStatement', validateNoScalarSyntax],
  ['ReturnStatement', validateNoScalarSyntax],
  ['ThrowStatement', validateNoScalarSyntax],
  ['TryStatement', validateNoScalarSyntax],
  ['SwitchStatement', validateNoScalarSyntax],
  ['LabeledStatement', validateNoScalarSyntax],
  ['DebuggerStatement', validateNoScalarSyntax],
  ['WithStatement', validateNoScalarSyntax],
  ['Literal', validateLiteralScalarSyntax],
  ['Identifier', validateIdentifierScalarSyntax],
  ['ThisExpression', validateNoScalarSyntax],
  ['UnaryExpression', validateUnaryScalarSyntax],
  ['BinaryExpression', validateBinaryScalarSyntax],
  ['LogicalExpression', validateLogicalScalarSyntax],
  ['ConditionalExpression', validateNoScalarSyntax],
  ['AssignmentExpression', validateAssignmentScalarSyntax],
  ['UpdateExpression', validateUpdateScalarSyntax],
  ['CallExpression', validateCallScalarSyntax],
  ['MemberExpression', validateMemberScalarSyntax],
  ['FunctionExpression', validateFunctionScalarSyntax],
  ['ArrowFunctionExpression', validateArrowScalarSyntax],
  ['ClassExpression', validateNoScalarSyntax],
  ['ClassBody', validateNoScalarSyntax],
  ['MethodDefinition', validateMethodDefinitionScalarSyntax],
  ['ObjectExpression', validateNoScalarSyntax],
  ['ArrayExpression', validateNoScalarSyntax],
  ['NewExpression', validateNoScalarSyntax],
  ['SequenceExpression', validateNoScalarSyntax],
  ['VariableDeclarator', validateNoScalarSyntax],
  ['SwitchCase', validateNoScalarSyntax],
  ['CatchClause', validateNoScalarSyntax],
  ['Property', validatePropertyScalarSyntax],
  ['Super', validateNoScalarSyntax],
  ['SpreadElement', validateNoScalarSyntax],
  ['TemplateLiteral', validateNoScalarSyntax],
  ['TemplateElement', validateTemplateElementScalarSyntax],
  ['TaggedTemplateExpression', validateNoScalarSyntax],
  ['YieldExpression', validateYieldScalarSyntax],
  ['AwaitExpression', validateNoScalarSyntax],
  ['ObjectPattern', validateNoScalarSyntax],
  ['ArrayPattern', validateNoScalarSyntax],
  ['AssignmentPattern', validateNoScalarSyntax],
  ['RestElement', validateNoScalarSyntax],
  ['MetaProperty', validateNoScalarSyntax],
  ['ImportDeclaration', validateNoScalarSyntax],
  ['ImportExpression', validateNoScalarSyntax],
  ['ExportNamedDeclaration', validateNoScalarSyntax],
  ['ExportDefaultDeclaration', validateNoScalarSyntax],
  ['ExportAllDeclaration', validateNoScalarSyntax],
]);

/**
 * Property keys that hold source-position metadata rather than child nodes.
 * Trusted Acorn output is walked only through its AST proper; the custom-parser
 * defensive phase above is responsible for inspecting arbitrary metadata.
 *
 * @type {ReadonlySet<string>}
 */
const NODE_POSITION_KEYS = new Set(['loc', 'range', 'start', 'end']);

/**
 * Rejects a `FunctionDeclaration` that sits in a statement position the ES5.1
 * grammar (with Annex B) forbids, as a parse-time early error.
 *
 * A `FunctionDeclaration` is a `SourceElement`, not a `Statement` (§12, §14),
 * so the single-`Statement` body of an iteration statement (§12.6), a `with`
 * (§12.10), an `if` branch, or a labelled statement cannot be one. Acorn
 * parses a function declaration in all of these positions anyway (it accepts
 * the Annex B web-reality forms uniformly), so this pass — reached from
 * `validateScriptProgram`, which both `parseScript` and `parseEval` funnel
 * through — is what makes scripts, direct `eval`, and the dynamic `Function`
 * constructor refuse them, matching JavaScriptCore and the `phase: parse`
 * upstream tests. Without it the evaluator would also spin forever on
 * `for (;;) function f(){}`.
 *
 * The exact rule, which is strictness-sensitive:
 *
 * - Iteration and `with` bodies: never a function declaration, in any mode —
 *   there is no Annex B tolerance for them. A surrounding label chain
 *   (`with (o) a: b: function f(){}`) does not help.
 * - `if` branch: reject a function declaration in every mode. Annex B B.3.4
 *   specifies sloppy-mode semantics for the bare form
 *   (`if (1) function f(){}`), but the evaluator does not implement those
 *   semantics yet, so accepting it would silently mis-scope the declaration.
 * - Labelled statement body: Annex B B.3.2 tolerates a function declaration as
 *   a statement-list-level labelled body (`l: function f(){}`) in sloppy code;
 *   strict code forbids it. A labelled body that is itself an illegal position
 *   is already rejected by the enclosing loop/`with`/`if` rule above.
 *
 * Strictness is a property of the nearest function scope, not of the whole
 * program (§10.1.1): a strict function may nest in a sloppy script and vice
 * versa. The walk therefore carries the strictness of each node's enclosing
 * function (or program) scope, folding in each `FunctionDeclaration` /
 * `FunctionExpression` / block-body arrow bodies' — and the `Program`'s — own directive prologue
 * on top of the inherited flag, plus the caller-supplied `rootStrict` that a
 * strict `eval` inherits with no directive.
 *
 * The walk is an explicit worklist rather than recursion: Acorn parses a
 * member chain iteratively and so accepts input far deeper than a recursive
 * walk survives, and a recursive walk here would turn valid deep programs
 * into a host `RangeError` escaping through `eval`. The visited set also
 * makes a cyclic tree — which the `parse` hook could hand us — terminate.
 *
 * @param {any} root
 * @param {string} source The exact text parsed, for the code-point-escape check.
 * @param {boolean} rootStrict
 * @param {WeakSet<object>} [sourceIndependentNodes]
 * @param {{ superAllowed: boolean, superCallAllowed: boolean }} [rootContext]
 * @returns {void}
 */
function checkStatementPositionFunctionDeclarations(
  root,
  source,
  rootStrict,
  allOwnKeys = false,
  sourceIndependentNodes,
  rootContext = { superAllowed: false, superCallAllowed: false },
) {
  /** @type {{ node: any, strict: boolean, yieldAllowed: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, nestedArray: boolean, patternContext: 'binding' | 'assignment' | undefined }[]} */
  const pending = [
    {
      node: root,
      strict: rootStrict,
      yieldAllowed: false,
      superAllowed: rootContext.superAllowed,
      superCallAllowed: rootContext.superCallAllowed,
      classDerived: undefined,
      parent: null,
      parentKey: undefined,
      parentIndex: undefined,
      nestedArray: false,
      patternContext: undefined,
    },
  ];
  /** @type {WeakMap<object, ValidationContextRecord | Map<any, any>>} */
  const seen = new WeakMap();

  while (pending.length > 0) {
    const item =
      /** @type {{ node: any, strict: boolean, yieldAllowed: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, nestedArray: boolean, patternContext: 'binding' | 'assignment' | undefined }} */ (
        pending.pop()
      );
    const node = item.node;
    const strict = item.strict;

    if (!node || typeof node !== 'object') {
      continue;
    }

    if (
      rememberValidationContext(
        seen,
        node,
        item.parent,
        item.parentKey,
        item.parentIndex,
        syntaxValidationContextKey(
          item.nestedArray,
          strict,
          item.yieldAllowed,
          item.superAllowed,
          item.superCallAllowed,
          item.classDerived,
          item.patternContext,
        ),
      )
    ) {
      continue;
    }

    if (Array.isArray(node)) {
      const arrayType = /** @type {any} */ (node).type;

      if (typeof arrayType === 'string') {
        throw unsupportedEs2015Error('arrays cannot be AST nodes', node);
      }

      if (
        !item.nestedArray &&
        (item.parentIndex !== undefined ||
          !item.parent ||
          typeof item.parentKey !== 'string' ||
          item.parent[item.parentKey] !== node)
      ) {
        throw unsupportedEs2015Error(
          'AST child arrays must be direct property values',
          node,
        );
      }

      for (let index = node.length - 1; index >= 0; index -= 1) {
        const descriptor = ownArrayElementDescriptor(node, index);

        if (descriptor === undefined) {
          continue;
        }

        const element = descriptor.value;
        const nestedArray = item.nestedArray || Array.isArray(element);

        pushChild(
          pending,
          element,
          strict,
          item.yieldAllowed,
          item.superAllowed,
          item.superCallAllowed,
          item.classDerived,
          nestedArray ? null : item.parent,
          nestedArray ? undefined : item.parentKey,
          item.patternContext,
          nestedArray ? undefined : index,
          nestedArray,
        );
      }
      continue;
    }

    if (typeof node.type !== 'string') {
      continue;
    }

    if (item.nestedArray) {
      throw unsupportedEs2015Error(
        'AST nodes cannot appear in nested arrays',
        node,
      );
    }

    checkFunctionDeclarationPosition(node, strict);
    checkStrictWithStatement(node, strict);
    checkRegularExpressionLiteral(node);
    checkUnsupportedEs2015Node(
      node,
      source,
      item.parent,
      item.parentKey,
      item.patternContext,
      item.parentIndex,
      item.yieldAllowed,
      item.superAllowed,
      item.superCallAllowed,
      sourceIndependentNodes === undefined || !sourceIndependentNodes.has(node),
    );
    checkUnsupportedForOfAwait(node);

    checkStrictBindingIdentifier(
      node,
      item.parent,
      item.parentKey,
      item.patternContext,
      strict,
    );
    checkFunctionParameterEarlyErrors(node, strict);

    const childStrict = childScopeStrictness(node, strict);
    const childSuperAllowed = superAllowedForChildren(
      node,
      item.parent,
      item.parentKey,
      item.superAllowed,
    );
    const childSuperCallAllowed = superCallAllowedForChildren(
      node,
      item.parent,
      item.parentKey,
      item.superCallAllowed,
      item.classDerived,
    );
    const keys = allOwnKeys ? Reflect.ownKeys(node) : Object.keys(node);

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const parentKey = typeof key === 'string' ? key : undefined;

      if (typeof key !== 'string' || !NODE_POSITION_KEYS.has(key)) {
        pushChild(
          pending,
          node[key],
          childStrict,
          yieldAllowedForChild(node, parentKey, item.yieldAllowed),
          childSuperAllowed,
          childSuperCallAllowed,
          parentKey === undefined
            ? item.classDerived
            : classDerivedForChild(node, parentKey, item.classDerived),
          node,
          parentKey,
          parentKey === undefined
            ? item.patternContext
            : patternContextForChild(node, parentKey, item.patternContext),
        );
      }
    }
  }
}

/**
 * Applies the ES2015 early errors Acorn 8 does not enforce when parsing with
 * `ecmaVersion: 6`: a non-simple list cannot contain duplicate bound names, and
 * its function body cannot contain a "use strict" directive.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {void}
 */
function checkFunctionParameterEarlyErrors(node, strict) {
  if (!isFunctionNode(node)) {
    return;
  }

  const simple = /** @type {any[]} */ (node.params).every(
    (parameter) => parameter.type === 'Identifier',
  );
  const ownStrict =
    node.body?.type === 'BlockStatement' &&
    Array.isArray(node.body.body) &&
    hasUseStrictDirective(node.body.body);
  const effectiveStrict = strict || ownStrict;

  if (simple && !effectiveStrict && node.type !== 'ArrowFunctionExpression') {
    return;
  }

  if (!simple && ownStrict) {
    throw unsupportedEs2015Error(
      'Illegal "use strict" directive in function with non-simple parameter list',
      node,
    );
  }

  let summary;

  try {
    summary = summarizeBoundNames(node.params);
  } catch (error) {
    if (error instanceof UnsupportedNodeError) {
      // The shape-aware capability walk will reject this parameter with a
      // positioned SyntaxError when it visits the unsupported child.
      return;
    }

    throw error;
  }

  if (summary.duplicate) {
    throw unsupportedEs2015Error(
      'Duplicate parameter name not allowed in this context',
      node,
    );
  }
}

/**
 * The host parser catches these for source text, but a custom parser hook can
 * hand the evaluator an otherwise plausible strict class method tree. Keep the
 * capability boundary equally strict for those ASTs.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {boolean} strict
 * @returns {void}
 */
function checkStrictBindingIdentifier(
  node,
  parent,
  parentKey,
  patternContext,
  strict,
) {
  if (
    !isIdentifierNode(node) ||
    (node.name !== 'eval' && node.name !== 'arguments')
  ) {
    return;
  }

  const functionName =
    (parent?.type === 'FunctionDeclaration' ||
      parent?.type === 'FunctionExpression') &&
    parentKey === 'id';
  const className =
    (parent?.type === 'ClassDeclaration' ||
      parent?.type === 'ClassExpression') &&
    parentKey === 'id';
  const catchParameter =
    parent?.type === 'CatchClause' && parentKey === 'param';

  if (!strict && !className) {
    return;
  }

  if (
    patternContext === 'binding' ||
    functionName ||
    className ||
    catchParameter
  ) {
    throw unsupportedEs2015Error(`Binding ${node.name} in strict mode`, node);
  }
}

/**
 * The strictness that the children of `node` execute under. Strictness only
 * ever widens inward: once a scope is strict every nested scope is, and a
 * function or program body may additionally turn strict via its own directive
 * prologue. Non-scope nodes just pass the inherited flag through.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {boolean}
 */
function childScopeStrictness(node, strict) {
  if (strict) {
    return true;
  }

  if (
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression' ||
    node.type === 'ClassBody'
  ) {
    return true;
  }

  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    (node.type === 'ArrowFunctionExpression' &&
      node.body?.type === 'BlockStatement')
  ) {
    const body = node.body;

    return (
      !!body && Array.isArray(body.body) && hasUseStrictDirective(body.body)
    );
  }

  if (node.type === 'Program') {
    return Array.isArray(node.body) && hasUseStrictDirective(node.body);
  }

  return false;
}

/**
 * Acorn rejects source-text `with` statements while parsing strict code. Apply
 * the same early error when a custom parser supplies an otherwise valid tree.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {void}
 */
function checkStrictWithStatement(node, strict) {
  if (strict && node.type === 'WithStatement') {
    throw unsupportedEs2015Error("'with' in strict mode", node);
  }
}

/**
 * `super` is lexically available only in an object literal method/accessor and
 * in arrows nested within that method's execution scope. A nested ordinary
 * function starts a fresh super boundary.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {boolean} inherited
 * @returns {boolean}
 */
function superAllowedForChildren(node, parent, parentKey, inherited) {
  if (node.type === 'ArrowFunctionExpression') {
    return inherited;
  }

  if (node.type === 'FunctionDeclaration') {
    return false;
  }

  if (node.type !== 'FunctionExpression') {
    return inherited;
  }

  return (
    (parent?.type === 'Property' &&
      parentKey === 'value' &&
      isObjectLiteralFunction(node) &&
      (parent.method === true ||
        parent.kind === 'get' ||
        parent.kind === 'set')) ||
    (parent?.type === 'MethodDefinition' &&
      parentKey === 'value' &&
      isClassMethodFunction(parent, node))
  );
}

/**
 * `super(...)` is narrower than super-property access: only a derived class
 * constructor, and arrows nested lexically within it, can make a direct super
 * call. Every ordinary nested function starts a new boundary.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {boolean} inherited
 * @param {boolean | undefined} classDerived
 * @returns {boolean}
 */
function superCallAllowedForChildren(
  node,
  parent,
  parentKey,
  inherited,
  classDerived,
) {
  if (node.type === 'ArrowFunctionExpression') {
    return inherited;
  }

  if (node.type === 'FunctionDeclaration') {
    return false;
  }

  if (node.type !== 'FunctionExpression') {
    return inherited;
  }

  return (
    classDerived === true &&
    parent?.type === 'MethodDefinition' &&
    parentKey === 'value' &&
    isClassConstructorDefinition(parent, node)
  );
}

/**
 * @param {any} node
 * @param {string} key
 * @param {boolean | undefined} inherited
 * @returns {boolean | undefined}
 */
function classDerivedForChild(node, key, inherited) {
  if (
    (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') &&
    key === 'body'
  ) {
    return node.superClass !== null;
  }

  return inherited;
}

/**
 * Applies the statement-position early error to `node` given the strictness of
 * the scope it sits in, throwing on the first offending function declaration.
 *
 * @param {any} node
 * @param {boolean} strict
 * @returns {void}
 */
function checkFunctionDeclarationPosition(node, strict) {
  const parentLabel = STATEMENT_BODY_PARENT_LABELS.get(node.type);

  if (parentLabel !== undefined) {
    const offending = resolveBodyFunctionDeclaration(node.body);

    if (offending) {
      throw statementPositionFunctionError(
        `the body of a ${parentLabel}`,
        offending.fn,
      );
    }

    return;
  }

  if (node.type === 'IfStatement') {
    for (const branch of [node.consequent, node.alternate]) {
      const offending = resolveBodyFunctionDeclaration(branch);

      if (offending) {
        throw statementPositionFunctionError(
          'an if statement branch',
          offending.fn,
        );
      }
    }

    return;
  }

  if (node.type === 'LabeledStatement' && strict) {
    const offending = resolveBodyFunctionDeclaration(node);

    if (offending) {
      throw statementPositionFunctionError(
        'the body of a labelled statement',
        offending.fn,
      );
    }
  }
}

/**
 * Queues one candidate child, carrying the strictness of the scope it belongs
 * to. Children are pushed in reverse so popping visits them in source order,
 * which makes the first offending declaration in the program the one reported.
 *
 * @param {{ node: any, strict: boolean, yieldAllowed: boolean, superAllowed: boolean, superCallAllowed: boolean, classDerived: boolean | undefined, parent: any, parentKey: string | number | undefined, parentIndex: number | undefined, nestedArray: boolean, patternContext: 'binding' | 'assignment' | undefined }[]} pending
 * @param {unknown} value
 * @param {boolean} strict
 * @param {boolean} yieldAllowed
 * @param {boolean} superAllowed
 * @param {boolean} superCallAllowed
 * @param {boolean | undefined} classDerived
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {number | undefined} [parentIndex]
 * @param {boolean} [nestedArray=false]
 * @returns {void}
 */
function pushChild(
  pending,
  value,
  strict,
  yieldAllowed,
  superAllowed,
  superCallAllowed,
  classDerived,
  parent,
  parentKey,
  patternContext,
  parentIndex,
  nestedArray = false,
) {
  if (value && typeof value === 'object') {
    pending.push({
      node: value,
      strict,
      yieldAllowed,
      superAllowed,
      superCallAllowed,
      classDerived,
      parent,
      parentKey,
      parentIndex,
      nestedArray,
      patternContext,
    });
  }
}

/**
 * Yield is scoped to the currently entered synchronous generator body. A
 * nested function-like node replaces rather than inherits that context, while
 * computed class and object names remain part of their enclosing execution.
 *
 * @param {any} parent
 * @param {string | undefined} key
 * @param {boolean} inherited
 * @returns {boolean}
 */
function yieldAllowedForChild(parent, key, inherited) {
  if (!isFunctionNode(parent)) {
    return inherited;
  }

  return key === 'body' && parent.generator === true && parent.async !== true;
}

/**
 * @param {any} parent
 * @param {string} key
 * @param {'binding' | 'assignment' | undefined} inherited
 * @returns {'binding' | 'assignment' | undefined}
 */
function patternContextForChild(parent, key, inherited) {
  if (parent.type === 'VariableDeclarator' && key === 'id') {
    return 'binding';
  }

  if (isFunctionNode(parent) && key === 'params') {
    return 'binding';
  }

  if (
    parent.type === 'AssignmentExpression' &&
    parent.operator === '=' &&
    key === 'left'
  ) {
    return 'assignment';
  }

  if (
    (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') &&
    key === 'left' &&
    parent.left.type !== 'VariableDeclaration'
  ) {
    return 'assignment';
  }

  if (parent.type === 'ArrayPattern' && key === 'elements') {
    return inherited;
  }

  if (parent.type === 'ObjectPattern' && key === 'properties') {
    return inherited;
  }

  if (parent.type === 'Property') {
    return key === 'value' ? inherited : undefined;
  }

  if (
    (parent.type === 'AssignmentPattern' && key === 'left') ||
    (parent.type === 'RestElement' && key === 'argument')
  ) {
    return inherited;
  }

  return undefined;
}

/**
 * Resolves the `FunctionDeclaration` a body `Statement` reduces to after
 * peeling any surrounding label chain, reporting whether such a chain was
 * present. A labelled statement's body is itself a `Statement`, so
 * `a: b: function f(){}` reduces to the function declaration with
 * `labeled: true`. Returns `undefined` when the body is an ordinary statement.
 *
 * The visited set guards against a cyclic label chain, which a custom `parse`
 * hook could hand us.
 *
 * @param {any} statement
 * @returns {{ fn: any, labeled: boolean } | undefined}
 */
function resolveBodyFunctionDeclaration(statement) {
  let current = statement;
  let labeled = false;
  /** @type {WeakSet<object>} */
  const visited = new WeakSet();

  while (current && current.type === 'LabeledStatement') {
    if (visited.has(current)) {
      return undefined;
    }

    visited.add(current);
    labeled = true;
    current = current.body;
  }

  return current && current.type === 'FunctionDeclaration'
    ? { fn: current, labeled }
    : undefined;
}

/**
 * Builds the guest-facing `SyntaxError` for a rejected statement-position
 * function declaration, carrying the offending node's position through
 * `normalizeSyntaxError` so it reads like any other parse error.
 *
 * @param {string} context
 * @param {any} node
 * @returns {SyntaxError}
 */
function statementPositionFunctionError(context, node) {
  return normalizeSyntaxError({
    message: `Function declarations cannot appear as ${context}`,
    pos: typeof node.start === 'number' ? node.start : undefined,
    loc: node.loc ? node.loc.start : undefined,
  });
}

/**
 * Rejects an ES2015 construct the parser now accepts (because it runs at
 * `ecmaVersion: 6`) but the evaluator does not yet implement, as a parse-time
 * early error. See `UNSUPPORTED_ES2015_NODE_MESSAGES` for the rationale and the
 * full node-type table; this function adds the three cases that turn on a flag
 * rather than a distinct `node.type`:
 *
 * - a `Property` whose shape is not one of the object-literal forms this
 *   milestone evaluates;
 * - a `FunctionDeclaration` / `FunctionExpression` that is a `generator`
 *   (`function* g(){}`) or `async`;
 * - a numeric `Literal` written in the ES2015 binary (`0b`) or octal (`0o`)
 *   forms, and any string `Literal` or `Identifier` carrying an ES2015
 *   code-point escape (`\u{...}`).
 *
 * The code-point escape is detected on `Literal.raw` for a string literal
 * (Acorn's verbatim source text of the literal) and, for an `Identifier`, on
 * the raw source span `source.slice(node.start, node.end)` — the interpreted
 * `name` no longer contains the backslash sequence, so the source is the only
 * place the escape survives, exactly as the former `checkUnreserved` plugin
 * compared the span to the name. A custom `parse` hook can hand us a node whose
 * `start`/`end` do not index `source`; the `typeof` guards below make that a
 * no-op rather than a spurious rejection.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function unsupportedEs2015Message(
  node,
  parent,
  parentKey,
  patternContext,
  parentIndex,
) {
  if (!RECOGNIZED_AST_NODE_TYPES.has(node.type)) {
    return `unsupported AST node type ${node.type}`;
  }

  if (
    isSupportedExpressionNode(node) &&
    !isSupportedExpressionPosition(
      node,
      parent,
      parentKey,
      parentIndex,
      patternContext,
    )
  ) {
    return 'expressions are not supported in this AST position';
  }

  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    return validateClassDefinition(node, parent, parentKey, parentIndex);
  }

  if (node.type === 'ClassBody') {
    return validateClassBody(node, parent, parentKey);
  }

  if (node.type === 'MethodDefinition') {
    return validateClassMethodDefinition(node, parent, parentKey, parentIndex);
  }

  if (isFunctionNode(node)) {
    const parameterMessage = validateFunctionParameterList(node);

    if (parameterMessage !== undefined) {
      return parameterMessage;
    }
  }

  if (parent && parent.type === 'ObjectPattern' && parentKey === 'properties') {
    if (
      node.type !== 'Property' ||
      node.kind !== 'init' ||
      node.method ||
      (!node.computed &&
        (!node.key ||
          (node.key.type !== 'Identifier' && node.key.type !== 'Literal')))
    ) {
      return 'unsupported destructuring property';
    }

    return undefined;
  }

  if (patternContext !== undefined) {
    const validPatternNode =
      node.type === 'Identifier' ||
      node.type === 'ObjectPattern' ||
      node.type === 'ArrayPattern' ||
      node.type === 'AssignmentPattern' ||
      node.type === 'RestElement' ||
      node.type === 'Property' ||
      (patternContext === 'assignment' && node.type === 'MemberExpression');

    if (!validPatternNode) {
      return `invalid ${patternContext} pattern target`;
    }
  }

  if (node.type === 'ObjectExpression') {
    const objectExpressionMessage = validateObjectExpression(node);

    if (objectExpressionMessage !== undefined) {
      return objectExpressionMessage;
    }
  }

  if (node.type === 'TemplateLiteral') {
    return validateTemplateLiteral(node, parent, parentKey);
  }

  if (node.type === 'TemplateElement') {
    return validateTemplateElement(node, parent, parentKey, parentIndex);
  }

  if (node.type === 'TaggedTemplateExpression') {
    return validateTaggedTemplateExpression(node);
  }

  if (node.type === 'ArrowFunctionExpression') {
    return validateArrowFunctionExpression(node);
  }

  if (node.type === 'Property') {
    const propertyMessage = validateObjectExpressionProperty(
      node,
      parent,
      parentKey,
      parentIndex,
    );

    if (propertyMessage !== undefined) {
      return propertyMessage;
    }
  }

  if (isFunctionNode(node) && node.async) {
    return 'async functions are not supported';
  }

  if (
    node.type !== 'ArrowFunctionExpression' &&
    isFunctionNode(node) &&
    (!node.body || node.body.type !== 'BlockStatement')
  ) {
    return 'function bodies must be block statements';
  }

  if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') {
    return patternContext === undefined
      ? 'destructuring patterns are not supported in this context'
      : undefined;
  }

  if (node.type === 'AssignmentPattern') {
    const validPlacement =
      (parent && isFunctionNode(parent) && parentKey === 'params') ||
      (parent && parent.type === 'ArrayPattern' && parentKey === 'elements') ||
      (parent && parent.type === 'Property' && parentKey === 'value');

    if (!validPlacement) {
      return 'default value pattern is not supported in this position';
    }

    return patternContext === undefined
      ? 'default value patterns are not supported in this context'
      : undefined;
  }

  if (node.type === 'RestElement') {
    const validArrayRest =
      patternContext !== undefined &&
      parent &&
      parent.type === 'ArrayPattern' &&
      parentKey === 'elements' &&
      parentIndex === parent.elements.length - 1;
    const validParameterRest =
      patternContext === 'binding' &&
      parent &&
      isFunctionNode(parent) &&
      parentKey === 'params' &&
      parentIndex === parent.params.length - 1;

    return validArrayRest || validParameterRest
      ? undefined
      : 'rest elements are not supported in this context';
  }

  if (node.type === 'SpreadElement') {
    const validPlacement =
      parent &&
      ((parent.type === 'ArrayExpression' && parentKey === 'elements') ||
        (parent.type === 'CallExpression' && parentKey === 'arguments') ||
        (parent.type === 'NewExpression' && parentKey === 'arguments')) &&
      Array.isArray(parent[parentKey]) &&
      typeof parentIndex === 'number' &&
      Number.isInteger(parentIndex) &&
      parentIndex >= 0 &&
      parentIndex < parent[parentKey].length &&
      parent[parentKey][parentIndex] === node;

    return validPlacement
      ? undefined
      : 'spread elements are not supported in this context';
  }

  return UNSUPPORTED_ES2015_NODE_MESSAGES.get(node.type);
}

/**
 * Validates the exact parent edge of every custom-parser AST node before the
 * regular syntax gate checks its feature-specific shape.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @returns {string | undefined}
 */
function validateCustomAstNodePlacement(
  node,
  parent,
  parentKey,
  parentIndex,
  patternContext,
) {
  if (!RECOGNIZED_AST_NODE_TYPES.has(node.type)) {
    return `unsupported AST node type ${node.type}`;
  }

  if (isSupportedExpressionNode(node)) {
    return isSupportedExpressionPosition(
      node,
      parent,
      parentKey,
      parentIndex,
      patternContext,
    )
      ? undefined
      : 'expressions are not supported in this AST position';
  }

  return isSupportedNonExpressionPosition(
    node,
    parent,
    parentKey,
    parentIndex,
    patternContext,
  )
    ? undefined
    : 'AST nodes are not supported in this AST position';
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

/**
 * Class definitions need a separate shape gate because Acorn exposes a
 * `ClassBody` and `MethodDefinition` tree that no other supported syntax uses.
 * The generic iterative walk remains responsible for recursively validating
 * every heritage, key, parameter, and body child after this local gate passes.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateClassDefinition(node, parent, parentKey, parentIndex) {
  if (
    node.type === 'ClassDeclaration' &&
    !isClassDeclarationPosition(parent, parentKey, parentIndex)
  ) {
    return 'class declarations are not supported in this AST position';
  }

  if (
    node.type === 'ClassDeclaration' &&
    (!isIdentifierNode(node.id) || typeof node.id.name !== 'string')
  ) {
    return 'class declarations require an identifier name';
  }

  if (
    node.type === 'ClassExpression' &&
    node.id !== null &&
    !isIdentifierNode(node.id)
  ) {
    return 'unsupported class expression name';
  }

  if (
    !Object.prototype.hasOwnProperty.call(node, 'superClass') ||
    (node.superClass !== null && !isSupportedExpressionNode(node.superClass))
  ) {
    return 'unsupported class heritage expression';
  }

  if (
    !node.body ||
    node.body.type !== 'ClassBody' ||
    !Array.isArray(node.body.body)
  ) {
    return 'unsupported class body shape';
  }

  if (hasDefinedField(node, UNSUPPORTED_CLASS_DEFINITION_FIELDS)) {
    return 'class decorators and type annotations are not supported';
  }

  let constructorCount = 0;

  for (const element of node.body.body) {
    if (isClassConstructorDefinition(element, element?.value)) {
      constructorCount += 1;

      if (constructorCount > 1) {
        return 'duplicate constructor in class body';
      }
    }
  }

  return undefined;
}

/**
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {boolean}
 */
function isClassDeclarationPosition(parent, parentKey, parentIndex) {
  if (
    !parent ||
    typeof parentIndex !== 'number' ||
    !Number.isInteger(parentIndex)
  ) {
    return false;
  }

  const list =
    (parent.type === 'Program' || parent.type === 'BlockStatement') &&
    parentKey === 'body'
      ? parent.body
      : parent.type === 'SwitchCase' && parentKey === 'consequent'
        ? parent.consequent
        : undefined;

  return Array.isArray(list) && parentIndex >= 0 && parentIndex < list.length;
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {string | undefined}
 */
function validateClassBody(node, parent, parentKey) {
  if (
    !parent ||
    (parent.type !== 'ClassDeclaration' && parent.type !== 'ClassExpression') ||
    parentKey !== 'body' ||
    parent.body !== node ||
    !Array.isArray(node.body)
  ) {
    return 'class bodies are only supported as class definition bodies';
  }

  for (const element of node.body) {
    if (
      !element ||
      typeof element !== 'object' ||
      element.type !== 'MethodDefinition'
    ) {
      return 'unsupported class element';
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateClassMethodDefinition(node, parent, parentKey, parentIndex) {
  if (
    !parent ||
    parent.type !== 'ClassBody' ||
    parentKey !== 'body' ||
    !Array.isArray(parent.body) ||
    typeof parentIndex !== 'number' ||
    !Number.isInteger(parentIndex) ||
    parentIndex < 0 ||
    parentIndex >= parent.body.length ||
    parent.body[parentIndex] !== node
  ) {
    return 'class methods are only supported in class bodies';
  }

  if (
    hasDefinedField(node, UNSUPPORTED_CLASS_METHOD_FIELDS) ||
    typeof node.computed !== 'boolean' ||
    typeof node.static !== 'boolean' ||
    (node.kind !== 'constructor' &&
      node.kind !== 'method' &&
      node.kind !== 'get' &&
      node.kind !== 'set') ||
    !isValidClassMethodKey(node.key, node.computed) ||
    !isClassMethodFunction(node, node.value)
  ) {
    return 'unsupported class method shape';
  }

  const parameterMessage = validateFunctionParameterList(node.value);

  if (parameterMessage !== undefined) {
    return parameterMessage;
  }

  const keyName = nonComputedClassMethodName(node);
  const constructor = isClassConstructorDefinition(node, node.value);

  if (constructor && node.kind !== 'constructor') {
    return 'class constructors must use constructor method syntax';
  }

  if (!constructor && node.kind === 'constructor') {
    return 'only noncomputed instance constructor methods may be constructors';
  }

  if (constructor && node.value.generator) {
    return 'class constructors cannot be generators';
  }

  if ((node.kind === 'get' || node.kind === 'set') && node.value.generator) {
    return 'class accessors cannot be generators';
  }

  if (node.static && !node.computed && keyName === 'prototype') {
    return 'classes may not have a static property named prototype';
  }

  if (node.kind === 'get' && node.value.params.length !== 0) {
    return 'class getters must not have parameters';
  }

  if (
    node.kind === 'set' &&
    (node.value.params.length !== 1 ||
      node.value.params[0].type === 'RestElement')
  ) {
    return 'class setters must have one non-rest parameter';
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {boolean} computed
 * @returns {boolean}
 */
function isValidClassMethodKey(node, computed) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (computed) {
    return isSupportedExpressionNode(node);
  }

  return isIdentifierNode(node) || (node.type === 'Literal' && !node.regex);
}

/**
 * @param {any} node
 * @returns {node is { type: 'Identifier', name: string }}
 */
function isIdentifierNode(node) {
  return (
    !!node &&
    typeof node === 'object' &&
    node.type === 'Identifier' &&
    typeof node.name === 'string'
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function nonComputedClassMethodName(node) {
  if (node.computed) {
    return undefined;
  }

  if (isIdentifierNode(node.key)) {
    return node.key.name;
  }

  if (node.key?.type === 'Literal' && !node.key.regex) {
    return String(node.key.value);
  }

  return undefined;
}

/**
 * @param {any} definition
 * @param {any} value
 * @returns {boolean}
 */
function isClassConstructorDefinition(definition, value) {
  return (
    !!definition &&
    definition.type === 'MethodDefinition' &&
    definition.static === false &&
    definition.computed === false &&
    nonComputedClassMethodName(definition) === 'constructor' &&
    isClassMethodFunction(definition, value)
  );
}

/**
 * @param {any} definition
 * @param {any} value
 * @returns {boolean}
 */
function isClassMethodFunction(definition, value) {
  return (
    !!definition &&
    definition.type === 'MethodDefinition' &&
    !!value &&
    !hasDefinedField(value, UNSUPPORTED_CLASS_METHOD_FUNCTION_FIELDS) &&
    value.type === 'FunctionExpression' &&
    value.id === null &&
    Array.isArray(value.params) &&
    typeof value.generator === 'boolean' &&
    (value.async === undefined || value.async === false) &&
    value.expression === false &&
    value.body &&
    value.body.type === 'BlockStatement' &&
    Array.isArray(value.body.body)
  );
}

/**
 * @param {any} node
 * @param {readonly string[]} fields
 * @returns {boolean}
 */
function hasDefinedField(node, fields) {
  return fields.some((field) => node[field] !== undefined);
}

/**
 * Recognized expression nodes must sit on an evaluator-consumed ESTree child
 * edge. The iterative parser walk intentionally descends into arbitrary
 * custom-parser object fields, so validating only a nested expression's local
 * shape leaves an otherwise valid expression container able to hide it from
 * the evaluator. Every accepted edge checks both the direct property identity
 * and, for lists, its exact array member index.
 *
 * `Identifier` and `Literal` also appear in syntax-only roles such as binding
 * names and noncomputed property keys. Those roles are listed explicitly so
 * valid parser output remains accepted rather than being mistaken for metadata.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @returns {boolean}
 */
function isSupportedExpressionPosition(
  node,
  parent,
  parentKey,
  parentIndex,
  patternContext,
) {
  if (!parent || typeof parentKey !== 'string') {
    return false;
  }

  /** @param {string} key @returns {boolean} */
  const direct = (key) => parentKey === key && parent[key] === node;
  /** @param {string} key @returns {boolean} */
  const member = (key) =>
    parentKey === key &&
    Array.isArray(parent[key]) &&
    typeof parentIndex === 'number' &&
    Number.isInteger(parentIndex) &&
    parentIndex >= 0 &&
    parentIndex < parent[key].length &&
    parent[key][parentIndex] === node;

  if (patternContext !== undefined) {
    if (node.type !== 'Identifier' && node.type !== 'MemberExpression') {
      return false;
    }

    switch (parent.type) {
      case 'VariableDeclarator':
        return direct('id');
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return member('params');
      case 'ArrayPattern':
        return member('elements');
      case 'Property':
        return direct('value');
      case 'AssignmentPattern':
        return direct('left');
      case 'RestElement':
        return direct('argument');
      case 'AssignmentExpression':
      case 'ForInStatement':
      case 'ForOfStatement':
        return direct('left');
      default:
        return false;
    }
  }

  switch (parent.type) {
    case 'ExpressionStatement':
      return direct('expression');
    case 'VariableDeclarator':
      return direct('init');
    case 'ReturnStatement':
    case 'ThrowStatement':
      return direct('argument');
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return direct('test');
    case 'ForStatement':
      return direct('init') || direct('test') || direct('update');
    case 'ForInStatement':
    case 'ForOfStatement':
      return (
        direct('right') ||
        (isAssignmentTargetExpression(node) && direct('left'))
      );
    case 'WithStatement':
      return direct('object');
    case 'SwitchStatement':
      return direct('discriminant');
    case 'SwitchCase':
      return direct('test');
    case 'UnaryExpression':
      return direct('argument');
    case 'BinaryExpression':
    case 'LogicalExpression':
      return direct('left') || direct('right');
    case 'ConditionalExpression':
      return direct('test') || direct('consequent') || direct('alternate');
    case 'AssignmentExpression':
      return (
        direct('right') ||
        (isAssignmentTargetExpression(node) && direct('left'))
      );
    case 'UpdateExpression':
      return isAssignmentTargetExpression(node) && direct('argument');
    case 'CallExpression':
    case 'NewExpression':
      return direct('callee') || member('arguments');
    case 'MemberExpression':
      return (
        direct('object') ||
        (parent.computed === true && direct('property')) ||
        (parent.computed === false &&
          node.type === 'Identifier' &&
          direct('property'))
      );
    case 'SequenceExpression':
      return member('expressions');
    case 'ArrayExpression':
      return member('elements');
    case 'SpreadElement':
      return direct('argument');
    case 'YieldExpression':
      return direct('argument');
    case 'TemplateLiteral':
      return member('expressions');
    case 'TaggedTemplateExpression':
      return (
        direct('tag') || (node.type === 'TemplateLiteral' && direct('quasi'))
      );
    case 'AssignmentPattern':
      return direct('right');
    case 'ArrowFunctionExpression':
      return parent.expression === true && direct('body');
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return node.type === 'Identifier' && direct('id');
    case 'ClassDeclaration':
    case 'ClassExpression':
      return (
        direct('superClass') || (node.type === 'Identifier' && direct('id'))
      );
    case 'MethodDefinition':
      return (
        (parent.computed === true && direct('key')) ||
        (parent.computed === false &&
          (node.type === 'Identifier' || node.type === 'Literal') &&
          direct('key')) ||
        (node.type === 'FunctionExpression' && direct('value'))
      );
    case 'Property':
      if (parent.computed === true && direct('key')) {
        return true;
      }

      if (
        parent.computed === false &&
        (node.type === 'Identifier' || node.type === 'Literal') &&
        direct('key')
      ) {
        return true;
      }

      if (!direct('value')) {
        return false;
      }

      return (
        (parent.kind === 'init' && parent.method === false) ||
        (node.type === 'FunctionExpression' &&
          ((parent.kind === 'init' && parent.method === true) ||
            ((parent.kind === 'get' || parent.kind === 'set') &&
              parent.method === false)))
      );
    case 'CatchClause':
      return node.type === 'Identifier' && direct('param');
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return node.type === 'Identifier' && direct('label');
    default:
      return false;
  }
}

/**
 * Every recognized structural or statement node must occupy the precise
 * evaluator-consumed ESTree edge that gives it meaning. This complements the
 * expression placement gate above and prevents custom-parser metadata from
 * hiding otherwise familiar AST nodes.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @returns {boolean}
 */
function isSupportedNonExpressionPosition(
  node,
  parent,
  parentKey,
  parentIndex,
  patternContext,
) {
  if (node.type === 'Program') {
    return parent === null;
  }

  if (!parent || typeof parentKey !== 'string') {
    return false;
  }

  /** @param {string} key @returns {boolean} */
  const direct = (key) => parentKey === key && parent[key] === node;
  /** @param {string} key @returns {boolean} */
  const member = (key) =>
    parentKey === key &&
    Array.isArray(parent[key]) &&
    typeof parentIndex === 'number' &&
    Number.isInteger(parentIndex) &&
    parentIndex >= 0 &&
    parentIndex < parent[key].length &&
    parent[key][parentIndex] === node;
  const statement = () =>
    ((parent.type === 'Program' || parent.type === 'BlockStatement') &&
      member('body')) ||
    (parent.type === 'SwitchCase' && member('consequent')) ||
    (parent.type === 'IfStatement' &&
      (direct('consequent') || direct('alternate'))) ||
    ((parent.type === 'WhileStatement' ||
      parent.type === 'DoWhileStatement' ||
      parent.type === 'ForStatement' ||
      parent.type === 'ForInStatement' ||
      parent.type === 'ForOfStatement' ||
      parent.type === 'LabeledStatement' ||
      parent.type === 'WithStatement') &&
      direct('body'));
  const pattern = () =>
    (parent.type === 'VariableDeclarator' && direct('id')) ||
    (isFunctionNode(parent) && member('params')) ||
    (parent.type === 'ArrayPattern' && member('elements')) ||
    (parent.type === 'Property' && direct('value')) ||
    (parent.type === 'AssignmentPattern' && direct('left')) ||
    (parent.type === 'RestElement' && direct('argument')) ||
    ((parent.type === 'AssignmentExpression' ||
      parent.type === 'ForInStatement' ||
      parent.type === 'ForOfStatement') &&
      direct('left'));

  switch (node.type) {
    case 'ExpressionStatement':
    case 'EmptyStatement':
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'SwitchStatement':
    case 'LabeledStatement':
    case 'DebuggerStatement':
    case 'WithStatement':
      return statement();
    case 'BlockStatement':
      return (
        statement() ||
        (isFunctionNode(parent) && direct('body')) ||
        (parent.type === 'TryStatement' &&
          (direct('block') || direct('finalizer'))) ||
        (parent.type === 'CatchClause' && direct('body'))
      );
    case 'VariableDeclaration':
      return (
        statement() ||
        (parent.type === 'ForStatement' && direct('init')) ||
        ((parent.type === 'ForInStatement' ||
          parent.type === 'ForOfStatement') &&
          direct('left'))
      );
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      return statement();
    case 'TryStatement':
      return statement();
    case 'VariableDeclarator':
      return parent.type === 'VariableDeclaration' && member('declarations');
    case 'CatchClause':
      return parent.type === 'TryStatement' && direct('handler');
    case 'SwitchCase':
      return parent.type === 'SwitchStatement' && member('cases');
    case 'Property':
      return (
        (parent.type === 'ObjectExpression' ||
          parent.type === 'ObjectPattern') &&
        member('properties')
      );
    case 'ClassBody':
      return (
        (parent.type === 'ClassDeclaration' ||
          parent.type === 'ClassExpression') &&
        direct('body')
      );
    case 'MethodDefinition':
      return parent.type === 'ClassBody' && member('body');
    case 'TemplateElement':
      return parent.type === 'TemplateLiteral' && member('quasis');
    case 'Super':
      return (
        (parent.type === 'MemberExpression' && direct('object')) ||
        (parent.type === 'CallExpression' && direct('callee'))
      );
    case 'SpreadElement':
      return (
        (parent.type === 'ArrayExpression' && member('elements')) ||
        (parent.type === 'CallExpression' && member('arguments')) ||
        (parent.type === 'NewExpression' && member('arguments')) ||
        (parent.type === 'ObjectExpression' && member('properties'))
      );
    case 'ObjectPattern':
    case 'ArrayPattern':
      return patternContext !== undefined && pattern();
    case 'AssignmentPattern':
      return (
        (isFunctionNode(parent) && member('params')) ||
        (parent.type === 'ArrayPattern' && member('elements')) ||
        (parent.type === 'Property' && direct('value'))
      );
    case 'RestElement':
      return (
        (isFunctionNode(parent) && member('params')) ||
        (parent.type === 'ArrayPattern' && member('elements')) ||
        (parent.type === 'ObjectPattern' && member('properties'))
      );
    case 'YieldExpression':
    case 'AwaitExpression':
    case 'MetaProperty':
    case 'ImportExpression':
      return isSupportedExpressionPosition(
        node,
        parent,
        parentKey,
        parentIndex,
        patternContext,
      );
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration':
    case 'ExportAllDeclaration':
      return parent.type === 'Program' && member('body');
    default:
      return false;
  }
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isAssignmentTargetExpression(node) {
  return node.type === 'Identifier' || node.type === 'MemberExpression';
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateArrowFunctionExpression(node) {
  if (
    node.id !== null ||
    !Array.isArray(node.params) ||
    node.generator !== false ||
    (node.async !== undefined && node.async !== false) ||
    typeof node.expression !== 'boolean' ||
    !node.body ||
    typeof node.body !== 'object'
  ) {
    return 'unsupported arrow function shape';
  }

  if (node.expression) {
    return isSupportedExpressionNode(node.body)
      ? undefined
      : 'unsupported arrow function expression body';
  }

  return node.body.type === 'BlockStatement' && Array.isArray(node.body.body)
    ? undefined
    : 'unsupported arrow function block body';
}

/**
 * Rejects malformed custom function parameter trees before the early-error
 * pass reaches the bound-name summary. Placement and
 * expression capability checks remain the responsibility of the main AST walk.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateFunctionParameterList(node) {
  if (!Array.isArray(node.params)) {
    return 'function parameters must be an array';
  }

  /** @type {{ node: any, binding: boolean }[]} */
  const pending = /** @type {any[]} */ (node.params).map(
    /** @param {any} parameter */
    (parameter) => ({
      node: parameter,
      binding: true,
    }),
  );
  const visitedBindings = new WeakSet();
  const visitedExpressions = new WeakSet();

  while (pending.length > 0) {
    const { node: parameter, binding } =
      /** @type {{ node: any, binding: boolean }} */ (pending.pop());

    if (
      !parameter ||
      typeof parameter !== 'object' ||
      typeof parameter.type !== 'string'
    ) {
      return binding
        ? 'unsupported function parameter'
        : 'unsupported computed object parameter key';
    }

    if (binding && !isBindingParameterNode(parameter)) {
      return 'unsupported function parameter';
    }

    const visited = binding ? visitedBindings : visitedExpressions;

    if (visited.has(parameter)) {
      continue;
    }

    visited.add(parameter);

    if (!binding) {
      if (
        RECOGNIZED_AST_NODE_TYPES.has(parameter.type) &&
        !isSupportedExpressionNode(parameter)
      ) {
        return 'unsupported computed object parameter key';
      }

      continue;
    }

    switch (parameter.type) {
      case 'Identifier':
        if (typeof parameter.name !== 'string') {
          return 'unsupported function parameter';
        }
        break;
      case 'ObjectPattern':
        if (!Array.isArray(parameter.properties)) {
          return 'unsupported object parameter pattern';
        }

        for (const property of parameter.properties) {
          if (!property || typeof property !== 'object') {
            return 'unsupported object parameter pattern';
          }

          if (property.type === 'Property') {
            const propertyMessage = validateObjectParameterProperty(
              property,
              pending,
            );

            if (propertyMessage !== undefined) {
              return propertyMessage;
            }
          } else if (property.type === 'RestElement') {
            pending.push({ node: property, binding: true });
          } else {
            return 'unsupported object parameter pattern';
          }
        }
        break;
      case 'ArrayPattern':
        if (!Array.isArray(parameter.elements)) {
          return 'unsupported array parameter pattern';
        }

        for (const element of parameter.elements) {
          if (element !== null) {
            pending.push({ node: element, binding: true });
          }
        }
        break;
      case 'AssignmentPattern':
        if (
          !parameter.right ||
          typeof parameter.right !== 'object' ||
          typeof parameter.right.type !== 'string'
        ) {
          return 'unsupported default parameter value';
        }

        pending.push({ node: parameter.left, binding: true });
        break;
      case 'RestElement':
        pending.push({ node: parameter.argument, binding: true });
        break;
    }
  }

  return undefined;
}

/**
 * @param {any} property
 * @param {{ node: any, binding: boolean }[]} pending
 * @returns {string | undefined}
 */
function validateObjectParameterProperty(property, pending) {
  if (
    property.kind !== 'init' ||
    property.method !== false ||
    typeof property.shorthand !== 'boolean' ||
    typeof property.computed !== 'boolean' ||
    !property.key ||
    typeof property.key !== 'object' ||
    typeof property.key.type !== 'string' ||
    !property.value ||
    typeof property.value !== 'object' ||
    typeof property.value.type !== 'string'
  ) {
    return 'unsupported object parameter property';
  }

  if (
    !property.computed &&
    property.key.type !== 'Identifier' &&
    (property.key.type !== 'Literal' || property.key.regex)
  ) {
    return 'unsupported noncomputed object parameter key';
  }

  if (property.shorthand) {
    const valueIdentifier =
      property.value.type === 'Identifier'
        ? property.value
        : property.value.type === 'AssignmentPattern'
          ? property.value.left
          : null;

    if (
      property.computed ||
      property.key.type !== 'Identifier' ||
      !valueIdentifier ||
      valueIdentifier.type !== 'Identifier' ||
      property.key.name !== valueIdentifier.name
    ) {
      return 'unsupported shorthand object parameter property';
    }
  }

  pending.push({ node: property.value, binding: true });

  if (property.computed) {
    pending.push({ node: property.key, binding: false });
  }

  return undefined;
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isBindingParameterNode(node) {
  return (
    !!node &&
    typeof node === 'object' &&
    (node.type === 'Identifier' ||
      node.type === 'ObjectPattern' ||
      node.type === 'ArrayPattern' ||
      node.type === 'AssignmentPattern' ||
      node.type === 'RestElement')
  );
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {string | undefined}
 */
function validateTemplateLiteral(node, parent, parentKey) {
  if (!Array.isArray(node.expressions) || !Array.isArray(node.quasis)) {
    return 'template literal expressions and quasis must be arrays';
  }

  if (node.quasis.length !== node.expressions.length + 1) {
    return 'template literal quasis must outnumber expressions by one';
  }

  if (node.quasis.length === 0) {
    return 'template literal must have a quasi';
  }

  const tagged =
    parent &&
    parent.type === 'TaggedTemplateExpression' &&
    parentKey === 'quasi';

  for (const expression of node.expressions) {
    if (!isSupportedExpressionNode(expression)) {
      return 'unsupported template literal substitution';
    }
  }

  for (let index = 0; index < node.quasis.length; index += 1) {
    const element = node.quasis[index];

    if (!isTemplateElementShape(element, index === node.quasis.length - 1)) {
      return 'unsupported template element shape';
    }

    if (!tagged && typeof element.value.cooked !== 'string') {
      return 'untagged template literals require cooked string values';
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateTemplateElement(node, parent, parentKey, parentIndex) {
  if (
    !parent ||
    parent.type !== 'TemplateLiteral' ||
    parentKey !== 'quasis' ||
    !Array.isArray(parent.quasis) ||
    typeof parentIndex !== 'number' ||
    parentIndex < 0 ||
    parentIndex >= parent.quasis.length ||
    parent.quasis[parentIndex] !== node
  ) {
    return 'template elements are only supported in template literal quasis';
  }

  return isTemplateElementShape(node, parentIndex === parent.quasis.length - 1)
    ? undefined
    : 'unsupported template element shape';
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateTaggedTemplateExpression(node) {
  if (!isSupportedExpressionNode(node.tag)) {
    return 'tagged template expressions require a supported tag expression';
  }

  return node.quasi?.type === 'TemplateLiteral'
    ? undefined
    : 'tagged template expressions require a template literal quasi';
}

/**
 * @param {any} node
 * @param {boolean} tail
 * @returns {boolean}
 */
function isTemplateElementShape(node, tail) {
  if (
    !node ||
    typeof node !== 'object' ||
    node.type !== 'TemplateElement' ||
    typeof node.tail !== 'boolean' ||
    node.tail !== tail ||
    !node.value ||
    typeof node.value !== 'object' ||
    typeof node.value.raw !== 'string' ||
    !Object.prototype.hasOwnProperty.call(node.value, 'cooked')
  ) {
    return false;
  }

  return (
    typeof node.value.cooked === 'string' ||
    node.value.cooked === null ||
    node.value.cooked === undefined
  );
}

/**
 * Rejects malformed custom object-expression property lists before the
 * evaluator reaches them. `SpreadElement` remains a child here so its
 * shape-sensitive capability rule below produces the ordinary object-spread
 * rejection.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateObjectExpression(node) {
  if (!Array.isArray(node.properties)) {
    return 'object literal properties must be an array';
  }

  let foundPrototypeSetter = false;

  for (const property of node.properties) {
    if (
      !property ||
      typeof property !== 'object' ||
      (property.type !== 'Property' && property.type !== 'SpreadElement')
    ) {
      return 'unsupported object literal property';
    }

    if (isPrototypeSetterProperty(property)) {
      if (foundPrototypeSetter) {
        return 'duplicate __proto__ properties are not allowed';
      }

      foundPrototypeSetter = true;
    }
  }

  return undefined;
}

/**
 * Checks exactly the `Property` shapes that object-literal evaluation supports.
 * The generic iterative walk still validates every nested key, value, and
 * function node after this parent-local check succeeds.
 *
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {number | undefined} parentIndex
 * @returns {string | undefined}
 */
function validateObjectExpressionProperty(
  node,
  parent,
  parentKey,
  parentIndex,
) {
  if (
    !parent ||
    parent.type !== 'ObjectExpression' ||
    parentKey !== 'properties' ||
    !Array.isArray(parent.properties) ||
    typeof parentIndex !== 'number' ||
    !Number.isInteger(parentIndex) ||
    parentIndex < 0 ||
    parentIndex >= parent.properties.length ||
    parent.properties[parentIndex] !== node
  ) {
    return 'object properties are not supported in this AST position';
  }

  if (
    typeof node.computed !== 'boolean' ||
    typeof node.method !== 'boolean' ||
    typeof node.shorthand !== 'boolean' ||
    (node.kind !== 'init' && node.kind !== 'get' && node.kind !== 'set') ||
    !node.key ||
    typeof node.key !== 'object' ||
    !node.value ||
    typeof node.value !== 'object'
  ) {
    return 'unsupported object property shape';
  }

  if (
    !node.computed &&
    node.key.type !== 'Identifier' &&
    (node.key.type !== 'Literal' || node.key.regex)
  ) {
    return 'unsupported noncomputed object property key';
  }

  if (node.computed && !isSupportedExpressionNode(node.key)) {
    return 'unsupported computed object property key';
  }

  if (node.shorthand) {
    return node.kind === 'init' &&
      !node.computed &&
      !node.method &&
      node.key.type === 'Identifier' &&
      node.value.type === 'Identifier' &&
      node.key.name === node.value.name
      ? undefined
      : 'unsupported shorthand object property';
  }

  if (node.method) {
    return node.kind === 'init' && isObjectLiteralFunction(node.value)
      ? undefined
      : 'unsupported concise object method';
  }

  if (node.kind === 'init') {
    return isSupportedExpressionNode(node.value)
      ? undefined
      : 'unsupported object property value';
  }

  if (!isObjectLiteralFunction(node.value)) {
    return 'unsupported object accessor';
  }

  if (node.value.generator) {
    return 'object accessors cannot be generators';
  }

  const parameterMessage = validateFunctionParameterList(node.value);

  if (parameterMessage !== undefined) {
    return parameterMessage;
  }

  if (node.kind === 'get') {
    return node.value.params.length === 0
      ? undefined
      : 'object getters must not have parameters';
  }

  return node.value.params.length === 1 &&
    node.value.params[0].type !== 'RestElement'
    ? undefined
    : 'object setters must have one non-rest parameter';
}

/**
 * @param {any} property
 * @returns {boolean}
 */
function isPrototypeSetterProperty(property) {
  return (
    property.type === 'Property' &&
    property.kind === 'init' &&
    property.computed === false &&
    property.method === false &&
    property.shorthand === false &&
    property.key &&
    ((property.key.type === 'Identifier' &&
      property.key.name === '__proto__') ||
      (property.key.type === 'Literal' &&
        !property.key.regex &&
        property.key.value === '__proto__'))
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isSupportedExpressionNode(node) {
  return (
    !!node &&
    typeof node === 'object' &&
    typeof node.type === 'string' &&
    SUPPORTED_EXPRESSION_TYPES.has(node.type)
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateEvaluatorScalarSyntax(node) {
  const validator = UNTRUSTED_AST_SCALAR_VALIDATORS.get(node.type);

  return validator === undefined ? undefined : validator(node);
}

/**
 * @param {any} _node
 * @returns {string | undefined}
 */
function validateNoScalarSyntax(_node) {
  return undefined;
}

/**
 * @param {unknown} value
 * @param {ReadonlySet<string>} allowed
 * @returns {boolean}
 */
function isAllowedScalarString(value, allowed) {
  return typeof value === 'string' && allowed.has(value);
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateProgramScalarSyntax(node) {
  return validateRequiredScalar(
    node,
    'sourceType',
    (value) => value === 'script',
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateExpressionStatementScalarSyntax(node) {
  return validateOptionalScalar(
    node,
    'directive',
    (value) => typeof value === 'string',
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateVariableDeclarationScalarSyntax(node) {
  return validateRequiredScalar(node, 'kind', (value) =>
    isAllowedScalarString(value, SUPPORTED_VARIABLE_DECLARATION_KINDS),
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateFunctionScalarSyntax(node) {
  return (
    validateRequiredScalar(
      node,
      'generator',
      (value) => typeof value === 'boolean',
    ) ??
    validateOptionalScalar(node, 'async', (value) => value === false) ??
    validateRequiredScalar(node, 'expression', (value) => value === false)
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateYieldScalarSyntax(node) {
  return validateRequiredScalar(
    node,
    'delegate',
    (value) => typeof value === 'boolean',
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateArrowScalarSyntax(node) {
  return (
    validateRequiredScalar(node, 'id', (value) => value === null) ??
    validateRequiredScalar(node, 'generator', (value) => value === false) ??
    validateOptionalScalar(node, 'async', (value) => value === false) ??
    validateRequiredScalar(
      node,
      'expression',
      (value) => typeof value === 'boolean',
    )
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateForOfScalarSyntax(node) {
  return validateOptionalScalar(node, 'await', (value) => value === false);
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateIdentifierScalarSyntax(node) {
  return validateRequiredScalar(
    node,
    'name',
    (value) => typeof value === 'string',
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateUnaryScalarSyntax(node) {
  return (
    validateRequiredScalar(node, 'operator', (value) =>
      isAllowedScalarString(value, SUPPORTED_UNARY_OPERATORS),
    ) ?? validateRequiredScalar(node, 'prefix', (value) => value === true)
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateBinaryScalarSyntax(node) {
  return validateRequiredScalar(node, 'operator', (value) =>
    isAllowedScalarString(value, SUPPORTED_BINARY_OPERATORS),
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateLogicalScalarSyntax(node) {
  return validateRequiredScalar(node, 'operator', (value) =>
    isAllowedScalarString(value, SUPPORTED_LOGICAL_OPERATORS),
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateAssignmentScalarSyntax(node) {
  return validateRequiredScalar(node, 'operator', (value) =>
    isAllowedScalarString(value, SUPPORTED_ASSIGNMENT_OPERATORS),
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateUpdateScalarSyntax(node) {
  return (
    validateRequiredScalar(node, 'operator', (value) =>
      isAllowedScalarString(value, SUPPORTED_UPDATE_OPERATORS),
    ) ??
    validateRequiredScalar(
      node,
      'prefix',
      (value) => typeof value === 'boolean',
    )
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateCallScalarSyntax(node) {
  return validateOptionalScalar(node, 'optional', (value) => value === false);
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateMemberScalarSyntax(node) {
  return (
    validateRequiredScalar(
      node,
      'computed',
      (value) => typeof value === 'boolean',
    ) ?? validateOptionalScalar(node, 'optional', (value) => value === false)
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateMethodDefinitionScalarSyntax(node) {
  return (
    validateRequiredScalar(
      node,
      'computed',
      (value) => typeof value === 'boolean',
    ) ??
    validateRequiredScalar(
      node,
      'static',
      (value) => typeof value === 'boolean',
    ) ??
    validateRequiredScalar(
      node,
      'kind',
      (value) =>
        value === 'constructor' ||
        value === 'method' ||
        value === 'get' ||
        value === 'set',
    )
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validatePropertyScalarSyntax(node) {
  return (
    validateRequiredScalar(
      node,
      'computed',
      (value) => typeof value === 'boolean',
    ) ??
    validateRequiredScalar(
      node,
      'method',
      (value) => typeof value === 'boolean',
    ) ??
    validateRequiredScalar(
      node,
      'shorthand',
      (value) => typeof value === 'boolean',
    ) ??
    validateRequiredScalar(
      node,
      'kind',
      (value) => value === 'init' || value === 'get' || value === 'set',
    )
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateLiteralScalarSyntax(node) {
  const regex = Object.getOwnPropertyDescriptor(node, 'regex');

  if (
    regex !== undefined &&
    (!Object.prototype.hasOwnProperty.call(regex, 'value') ||
      !isRegexLiteralRecord(regex.value))
  ) {
    return invalidEvaluatorScalar(node, 'regex');
  }

  const rawMessage = validateOptionalScalar(
    node,
    'raw',
    (value) => typeof value === 'string',
  );

  if (rawMessage !== undefined) {
    return rawMessage;
  }

  const bigintMessage = validateOptionalScalar(
    node,
    'bigint',
    (value) => value === undefined,
  );

  if (bigintMessage !== undefined) {
    return bigintMessage;
  }

  return validateRequiredScalar(
    node,
    'value',
    (value) =>
      regex !== undefined ||
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean',
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRegexLiteralRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const pattern = Object.getOwnPropertyDescriptor(value, 'pattern');
  const flags = Object.getOwnPropertyDescriptor(value, 'flags');

  return (
    pattern !== undefined &&
    flags !== undefined &&
    Object.prototype.hasOwnProperty.call(pattern, 'value') &&
    Object.prototype.hasOwnProperty.call(flags, 'value') &&
    typeof pattern.value === 'string' &&
    typeof flags.value === 'string'
  );
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateTemplateElementScalarSyntax(node) {
  const tailMessage = validateRequiredScalar(
    node,
    'tail',
    (value) => typeof value === 'boolean',
  );

  if (tailMessage !== undefined) {
    return tailMessage;
  }

  const value = Object.getOwnPropertyDescriptor(node, 'value');

  if (
    value === undefined ||
    !Object.prototype.hasOwnProperty.call(value, 'value') ||
    !value.value ||
    typeof value.value !== 'object' ||
    Array.isArray(value.value)
  ) {
    return invalidEvaluatorScalar(node, 'value');
  }

  const raw = Object.getOwnPropertyDescriptor(value.value, 'raw');
  const cooked = Object.getOwnPropertyDescriptor(value.value, 'cooked');

  return raw === undefined ||
    cooked === undefined ||
    !Object.prototype.hasOwnProperty.call(raw, 'value') ||
    !Object.prototype.hasOwnProperty.call(cooked, 'value') ||
    typeof raw.value !== 'string' ||
    (typeof cooked.value !== 'string' &&
      cooked.value !== null &&
      cooked.value !== undefined)
    ? invalidEvaluatorScalar(node, 'value')
    : undefined;
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateRequiredScalar(node, field, accepts) {
  const descriptor = Object.getOwnPropertyDescriptor(node, field);

  return descriptor !== undefined &&
    Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
    accepts(descriptor.value)
    ? undefined
    : invalidEvaluatorScalar(node, field);
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateOptionalScalar(node, field, accepts) {
  const descriptor = Object.getOwnPropertyDescriptor(node, field);

  if (descriptor === undefined) {
    return undefined;
  }

  return Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
    accepts(descriptor.value)
    ? undefined
    : invalidEvaluatorScalar(node, field);
}

/**
 * @param {any} node
 * @param {string} field
 * @returns {string}
 */
function invalidEvaluatorScalar(node, field) {
  return `${node.type}.${field} has unsupported scalar syntax`;
}

/**
 * A custom parser can return ordinary JavaScript values where an evaluator
 * helper expects a particular AST child. The generic walk below catches AST
 * nodes that appear in an invalid position, but primitives, nulls, and nested
 * child arrays have no `type` and would otherwise reach evaluator internals.
 * Check every consumed edge here, while leaving unknown typed nodes to the
 * generic walker so its ordinary unsupported-node diagnostic is preserved.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateEvaluatorChildEdges(node) {
  switch (node.type) {
    case 'Program':
    case 'BlockStatement':
      return validateChildList(node, 'body', isStatementNodeOrUnknown);
    case 'ExpressionStatement':
      return validateRequiredChild(
        node,
        'expression',
        isExpressionNodeOrUnknown,
      );
    case 'VariableDeclaration':
      return validateChildList(
        node,
        'declarations',
        isVariableDeclaratorOrUnknown,
      );
    case 'VariableDeclarator':
      return (
        validateRequiredChild(node, 'id', isBindingPatternNodeOrUnknown) ??
        validateOptionalChild(node, 'init', isExpressionNodeOrUnknown)
      );
    case 'FunctionDeclaration':
      return (
        validateRequiredChild(node, 'id', isIdentifierNodeOrUnknown) ??
        validateChildList(node, 'params', isBindingPatternNodeOrUnknown) ??
        validateFunctionBlockBody(node)
      );
    case 'FunctionExpression':
      return (
        validateOptionalChild(node, 'id', isIdentifierNodeOrUnknown) ??
        validateChildList(node, 'params', isBindingPatternNodeOrUnknown) ??
        validateFunctionBlockBody(node)
      );
    case 'ArrowFunctionExpression':
      if (!Array.isArray(node.params)) {
        return invalidEvaluatorChild(node, 'params');
      }

      if (node.expression === true) {
        return validateRequiredChild(node, 'body', isExpressionNodeOrUnknown);
      }

      return validateFunctionBlockBody(node);
    case 'IfStatement':
      return (
        validateRequiredChild(node, 'test', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'consequent', isStatementNodeOrUnknown) ??
        validateOptionalChild(node, 'alternate', isStatementNodeOrUnknown)
      );
    case 'WhileStatement':
    case 'DoWhileStatement':
      return (
        validateRequiredChild(node, 'test', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'body', isStatementNodeOrUnknown)
      );
    case 'ForStatement':
      return (
        validateOptionalChild(node, 'init', isForInitializerNodeOrUnknown) ??
        validateNullableChild(node, 'test', isExpressionNodeOrUnknown) ??
        validateOptionalChild(node, 'update', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'body', isStatementNodeOrUnknown)
      );
    case 'ForInStatement':
    case 'ForOfStatement':
      return validateForInOfEdges(node);
    case 'BreakStatement':
    case 'ContinueStatement':
      return validateOptionalChild(node, 'label', isIdentifierNodeOrUnknown);
    case 'ReturnStatement':
      return validateOptionalChild(node, 'argument', isExpressionNodeOrUnknown);
    case 'ThrowStatement':
      return validateRequiredChild(node, 'argument', isExpressionNodeOrUnknown);
    case 'TryStatement':
      return (
        validateRequiredChild(node, 'block', isBlockStatementOrUnknown) ??
        validateNullableChild(node, 'handler', isCatchClauseOrUnknown) ??
        validateNullableChild(node, 'finalizer', isBlockStatementOrUnknown)
      );
    case 'CatchClause':
      return (
        validateRequiredChild(node, 'param', isIdentifierNodeOrUnknown) ??
        validateRequiredChild(node, 'body', isBlockStatementOrUnknown)
      );
    case 'SwitchStatement':
      return (
        validateRequiredChild(
          node,
          'discriminant',
          isExpressionNodeOrUnknown,
        ) ?? validateChildList(node, 'cases', isSwitchCaseOrUnknown)
      );
    case 'SwitchCase':
      return (
        validateNullableChild(node, 'test', isExpressionNodeOrUnknown) ??
        validateChildList(node, 'consequent', isStatementNodeOrUnknown)
      );
    case 'LabeledStatement':
      return (
        validateRequiredChild(node, 'label', isIdentifierNodeOrUnknown) ??
        validateRequiredChild(node, 'body', isStatementNodeOrUnknown)
      );
    case 'WithStatement':
      return (
        validateRequiredChild(node, 'object', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'body', isStatementNodeOrUnknown)
      );
    case 'UnaryExpression':
      return validateRequiredChild(node, 'argument', isExpressionNodeOrUnknown);
    case 'BinaryExpression':
    case 'LogicalExpression':
      return (
        validateRequiredChild(node, 'left', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'right', isExpressionNodeOrUnknown)
      );
    case 'ConditionalExpression':
      return (
        validateRequiredChild(node, 'test', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'consequent', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'alternate', isExpressionNodeOrUnknown)
      );
    case 'AssignmentExpression':
      return (
        validateRequiredChild(node, 'left', isAssignmentTargetNodeOrUnknown) ??
        validateRequiredChild(node, 'right', isExpressionNodeOrUnknown)
      );
    case 'UpdateExpression':
      return validateRequiredChild(
        node,
        'argument',
        isIdentifierOrMemberNodeOrUnknown,
      );
    case 'CallExpression':
      return (
        validateRequiredChild(node, 'callee', isCallCalleeNodeOrUnknown) ??
        validateChildList(node, 'arguments', isArgumentNodeOrUnknown)
      );
    case 'NewExpression':
      return (
        validateRequiredChild(node, 'callee', isExpressionNodeOrUnknown) ??
        validateOptionalChildList(node, 'arguments', isArgumentNodeOrUnknown)
      );
    case 'MemberExpression':
      return validateMemberExpressionEdges(node);
    case 'ObjectExpression':
      return validateChildList(
        node,
        'properties',
        isObjectPropertyNodeOrUnknown,
      );
    case 'ArrayExpression':
      return validateArrayExpressionElements(node);
    case 'SequenceExpression':
      return validateChildList(node, 'expressions', isExpressionNodeOrUnknown);
    case 'TemplateLiteral':
      return (
        validateChildList(node, 'expressions', isExpressionNodeOrUnknown) ??
        validateChildList(node, 'quasis', isTemplateElementNodeOrUnknown)
      );
    case 'TaggedTemplateExpression':
      return (
        validateRequiredChild(node, 'tag', isExpressionNodeOrUnknown) ??
        validateRequiredChild(node, 'quasi', isTemplateLiteralNodeOrUnknown)
      );
    case 'SpreadElement':
      return validateRequiredChild(node, 'argument', isExpressionNodeOrUnknown);
    case 'YieldExpression':
      return node.delegate === true
        ? validateRequiredChild(node, 'argument', isExpressionNodeOrUnknown)
        : validateNullableChild(node, 'argument', isExpressionNodeOrUnknown);
    case 'ObjectPattern':
      return validateObjectPatternProperties(node);
    case 'ArrayPattern':
      return validateArrayPatternElements(node);
    case 'AssignmentPattern':
      return (
        validateRequiredChild(node, 'left', isPatternNodeOrUnknown) ??
        validateRequiredChild(node, 'right', isExpressionNodeOrUnknown)
      );
    case 'RestElement':
      return validateRequiredChild(node, 'argument', isPatternNodeOrUnknown);
    default:
      return undefined;
  }
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateRequiredChild(node, field, accepts) {
  return accepts(node[field]) ? undefined : invalidEvaluatorChild(node, field);
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateOptionalChild(node, field, accepts) {
  const value = node[field];

  return value === null || value === undefined || accepts(value)
    ? undefined
    : invalidEvaluatorChild(node, field);
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateNullableChild(node, field, accepts) {
  const value = node[field];

  return value === null || accepts(value)
    ? undefined
    : invalidEvaluatorChild(node, field);
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateChildList(node, field, accepts) {
  const values = node[field];

  if (!Array.isArray(values)) {
    return invalidEvaluatorChild(node, field);
  }

  for (let index = 0; index < values.length; index += 1) {
    if (!accepts(values[index])) {
      return invalidEvaluatorChild(node, field);
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {string} field
 * @param {(value: unknown) => boolean} accepts
 * @returns {string | undefined}
 */
function validateOptionalChildList(node, field, accepts) {
  const values = node[field];

  if (values === null || values === undefined) {
    return undefined;
  }

  return validateChildList(node, field, accepts);
}

/**
 * Function early errors inspect a block's directive prologue before the main
 * traversal reaches that block. Check the complete statement list first so a
 * malformed member cannot escape as a host error.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateFunctionBlockBody(node) {
  const bodyMessage = validateRequiredChild(
    node,
    'body',
    isBlockStatementOrUnknown,
  );

  if (bodyMessage !== undefined || node.body?.type !== 'BlockStatement') {
    return bodyMessage;
  }

  return validateChildList(node.body, 'body', isStatementNodeOrUnknown);
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateMemberExpressionEdges(node) {
  const objectMessage = validateRequiredChild(
    node,
    'object',
    isMemberObjectNodeOrUnknown,
  );

  if (objectMessage !== undefined) {
    return objectMessage;
  }

  return node.computed === true
    ? validateRequiredChild(node, 'property', isExpressionNodeOrUnknown)
    : node.computed === false
      ? validateRequiredChild(node, 'property', isIdentifierNodeOrUnknown)
      : invalidEvaluatorChild(node, 'computed');
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateForInOfEdges(node) {
  const awaitMessage = unsupportedForOfAwaitMessage(node);

  if (awaitMessage !== undefined) {
    return awaitMessage;
  }

  const leftMessage = validateForInOfLeft(node);

  if (leftMessage !== undefined) {
    return leftMessage;
  }

  return (
    validateRequiredChild(node, 'right', isExpressionNodeOrUnknown) ??
    validateRequiredChild(node, 'body', isStatementNodeOrUnknown)
  );
}

/**
 * `await` is a post-ES2015 extension to the for-of AST. Keep this capability
 * gate in the ordinary parser pass as well as the custom edge validator.
 *
 * @param {any} node
 * @returns {void}
 */
function checkUnsupportedForOfAwait(node) {
  const message = unsupportedForOfAwaitMessage(node);

  if (message !== undefined) {
    throw unsupportedEs2015Error(message, node);
  }
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function unsupportedForOfAwaitMessage(node) {
  return node.type === 'ForOfStatement' &&
    Object.prototype.hasOwnProperty.call(node, 'await') &&
    node.await !== false
    ? 'async for-of is not supported'
    : undefined;
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateForInOfLeft(node) {
  const left = node.left;

  if (left?.type !== 'VariableDeclaration') {
    return isForInOfLeftNodeOrUnknown(left)
      ? undefined
      : invalidEvaluatorChild(node, 'left');
  }

  if (!Array.isArray(left.declarations) || left.declarations.length !== 1) {
    return invalidEvaluatorChild(node, 'left');
  }

  const [declarator] = left.declarations;

  if (isUnknownAstNode(declarator)) {
    return undefined;
  }

  return declarator?.type === 'VariableDeclarator' && declarator.init === null
    ? undefined
    : invalidEvaluatorChild(node, 'left');
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateArrayExpressionElements(node) {
  const elements = node.elements;

  if (!Array.isArray(elements)) {
    return invalidEvaluatorChild(node, 'elements');
  }

  for (const element of elements) {
    if (
      element !== null &&
      !isExpressionNodeOrUnknown(element) &&
      !isNodeTypeOrUnknown(element, 'SpreadElement')
    ) {
      return invalidEvaluatorChild(node, 'elements');
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function validateArrayPatternElements(node) {
  const elements = node.elements;

  if (!Array.isArray(elements)) {
    return invalidEvaluatorChild(node, 'elements');
  }

  for (const element of elements) {
    if (element !== null && !isPatternNodeOrUnknown(element)) {
      return invalidEvaluatorChild(node, 'elements');
    }
  }

  return undefined;
}

/**
 * `Property` is both an evaluator child and a pattern container. Validate its
 * key and value before a later static-semantics pass can inspect them.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function validateObjectPatternProperties(node) {
  const properties = node.properties;

  if (!Array.isArray(properties)) {
    return invalidEvaluatorChild(node, 'properties');
  }

  for (const property of properties) {
    if (!isPatternPropertyNodeOrUnknown(property)) {
      return invalidEvaluatorChild(node, 'properties');
    }

    if (property?.type === 'Property') {
      if (
        !property.key ||
        typeof property.key !== 'object' ||
        typeof property.key.type !== 'string' ||
        !property.value ||
        typeof property.value !== 'object' ||
        typeof property.value.type !== 'string'
      ) {
        return invalidEvaluatorChild(node, 'properties');
      }
    }
  }

  return undefined;
}

/**
 * @param {any} node
 * @param {string} field
 * @returns {string}
 */
function invalidEvaluatorChild(node, field) {
  return `${node.type}.${field} has an unsupported evaluator child`;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUnknownAstNode(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (/** @type {any} */ (value).type) === 'string' &&
    !RECOGNIZED_AST_NODE_TYPES.has(/** @type {any} */ (value).type)
  );
}

/**
 * @param {unknown} value
 * @param {string} type
 * @returns {boolean}
 */
function isNodeTypeOrUnknown(value, type) {
  return (
    isUnknownAstNode(value) ||
    (!!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      /** @type {any} */ (value).type === type)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isExpressionNodeOrUnknown(value) {
  return isUnknownAstNode(value) || isSupportedExpressionNode(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStatementNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    (!!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      SUPPORTED_STATEMENT_TYPES.has(/** @type {any} */ (value).type))
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isIdentifierNodeOrUnknown(value) {
  return isUnknownAstNode(value) || isIdentifierNode(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isBlockStatementOrUnknown(value) {
  return isNodeTypeOrUnknown(value, 'BlockStatement');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isVariableDeclaratorOrUnknown(value) {
  return isNodeTypeOrUnknown(value, 'VariableDeclarator');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCatchClauseOrUnknown(value) {
  return isNodeTypeOrUnknown(value, 'CatchClause');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isSwitchCaseOrUnknown(value) {
  return isNodeTypeOrUnknown(value, 'SwitchCase');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isTemplateElementNodeOrUnknown(value) {
  return isNodeTypeOrUnknown(value, 'TemplateElement');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isTemplateLiteralNodeOrUnknown(value) {
  return isNodeTypeOrUnknown(value, 'TemplateLiteral');
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isObjectPropertyNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'Property') ||
    isNodeTypeOrUnknown(value, 'SpreadElement')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPatternPropertyNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'Property') ||
    isNodeTypeOrUnknown(value, 'RestElement')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isBindingPatternNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'Identifier') ||
    isNodeTypeOrUnknown(value, 'ObjectPattern') ||
    isNodeTypeOrUnknown(value, 'ArrayPattern') ||
    isNodeTypeOrUnknown(value, 'AssignmentPattern') ||
    isNodeTypeOrUnknown(value, 'RestElement')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPatternNodeOrUnknown(value) {
  return (
    isBindingPatternNodeOrUnknown(value) ||
    isNodeTypeOrUnknown(value, 'MemberExpression')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isAssignmentTargetNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'Identifier') ||
    isNodeTypeOrUnknown(value, 'MemberExpression') ||
    isNodeTypeOrUnknown(value, 'ObjectPattern') ||
    isNodeTypeOrUnknown(value, 'ArrayPattern')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isIdentifierOrMemberNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'Identifier') ||
    isNodeTypeOrUnknown(value, 'MemberExpression')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isForInitializerNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'VariableDeclaration') ||
    isExpressionNodeOrUnknown(value)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isForInOfLeftNodeOrUnknown(value) {
  return (
    isUnknownAstNode(value) ||
    isNodeTypeOrUnknown(value, 'VariableDeclaration') ||
    isAssignmentTargetNodeOrUnknown(value)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCallCalleeNodeOrUnknown(value) {
  return (
    isNodeTypeOrUnknown(value, 'Super') || isExpressionNodeOrUnknown(value)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isArgumentNodeOrUnknown(value) {
  return (
    isExpressionNodeOrUnknown(value) ||
    isNodeTypeOrUnknown(value, 'SpreadElement')
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMemberObjectNodeOrUnknown(value) {
  return (
    isNodeTypeOrUnknown(value, 'Super') || isExpressionNodeOrUnknown(value)
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isObjectLiteralFunction(node) {
  return (
    node.type === 'FunctionExpression' &&
    node.id === null &&
    Array.isArray(node.params) &&
    typeof node.generator === 'boolean' &&
    (node.async === undefined || node.async === false) &&
    node.expression === false &&
    node.body &&
    node.body.type === 'BlockStatement' &&
    Array.isArray(node.body.body)
  );
}

/**
 * @param {any} node
 * @param {string} source
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @param {'binding' | 'assignment' | undefined} patternContext
 * @param {number | undefined} parentIndex
 * @param {boolean} yieldAllowed
 * @param {boolean} superAllowed
 * @param {boolean} superCallAllowed
 * @param {boolean} identifierSourceMatches
 * @returns {void}
 */
function checkUnsupportedEs2015Node(
  node,
  source,
  parent,
  parentKey,
  patternContext,
  parentIndex,
  yieldAllowed,
  superAllowed,
  superCallAllowed,
  identifierSourceMatches,
) {
  if (node.type === 'YieldExpression' && !yieldAllowed) {
    throw unsupportedEs2015Error(
      '`yield` expressions are only valid inside generator bodies',
      node,
    );
  }

  if (node.type === 'Super') {
    const directMember = isDirectSuperMemberObject(node, parent, parentKey);
    const directCall = isDirectSuperCallCallee(node, parent, parentKey);

    if (directMember && superAllowed) {
      // A super-property reference is valid in every method/accessor and its
      // lexically nested arrows, including base-class methods.
    } else if (directCall && superCallAllowed) {
      // A direct call is valid only in a derived constructor and arrows that
      // retain that constructor's execution environment.
    } else if (!superAllowed && !superCallAllowed) {
      throw unsupportedEs2015Error(
        "'super' keyword is only valid inside a method",
        node,
      );
    } else {
      throw unsupportedEs2015Error(
        "'super' keyword is only valid as a property reference or derived constructor call",
        node,
      );
    }
  }

  const typeMessage = unsupportedEs2015Message(
    node,
    parent,
    parentKey,
    patternContext,
    parentIndex,
  );

  if (typeMessage !== undefined) {
    throw unsupportedEs2015Error(typeMessage, node);
  }

  if (node.type === 'Literal' && typeof node.raw === 'string') {
    if (/^0[bBoO]/.test(node.raw)) {
      throw unsupportedEs2015Error(
        'binary and octal numeric literals are not supported',
        node,
      );
    }

    if (typeof node.value === 'string' && hasCodePointEscape(node.raw)) {
      throw unsupportedEs2015Error(
        'unicode code-point escapes (`\\u{...}`) are not supported',
        node,
      );
    }
  }

  if (
    identifierSourceMatches &&
    node.type === 'Identifier' &&
    typeof node.start === 'number' &&
    typeof node.end === 'number' &&
    hasCodePointEscape(source.slice(node.start, node.end))
  ) {
    throw unsupportedEs2015Error(
      'unicode code-point escapes (`\\u{...}`) are not supported',
      node,
    );
  }

  if (
    node.type === 'TemplateElement' &&
    typeof node.value?.raw === 'string' &&
    hasCodePointEscape(node.value.raw)
  ) {
    throw unsupportedEs2015Error(
      'unicode code-point escapes (`\\u{...}`) are not supported',
      node,
    );
  }
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {boolean}
 */
function isDirectSuperMemberObject(node, parent, parentKey) {
  return (
    !!parent &&
    parent.type === 'MemberExpression' &&
    parentKey === 'object' &&
    parent.object === node &&
    typeof parent.computed === 'boolean' &&
    isValidSuperMemberProperty(parent.property, parent.computed)
  );
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {string | number | undefined} parentKey
 * @returns {boolean}
 */
function isDirectSuperCallCallee(node, parent, parentKey) {
  return (
    !!parent &&
    parent.type === 'CallExpression' &&
    parentKey === 'callee' &&
    parent.callee === node &&
    Array.isArray(parent.arguments)
  );
}

/**
 * @param {any} property
 * @param {boolean} computed
 * @returns {boolean}
 */
function isValidSuperMemberProperty(property, computed) {
  if (
    !property ||
    typeof property !== 'object' ||
    typeof property.type !== 'string'
  ) {
    return false;
  }

  if (!computed) {
    return property.type === 'Identifier' && typeof property.name === 'string';
  }

  return (
    !RECOGNIZED_AST_NODE_TYPES.has(property.type) ||
    isSupportedExpressionNode(property)
  );
}

/**
 * Whether `text` contains an ES2015 code-point escape `\u{...}` — a `u{`
 * introduced by an *odd*-length run of backslashes, so the final backslash is
 * an escape introducer rather than an escaped backslash.
 *
 * The naive `text.includes('\\u{')` misreads a string literal like `"\\u{"`,
 * whose source is an escaped backslash (`\\`) followed by the literal
 * characters `u{`: its raw text still contains the three characters `\u{`, but
 * the `u` is not escaped and there is no code-point escape. The upstream
 * `RegExp/unicode_restricted_identity_escape_u` tests, whose pattern strings
 * spell exactly that, are what force this distinction. Counting the preceding
 * backslashes is the same parity test a lexer applies to decide whether a
 * backslash starts an escape sequence.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasCodePointEscape(text) {
  for (
    let index = text.indexOf('u{');
    index !== -1;
    index = text.indexOf('u{', index + 1)
  ) {
    let backslashes = 0;

    for (let scan = index - 1; scan >= 0 && text[scan] === '\\'; scan -= 1) {
      backslashes += 1;
    }

    if (backslashes % 2 === 1) {
      return true;
    }
  }

  return false;
}

/**
 * Builds the guest-facing `SyntaxError` for a rejected unsupported-ES2015
 * construct, carrying the offending node's position through
 * `normalizeSyntaxError` so it reads like any other parse error.
 *
 * @param {string} message
 * @param {any} node
 * @returns {SyntaxError}
 */
function unsupportedEs2015Error(message, node) {
  return normalizeSyntaxError({
    message,
    pos: typeof node.start === 'number' ? node.start : undefined,
    loc: node.loc ? node.loc.start : undefined,
  });
}

/**
 * Turns whatever the parser threw into the host `SyntaxError` the rest of the
 * engine expects from a failed parse, and leaves anything else alone.
 *
 * Running out of host stack counts as a parse failure. Acorn already says so
 * itself — it wraps `parseTopLevel` and re-raises an overflow as `Not enough
 * stack space to parse input` — but it reads the *first* token before that
 * wrapper is installed, so source whose opening token alone is too deep to
 * tokenize (a regular-expression literal, whose pattern Acorn validates with
 * its own recursive descent while tokenizing) still escaped as a host
 * `RangeError`. Applying Acorn's own test to the whole call closes that seam,
 * so depth is reported the same way wherever it is reached: `eval` and
 * `Function` raise a catchable guest `SyntaxError`, and a script handed
 * straight to the embedder fails like any other unparsable script.
 *
 * The conversion is confined to a call into the engine's own parser. No guest
 * code and no evaluator code runs there — only Acorn and the reserved-word
 * plugin above it — so a `RangeError` raised by an engine defect cannot reach
 * this and be relabelled. `ownParser` is what enforces that: an embedder's
 * injected `parse` hook is excluded, because its defects are its own.
 *
 * @param {unknown} error
 * @param {boolean} ownParser Whether the engine's own parser produced `error`.
 * @returns {unknown} The error to throw.
 */
function asParseFailure(error, ownParser) {
  if (ownParser && isStackOverflow(error)) {
    return new SyntaxError('Not enough stack space to parse input');
  }

  if (isSyntaxErrorLike(error)) {
    return normalizeSyntaxError(error);
  }

  return error;
}

/**
 * Matches the message every engine we support uses for an exhausted stack:
 * `Maximum call stack size exceeded` (V8, JavaScriptCore), `too much
 * recursion` (SpiderMonkey). This is the same test Acorn applies in its own
 * `catchStackOverflow`, kept identical on purpose so the two agree.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isStackOverflow(error) {
  return (
    error instanceof RangeError &&
    (/\bstack\b.*\b(exceeded|overflow)\b/i.test(error.message) ||
      /\btoo much recursion\b/i.test(error.message))
  );
}

/**
 * Rejects a `RegularExpressionLiteral` whose pattern or flags fall outside the
 * ES5.1 §15.10.1 grammar, as a parse-time early error.
 *
 * ES5.1 §7.8.5 defines a literal's [[Value]] as the result of
 * `new RegExp(Pattern, Flags)` and then requires that "if the call to new
 * RegExp would generate an error ... the error must be treated as an early
 * error (Clause 16)". Acorn validates the literal against the *host's*
 * grammar, which is Annex B-permissive and post-ES5, so a pattern like `/]/`,
 * `/\a/`, or `/\01/` parses successfully there and would otherwise only be
 * rejected when the literal expression was evaluated — too late, and never at
 * all for a literal in unreachable code.
 *
 * Running it here, in the pass both `parseScript` and `parseEval` funnel
 * through, is what makes scripts, direct and indirect `eval`, and the dynamic
 * `Function` constructor all refuse such a literal before any of the program
 * runs. `src/evaluator/eval.js` and `src/evaluator/dynamic-function.js`
 * convert the host `SyntaxError` this raises into a realm-local guest one, the
 * same way they already do for an outright parse failure.
 *
 * `node.regex` is Acorn's own record of the literal's raw pattern and flag
 * text, which is exactly what §7.8.5 hands to `new RegExp`.
 *
 * @param {any} node
 * @returns {void}
 */
function checkRegularExpressionLiteral(node) {
  if (node.type !== 'Literal' || !node.regex) {
    return;
  }

  try {
    parseFlags(node.regex.flags);
    validatePattern(node.regex.pattern);
  } catch (error) {
    // This validator is a recursive descent over guest text, and it runs
    // after Acorn's own has already accepted the literal. Which of the two
    // runs out of host stack first is a race between two host-dependent
    // thresholds, so without this the embedder inherits a raw `RangeError`
    // for a pattern that is merely too deep — the same seam `asParseFailure`
    // closes for the parser proper, reached one pass later. Depth met while
    // parsing is a failure to parse.
    if (isStackOverflow(error)) {
      throw new SyntaxError('Not enough stack space to parse input');
    }

    if (!(error instanceof RegExpSyntaxError)) {
      throw error;
    }

    throw normalizeSyntaxError({
      message: error.message,
      pos: typeof node.start === 'number' ? node.start : undefined,
      loc: node.loc ? node.loc.start : undefined,
    });
  }
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isSyntaxErrorLike(error) {
  return (
    error instanceof SyntaxError ||
    (!!error &&
      typeof error === 'object' &&
      typeof (/** @type {any} */ (error).message) === 'string' &&
      typeof (/** @type {any} */ (error).pos) === 'number' &&
      !!(/** @type {any} */ (error).loc))
  );
}
