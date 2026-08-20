import { parse } from '../../vendor/acorn/acorn.mjs';

const REGISTRATION_NAMES = new Set(['registerCallable', 'registerConstructor']);

/**
 * @typedef {{ name: string, argument: string }} RegistrationCall
 * @typedef {{
 *   reason: string,
 *   importSource: string | null,
 *   imports: readonly string[],
 *   calls: readonly RegistrationCall[],
 * }} RegistrationAllowance
 */

/**
 * The callable brands are intentionally exported only for construction paths
 * that create engine-owned function objects. Each exception names its reason
 * so widening this table is a review-visible design decision.
 */
export const OBJECT_CONTRACT_ALLOWLIST = Object.freeze({
  registrations: Object.freeze({
    'src/runtime/capabilities.js': Object.freeze({
      reason:
        'registerConstructor grants [[Call]] before adding the [[Construct]] brand.',
      importSource: null,
      imports: Object.freeze([]),
      calls: Object.freeze([
        Object.freeze({ name: 'registerCallable', argument: 'value' }),
      ]),
    }),
    'src/runtime/function-object.js': Object.freeze({
      reason:
        'EngineFunction creates every parsed guest function and class constructor.',
      importSource: './capabilities.js',
      imports: Object.freeze(['registerCallable', 'registerConstructor']),
      calls: Object.freeze([
        Object.freeze({ name: 'registerCallable', argument: 'this' }),
        Object.freeze({ name: 'registerConstructor', argument: 'this' }),
      ]),
    }),
    'src/builtins/shared.js': Object.freeze({
      reason:
        'NativeFunction creates realm-owned native and bound function objects.',
      importSource: '../runtime/capabilities.js',
      imports: Object.freeze(['registerCallable', 'registerConstructor']),
      calls: Object.freeze([
        Object.freeze({ name: 'registerCallable', argument: 'this' }),
        Object.freeze({ name: 'registerConstructor', argument: 'this' }),
      ]),
    }),
    'src/builtins/fundamental.js': Object.freeze({
      reason: '%Function.prototype% has [[Call]] but no [[Construct]].',
      importSource: '../runtime/capabilities.js',
      imports: Object.freeze(['registerCallable']),
      calls: Object.freeze([
        Object.freeze({ name: 'registerCallable', argument: 'this' }),
      ]),
    }),
    'src/runtime/function-realm.js': Object.freeze({
      reason:
        'The abrupt Realm helper is the sole non-function-object internal callable.',
      importSource: './capabilities.js',
      imports: Object.freeze(['registerCallable']),
      calls: Object.freeze([
        Object.freeze({ name: 'registerCallable', argument: 'callable' }),
      ]),
    }),
  }),
  rawHostAccessor: Object.freeze({
    file: 'src/runtime/object.js',
    functionName: 'callAccessor',
    parameter: 'accessor',
    invocation: 'accessor.call()',
    reason:
      'Engine-installed raw getters and setters must remain callable only inside the object model.',
  }),
});

/**
 * @param {ReadonlyMap<string, string> | Record<string, string>} sources
 * @returns {string[]}
 */
export function checkObjectContractSources(sources) {
  /** @type {{ file: string, line: number, message: string }[]} */
  const violations = [];
  const entries =
    sources instanceof Map ? [...sources.entries()] : Object.entries(sources);

  for (const [file, source] of entries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const program = parse(source, {
      ecmaVersion: 2020,
      sourceType: 'module',
      locations: true,
    });
    checkRegistrationSources(file, program, violations);
    checkCapabilityReads(file, program, violations);
    checkRawHostAccessorCalls(file, program, violations);
  }

  return violations
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.message.localeCompare(right.message),
    )
    .map(({ file, line, message }) => `${file}:${line}: ${message}`);
}

/**
 * @param {string} file
 * @param {any} program
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function checkRegistrationSources(file, program, violations) {
  const registrations = /** @type {Record<string, RegistrationAllowance>} */ (
    OBJECT_CONTRACT_ALLOWLIST.registrations
  );
  const allowance = registrations[file];
  /** @type {Map<string, string>} */
  const bindings = new Map();
  /** @type {string[]} */
  const imported = [];

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    const source = String(statement.source.value);

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        REGISTRATION_NAMES.has(specifier.imported.name)
      ) {
        const name = specifier.imported.name;
        imported.push(name);
        bindings.set(specifier.local.name, name);

        if (
          allowance === undefined ||
          allowance.importSource !== source ||
          specifier.local.name !== name ||
          !allowance.imports.includes(name)
        ) {
          addViolation(
            violations,
            file,
            specifier,
            `${name} import is not allowlisted`,
          );
        }
      }
    }
  }

  if (allowance !== undefined) {
    for (const name of allowance.imports) {
      if (!imported.includes(name)) {
        addViolation(
          violations,
          file,
          program,
          `missing ${name} import from ${allowance.importSource}`,
        );
      }
    }
  }

  walk(program, null, (node) => {
    if (node.type === 'VariableDeclarator') {
      addRegistrationAlias(node.id, node.init, bindings);
    } else if (node.type === 'AssignmentExpression') {
      addRegistrationAlias(node.left, node.right, bindings);
    }
  });

  const expected = new Map();
  for (const call of allowance?.calls ?? []) {
    const key = registrationKey(call.name, call.argument);
    expected.set(key, (expected.get(key) ?? 0) + 1);
  }

  walk(program, null, (node) => {
    if (node.type !== 'CallExpression') {
      return;
    }

    const registration = registrationCall(node, bindings);

    if (registration === null) {
      return;
    }

    const key = registrationKey(registration.name, registration.argument);
    const remaining = expected.get(key) ?? 0;

    if (remaining === 0) {
      addViolation(
        violations,
        file,
        node,
        `${registration.name}(${registration.argument}) is not an allowlisted registration call`,
      );
      return;
    }

    expected.set(key, remaining - 1);
  });

  for (const [key, count] of expected) {
    for (let index = 0; index < count; index += 1) {
      addViolation(
        violations,
        file,
        program,
        `missing allowlisted registration call ${key}`,
      );
    }
  }
}

/**
 * @param {string} file
 * @param {any} program
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function checkCapabilityReads(file, program, violations) {
  walk(program, null, (node, parent) => {
    if (
      node.type === 'BinaryExpression' &&
      node.operator === 'in' &&
      node.left.type === 'Literal' &&
      typeof node.left.value === 'string'
    ) {
      const name = node.left.value;

      if (name === '_isConstructor') {
        addViolation(
          violations,
          file,
          node,
          'semantic _isConstructor read is forbidden',
        );
      } else if (name === 'callFunction' || name === 'constructFunction') {
        addViolation(
          violations,
          file,
          node,
          `${name} capability duck typing is forbidden`,
        );
      }
      return;
    }

    if (node.type !== 'MemberExpression') {
      return;
    }

    const name = staticMemberName(node);

    if (name === '_isConstructor' && !isAssignmentTarget(node, parent)) {
      addViolation(
        violations,
        file,
        node,
        'semantic _isConstructor read is forbidden',
      );
      return;
    }

    if (
      (name === 'callFunction' || name === 'constructFunction') &&
      !isAssignmentTarget(node, parent) &&
      !isDirectCallTarget(node, parent)
    ) {
      const message =
        parent?.type === 'UnaryExpression' && parent.operator === 'typeof'
          ? `${name} capability duck typing is forbidden`
          : `semantic ${name} capability read is forbidden`;
      addViolation(violations, file, node, message);
    }
  });
}

/**
 * @param {string} file
 * @param {any} program
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function checkRawHostAccessorCalls(file, program, violations) {
  const allowed = OBJECT_CONTRACT_ALLOWLIST.rawHostAccessor;

  walk(program, null, (node) => {
    if (!isFunctionNode(node)) {
      return;
    }

    const functionName = namedFunction(node);
    const guarded = new Set();

    walkFunctionBody(node, (candidate) => {
      const parameter = rawHostFunctionGuard(candidate);

      if (parameter !== null) {
        guarded.add(parameter);
      }
    });

    for (const parameter of guarded) {
      /** @type {Set<any>} */
      const seen = new Set();

      walkFunctionBody(node, (candidate) => {
        if (candidate.type !== 'CallExpression' || seen.has(candidate)) {
          return;
        }

        const invocation = rawHostInvocation(candidate, parameter);

        if (invocation === null) {
          return;
        }

        seen.add(candidate);

        if (
          file === allowed.file &&
          functionName === allowed.functionName &&
          parameter === allowed.parameter &&
          invocation === allowed.invocation
        ) {
          return;
        }

        addViolation(
          violations,
          file,
          candidate,
          `raw host callback ${invocation} is only allowed in ${allowed.file}#${allowed.functionName}`,
        );
      });
    }
  });
}

/**
 * @param {any} node
 * @param {Map<string, string>} bindings
 * @returns {{ name: string, argument: string } | null}
 */
function registrationCall(node, bindings) {
  const callee = unwrapChain(node.callee);
  /** @type {string | null} */
  let name = null;

  if (callee.type === 'Identifier') {
    name = bindings.get(callee.name) ?? callee.name;
  } else if (callee.type === 'MemberExpression') {
    name = staticMemberName(callee);
  }

  if (name === null || !REGISTRATION_NAMES.has(name)) {
    return null;
  }

  return {
    name,
    argument: registrationArgument(node.arguments),
  };
}

/**
 * @param {any} target
 * @param {any} source
 * @param {Map<string, string>} bindings
 */
function addRegistrationAlias(target, source, bindings) {
  const sourceName =
    source?.type === 'MemberExpression' ? staticMemberName(source) : null;

  if (
    target.type === 'Identifier' &&
    sourceName !== null &&
    REGISTRATION_NAMES.has(sourceName)
  ) {
    bindings.set(target.name, sourceName);
    return;
  }

  if (target.type !== 'ObjectPattern') {
    return;
  }

  for (const property of target.properties) {
    if (property.type !== 'Property') {
      continue;
    }

    const name = propertyName(property.key, property.computed);
    const value =
      property.value.type === 'AssignmentPattern'
        ? property.value.left
        : property.value;

    if (
      name !== null &&
      REGISTRATION_NAMES.has(name) &&
      value.type === 'Identifier'
    ) {
      bindings.set(value.name, name);
    }
  }
}

/**
 * @param {any[]} argumentsList
 * @returns {string}
 */
function registrationArgument(argumentsList) {
  if (argumentsList.length !== 1) {
    return `${argumentsList.length} arguments`;
  }

  const argument = unwrapChain(argumentsList[0]);

  if (argument.type === 'ThisExpression') {
    return 'this';
  }

  if (argument.type === 'Identifier') {
    return argument.name;
  }

  if (
    argument.type === 'ObjectExpression' &&
    argument.properties.length === 0
  ) {
    return '{}';
  }

  return argument.type;
}

/**
 * @param {string} name
 * @param {string} argument
 * @returns {string}
 */
function registrationKey(name, argument) {
  return `${name}(${argument})`;
}

/**
 * @param {any} node
 * @returns {string | null}
 */
function rawHostFunctionGuard(node) {
  if (
    node.type !== 'BinaryExpression' ||
    !['==', '==='].includes(node.operator)
  ) {
    return null;
  }

  return (
    typeofFunctionIdentifier(node.left, node.right) ??
    typeofFunctionIdentifier(node.right, node.left)
  );
}

/**
 * @param {any} typeTest
 * @param {any} functionLiteral
 * @returns {string | null}
 */
function typeofFunctionIdentifier(typeTest, functionLiteral) {
  if (
    typeTest.type !== 'UnaryExpression' ||
    typeTest.operator !== 'typeof' ||
    typeTest.argument.type !== 'Identifier' ||
    functionLiteral.type !== 'Literal' ||
    functionLiteral.value !== 'function'
  ) {
    return null;
  }

  return typeTest.argument.name;
}

/**
 * @param {any} node
 * @param {string} parameter
 * @returns {string | null}
 */
function rawHostInvocation(node, parameter) {
  const callee = unwrapChain(node.callee);

  if (callee.type === 'Identifier' && callee.name === parameter) {
    return `${parameter}()`;
  }

  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === parameter
  ) {
    const method = staticMemberName(callee);

    if (method === 'call' || method === 'apply') {
      return `${parameter}.${method}()`;
    }
  }

  return null;
}

/**
 * @param {any} node
 * @returns {string | null}
 */
function staticMemberName(node) {
  const member = unwrapChain(node);

  if (member.type !== 'MemberExpression') {
    return null;
  }

  return propertyName(member.property, member.computed);
}

/**
 * @param {any} property
 * @param {boolean} computed
 * @returns {string | null}
 */
function propertyName(property, computed) {
  if (!computed && property.type === 'Identifier') {
    return property.name;
  }

  if (property.type === 'Literal' && typeof property.value === 'string') {
    return property.value;
  }

  return null;
}

/**
 * @param {any} node
 * @param {any} parent
 * @returns {boolean}
 */
function isAssignmentTarget(node, parent) {
  return (
    (parent?.type === 'AssignmentExpression' && parent.left === node) ||
    (parent?.type === 'AssignmentPattern' && parent.left === node) ||
    (parent?.type === 'ForInStatement' && parent.left === node) ||
    (parent?.type === 'ForOfStatement' && parent.left === node)
  );
}

/**
 * @param {any} node
 * @param {any} parent
 * @returns {boolean}
 */
function isDirectCallTarget(node, parent) {
  return parent?.type === 'CallExpression' && parent.callee === node;
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
 * @param {any} node
 * @returns {string | null}
 */
function namedFunction(node) {
  return node.id?.type === 'Identifier' ? node.id.name : null;
}

/**
 * @param {any} functionNode
 * @param {(node: any) => void} visit
 */
function walkFunctionBody(functionNode, visit) {
  /** @type {(node: any, root: boolean) => void} */
  const visitNode = (node, root) => {
    if (!isNode(node)) {
      return;
    }

    if (!root && isFunctionNode(node)) {
      return;
    }

    visit(node);

    for (const child of nodeChildren(node)) {
      visitNode(child, false);
    }
  };

  visitNode(functionNode.body, true);
}

/**
 * @param {any} node
 * @param {any} parent
 * @param {(node: any, parent: any) => void} visit
 */
function walk(node, parent, visit) {
  if (!isNode(node)) {
    return;
  }

  visit(node, parent);

  for (const child of nodeChildren(node)) {
    walk(child, node, visit);
  }
}

/**
 * @param {any} node
 * @returns {any[]}
 */
function nodeChildren(node) {
  /** @type {any[]} */
  const children = [];

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') {
      continue;
    }

    if (Array.isArray(value)) {
      children.push(...value.filter(isNode));
    } else if (isNode(value)) {
      children.push(value);
    }
  }

  return children;
}

/**
 * @param {unknown} value
 * @returns {value is { type: string }}
 */
function isNode(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (/** @type {{ type?: unknown }} */ (value).type) === 'string'
  );
}

/**
 * @param {any} node
 * @returns {any}
 */
function unwrapChain(node) {
  return node.type === 'ChainExpression' ? node.expression : node;
}

/**
 * @param {{ file: string, line: number, message: string }[]} violations
 * @param {string} file
 * @param {any} node
 * @param {string} message
 */
function addViolation(violations, file, node, message) {
  violations.push({
    file,
    line: node.loc?.start.line ?? 0,
    message,
  });
}
