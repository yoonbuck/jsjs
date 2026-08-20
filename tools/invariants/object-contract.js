import { parse } from '../../vendor/acorn/acorn.mjs';

const REGISTRATION_NAMES = new Set(['registerCallable', 'registerConstructor']);
const RAW_HOST_CALLBACK_PARAMETERS = new Set(['accessor', 'callback']);

/**
 * @typedef {{ name: string, argument: string }} RegistrationCall
 * @typedef {{ name: string, trusted: boolean, alias: boolean }} RegistrationBinding
 * @typedef {{
 *   functionIdentity: string,
 *   parameter: string,
 *   invocation: string,
 *   reason: string,
 * }} InternalContinuationAllowance
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
  internalContinuations: Object.freeze({
    'src/runtime/agent.js': Object.freeze([
      Object.freeze({
        functionIdentity: 'class:Agent#withActiveExecutionRealm',
        parameter: 'callback',
        invocation: 'callback()',
        reason:
          'Agent execution-Realm stack management runs an engine-controlled continuation.',
      }),
      Object.freeze({
        functionIdentity: 'class:Agent#withNoActiveExecutionRealm',
        parameter: 'callback',
        invocation: 'callback()',
        reason:
          'Agent execution-Realm barriers run an engine-controlled continuation.',
      }),
      Object.freeze({
        functionIdentity: 'class:Agent#withLinkedActiveExecutionRealm',
        parameter: 'callback',
        invocation: 'callback()',
        reason:
          'Cross-Agent execution-Realm linking runs an engine-controlled continuation.',
      }),
    ]),
    'src/runtime/reference.js': Object.freeze([
      Object.freeze({
        functionIdentity: 'function:withLinkedActiveExecutionRealm',
        parameter: 'callback',
        invocation: 'callback()',
        reason:
          'Reference evaluation delegates an engine-controlled continuation to its target Agent.',
      }),
    ]),
    'src/builtins/date.js': Object.freeze([
      Object.freeze({
        functionIdentity: 'function:installDateSetters>binding:set',
        parameter: 'callback',
        invocation: 'callback()',
        reason:
          'Date intrinsic setup closes over an engine-native date operation.',
      }),
    ]),
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
  /** @type {Map<string, RegistrationBinding>} */
  const bindings = new Map();
  /** @type {string[]} */
  const imported = [];

  if (file === 'src/runtime/capabilities.js') {
    bindings.set('registerCallable', {
      name: 'registerCallable',
      trusted: true,
      alias: false,
    });
  }

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
        bindings.set(specifier.local.name, {
          name,
          trusted: true,
          alias: false,
        });

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

    if (!registration.trusted || registration.alias) {
      addViolation(
        violations,
        file,
        node,
        `${registration.name}(${registration.argument}) is not an allowlisted registration call`,
      );
      return;
    }

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
    if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (property.type !== 'Property') {
          continue;
        }

        addCapabilityReadViolation(
          violations,
          file,
          property,
          propertyName(property.key, property.computed),
        );
      }
      return;
    }

    if (
      node.type === 'BinaryExpression' &&
      node.operator === 'in' &&
      node.left.type === 'Literal' &&
      typeof node.left.value === 'string'
    ) {
      const name = node.left.value;

      addCapabilityReadViolation(violations, file, node, name, true);
      return;
    }

    if (node.type !== 'MemberExpression') {
      return;
    }

    const name = staticMemberName(node);

    if (name === '_isConstructor' && !isAssignmentTarget(node, parent)) {
      addCapabilityReadViolation(violations, file, node, name);
      return;
    }

    if (
      (name === 'callFunction' || name === 'constructFunction') &&
      !isAssignmentTarget(node, parent) &&
      !isDirectCallTarget(node, parent)
    ) {
      addCapabilityReadViolation(
        violations,
        file,
        node,
        name,
        parent?.type === 'UnaryExpression' && parent.operator === 'typeof',
      );
    }
  });
}

/**
 * @param {{ file: string, line: number, message: string }[]} violations
 * @param {string} file
 * @param {any} node
 * @param {string | null} name
 * @param {boolean} [duckTyping=false]
 */
function addCapabilityReadViolation(
  violations,
  file,
  node,
  name,
  duckTyping = false,
) {
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
      duckTyping
        ? `${name} capability duck typing is forbidden`
        : `semantic ${name} capability read is forbidden`,
    );
  }
}

/**
 * @param {string} file
 * @param {any} program
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function checkRawHostAccessorCalls(file, program, violations) {
  const allowed = OBJECT_CONTRACT_ALLOWLIST.rawHostAccessor;
  /** @type {Map<any, any>} */
  const parents = new Map();

  walk(program, null, (node, parent) => {
    parents.set(node, parent);
  });

  walk(program, null, (node, parent) => {
    if (!isFunctionNode(node)) {
      return;
    }

    const functionIdentity = rawHostFunctionIdentity(node, parent, parents);
    const callbacks = rawHostCallbackParameters(node);

    if (callbacks.size === 0) {
      return;
    }

    const scope = createRawHostCallbackScope(null);

    for (const parameter of node.params) {
      declareRawHostCallbackPattern(scope, parameter, null, true);
    }

    for (const parameter of callbacks) {
      scope.bindings.set(parameter, {
        functionIdentity,
        parameter,
      });
    }

    predeclareRawHostCallbackVars(node.body, scope);
    walkRawHostCallbackParameterInitializers(
      node.params,
      scope,
      file,
      allowed,
      violations,
    );
    walkRawHostCallbackNode(node.body, scope, file, allowed, violations);
  });
}

/**
 * @param {any} node
 * @param {Map<string, RegistrationBinding>} bindings
 * @returns {{
 *   name: string,
 *   argument: string,
 *   trusted: boolean,
 *   alias: boolean,
 * } | null}
 */
function registrationCall(node, bindings) {
  const callee = unwrapChain(node.callee);
  /** @type {RegistrationBinding | null} */
  let binding = null;

  if (callee.type === 'Identifier') {
    binding = bindings.get(callee.name) ?? null;

    if (binding === null && REGISTRATION_NAMES.has(callee.name)) {
      binding = {
        name: callee.name,
        trusted: false,
        alias: false,
      };
    }
  } else if (callee.type === 'MemberExpression') {
    const name = staticMemberName(callee);

    if (name !== null && REGISTRATION_NAMES.has(name)) {
      binding = {
        name,
        trusted: false,
        alias: false,
      };
    }
  }

  if (binding === null) {
    return null;
  }

  return {
    name: binding.name,
    argument: registrationArgument(node.arguments),
    trusted: binding.trusted,
    alias: binding.alias,
  };
}

/**
 * @param {any} target
 * @param {any} source
 * @param {Map<string, RegistrationBinding>} bindings
 */
function addRegistrationAlias(target, source, bindings) {
  const sourceBinding =
    source?.type === 'Identifier' ? (bindings.get(source.name) ?? null) : null;
  const sourceName =
    sourceBinding?.name ??
    (source?.type === 'MemberExpression' ? staticMemberName(source) : null);

  if (
    target.type === 'Identifier' &&
    sourceName !== null &&
    REGISTRATION_NAMES.has(sourceName)
  ) {
    bindings.set(target.name, {
      name: sourceName,
      trusted: sourceBinding?.trusted ?? false,
      alias: true,
    });
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
      bindings.set(value.name, {
        name,
        trusted: false,
        alias: true,
      });
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
 * @param {any} scope
 * @returns {{ binding: any, invocation: string } | null}
 */
function rawHostInvocation(node, scope) {
  const callee = unwrapChain(node.callee);

  if (callee.type === 'Identifier') {
    const binding = rawHostCallbackBinding(scope, callee.name);

    return binding === null
      ? null
      : { binding, invocation: `${callee.name}()` };
  }

  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier'
  ) {
    const binding = rawHostCallbackBinding(scope, callee.object.name);
    const method = staticMemberName(callee);

    if (binding !== null && (method === 'call' || method === 'apply')) {
      return {
        binding,
        invocation: `${callee.object.name}.${method}()`,
      };
    }
  }

  return null;
}

/**
 * @param {any} scope
 * @param {string} name
 * @returns {any | null}
 */
function rawHostCallbackBinding(scope, name) {
  const bindingScope = rawHostCallbackBindingScope(scope, name);
  return bindingScope === null ? null : bindingScope.bindings.get(name);
}

/**
 * @param {any} scope
 * @param {string} name
 * @returns {any | null}
 */
function rawHostCallbackBindingScope(scope, name) {
  let current = scope;

  while (current !== null) {
    if (current.bindings.has(name)) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

/**
 * @param {any} parent
 * @param {any | null} [functionScope]
 * @returns {any}
 */
function createRawHostCallbackScope(parent, functionScope = null) {
  const scope = {
    parent,
    functionScope: /** @type {any} */ (null),
    bindings: /** @type {Map<string, any>} */ (new Map()),
  };
  scope.functionScope = functionScope ?? scope;
  return scope;
}

/**
 * @param {any} scope
 * @param {any} pattern
 * @param {any | null} binding
 * @param {boolean} [replace=false]
 */
function declareRawHostCallbackPattern(
  scope,
  pattern,
  binding,
  replace = false,
) {
  for (const name of rawHostPatternNames(pattern)) {
    if (replace || !scope.bindings.has(name)) {
      scope.bindings.set(name, binding);
    }
  }
}

/**
 * @param {any} pattern
 * @returns {string[]}
 */
function rawHostPatternNames(pattern) {
  const value = pattern?.type === 'AssignmentPattern' ? pattern.left : pattern;

  if (value?.type === 'Identifier') {
    return [value.name];
  }

  if (value?.type === 'RestElement') {
    return rawHostPatternNames(value.argument);
  }

  if (value?.type === 'ObjectPattern') {
    /** @type {string[]} */
    const names = [];

    for (const property of /** @type {any[]} */ (value.properties)) {
      if (property.type === 'Property') {
        names.push(...rawHostPatternNames(property.value));
      } else if (property.type === 'RestElement') {
        names.push(...rawHostPatternNames(property.argument));
      }
    }

    return names;
  }

  if (value?.type === 'ArrayPattern') {
    /** @type {string[]} */
    const names = [];

    for (const element of /** @type {any[]} */ (value.elements)) {
      names.push(...rawHostPatternNames(element));
    }

    return names;
  }

  return [];
}

/**
 * @param {any} node
 * @returns {Set<string>}
 */
function rawHostCallbackParameters(node) {
  /** @type {Set<string>} */
  const callbacks = new Set();

  for (const parameter of node.params) {
    const name = patternIdentifierName(parameter);

    if (name !== null && RAW_HOST_CALLBACK_PARAMETERS.has(name)) {
      callbacks.add(name);
    }
  }

  return callbacks;
}

/**
 * @param {any} node
 * @param {any} functionScope
 */
function predeclareRawHostCallbackVars(node, functionScope) {
  /** @param {any} candidate */
  const visit = (candidate) => {
    if (!isNode(candidate) || isFunctionNode(candidate)) {
      return;
    }

    const value = /** @type {any} */ (candidate);

    if (value.type === 'VariableDeclaration' && value.kind === 'var') {
      for (const declaration of value.declarations) {
        declareRawHostCallbackPattern(functionScope, declaration.id, null);
      }
    }

    for (const child of nodeChildren(value)) {
      visit(child);
    }
  };

  visit(node);
}

/**
 * @param {any[]} statements
 * @param {any} scope
 */
function predeclareRawHostCallbackBlockBindings(statements, scope) {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
      for (const declaration of statement.declarations) {
        declareRawHostCallbackPattern(scope, declaration.id, null);
      }
    } else if (
      (statement.type === 'FunctionDeclaration' ||
        statement.type === 'ClassDeclaration') &&
      statement.id?.type === 'Identifier'
    ) {
      scope.bindings.set(statement.id.name, null);
    }
  }
}

/**
 * @param {any[]} parameters
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackParameterInitializers(
  parameters,
  scope,
  file,
  allowed,
  violations,
) {
  for (const parameter of parameters) {
    walkRawHostCallbackPatternInitializers(
      parameter,
      scope,
      file,
      allowed,
      violations,
    );
  }
}

/**
 * @param {any} pattern
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackPatternInitializers(
  pattern,
  scope,
  file,
  allowed,
  violations,
) {
  if (pattern?.type === 'AssignmentPattern') {
    walkRawHostCallbackNode(pattern.right, scope, file, allowed, violations);
    propagateRawHostCallbackBinding(
      scope,
      pattern.left,
      rawHostCallbackExpressionBinding(pattern.right, scope),
    );
    walkRawHostCallbackPatternInitializers(
      pattern.left,
      scope,
      file,
      allowed,
      violations,
    );
    return;
  }

  if (pattern?.type === 'RestElement') {
    walkRawHostCallbackPatternInitializers(
      pattern.argument,
      scope,
      file,
      allowed,
      violations,
    );
    return;
  }

  if (pattern?.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      if (property.type === 'Property') {
        walkRawHostCallbackPatternInitializers(
          property.value,
          scope,
          file,
          allowed,
          violations,
        );
      } else if (property.type === 'RestElement') {
        walkRawHostCallbackPatternInitializers(
          property.argument,
          scope,
          file,
          allowed,
          violations,
        );
      }
    }
  } else if (pattern?.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      walkRawHostCallbackPatternInitializers(
        element,
        scope,
        file,
        allowed,
        violations,
      );
    }
  }
}

/**
 * @param {any} node
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackNode(node, scope, file, allowed, violations) {
  if (!isNode(node)) {
    return;
  }

  const candidate = /** @type {any} */ (node);

  if (isFunctionNode(candidate)) {
    walkCapturedRawHostCallbackFunction(
      candidate,
      scope,
      file,
      allowed,
      violations,
    );
    return;
  }

  if (candidate.type === 'BlockStatement') {
    walkRawHostCallbackBlock(candidate, scope, file, allowed, violations);
    return;
  }

  if (candidate.type === 'CatchClause') {
    const catchScope = createRawHostCallbackScope(scope, scope.functionScope);
    declareRawHostCallbackPattern(catchScope, candidate.param, null, true);
    walkRawHostCallbackNode(
      candidate.body,
      catchScope,
      file,
      allowed,
      violations,
    );
    return;
  }

  if (
    candidate.type === 'ClassExpression' &&
    candidate.id?.type === 'Identifier'
  ) {
    if (candidate.superClass !== null) {
      walkRawHostCallbackNode(
        candidate.superClass,
        scope,
        file,
        allowed,
        violations,
      );
    }

    const classScope = createRawHostCallbackScope(scope, scope.functionScope);
    classScope.bindings.set(candidate.id.name, null);
    walkRawHostCallbackNode(
      candidate.body,
      classScope,
      file,
      allowed,
      violations,
    );
    return;
  }

  if (candidate.type === 'VariableDeclaration') {
    walkRawHostCallbackVariableDeclaration(
      candidate,
      scope,
      file,
      allowed,
      violations,
    );
    return;
  }

  if (candidate.type === 'AssignmentExpression') {
    walkRawHostCallbackAssignment(candidate, scope, file, allowed, violations);
    return;
  }

  if (
    candidate.type === 'ForStatement' ||
    candidate.type === 'ForInStatement' ||
    candidate.type === 'ForOfStatement'
  ) {
    walkRawHostCallbackLoop(candidate, scope, file, allowed, violations);
    return;
  }

  if (candidate.type === 'CallExpression') {
    reportRawHostCallbackInvocation(
      candidate,
      scope,
      file,
      allowed,
      violations,
    );
  }

  for (const child of nodeChildren(candidate)) {
    walkRawHostCallbackNode(child, scope, file, allowed, violations);
  }
}

/**
 * @param {any} block
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackBlock(block, scope, file, allowed, violations) {
  const blockScope = createRawHostCallbackScope(scope, scope.functionScope);
  predeclareRawHostCallbackBlockBindings(block.body, blockScope);

  for (const statement of block.body) {
    walkRawHostCallbackNode(statement, blockScope, file, allowed, violations);
  }
}

/**
 * @param {any} node
 * @param {any} parentScope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkCapturedRawHostCallbackFunction(
  node,
  parentScope,
  file,
  allowed,
  violations,
) {
  const functionScope = createRawHostCallbackScope(parentScope);

  if (node.id?.type === 'Identifier') {
    functionScope.bindings.set(node.id.name, null);
  }

  for (const parameter of node.params) {
    declareRawHostCallbackPattern(functionScope, parameter, null, true);
  }

  predeclareRawHostCallbackVars(node.body, functionScope);
  walkRawHostCallbackParameterInitializers(
    node.params,
    functionScope,
    file,
    allowed,
    violations,
  );
  walkRawHostCallbackNode(node.body, functionScope, file, allowed, violations);
}

/**
 * @param {any} declaration
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackVariableDeclaration(
  declaration,
  scope,
  file,
  allowed,
  violations,
) {
  const declarationScope =
    declaration.kind === 'var' ? scope.functionScope : scope;

  for (const declarator of declaration.declarations) {
    if (declarator.init !== null) {
      walkRawHostCallbackNode(
        declarator.init,
        scope,
        file,
        allowed,
        violations,
      );
    }

    const binding = rawHostCallbackExpressionBinding(declarator.init, scope);

    if (declaration.kind === 'var') {
      propagateRawHostCallbackBinding(declarationScope, declarator.id, binding);
    } else {
      declareRawHostCallbackPattern(
        declarationScope,
        declarator.id,
        binding,
        true,
      );
    }
  }
}

/**
 * @param {any} node
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackAssignment(node, scope, file, allowed, violations) {
  walkRawHostCallbackNode(node.right, scope, file, allowed, violations);

  if (node.left.type !== 'Identifier') {
    walkRawHostCallbackNode(node.left, scope, file, allowed, violations);
    return;
  }

  const bindingScope = rawHostCallbackBindingScope(scope, node.left.name);

  const binding = rawHostCallbackExpressionBinding(node.right, scope);

  if (binding === null) {
    return;
  }

  const targetScope = bindingScope ?? scope.functionScope;

  if (
    !targetScope.bindings.has(node.left.name) ||
    targetScope.bindings.get(node.left.name) === null
  ) {
    targetScope.bindings.set(node.left.name, binding);
  }
}

/**
 * @param {any} node
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function walkRawHostCallbackLoop(node, scope, file, allowed, violations) {
  const declaration = node.type === 'ForStatement' ? node.init : node.left;
  const loopScope =
    declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var'
      ? createRawHostCallbackScope(scope, scope.functionScope)
      : scope;

  if (loopScope !== scope) {
    for (const declarator of declaration.declarations) {
      declareRawHostCallbackPattern(loopScope, declarator.id, null, true);
    }
  }

  for (const child of nodeChildren(node)) {
    walkRawHostCallbackNode(child, loopScope, file, allowed, violations);
  }
}

/**
 * @param {any} node
 * @param {any} scope
 * @returns {any | null}
 */
function rawHostCallbackExpressionBinding(node, scope) {
  const expression = node === null ? null : unwrapChain(node);
  return expression?.type === 'Identifier'
    ? rawHostCallbackBinding(scope, expression.name)
    : null;
}

/**
 * Reassignment cannot erase raw-callback provenance: a branch-sensitive scan
 * could otherwise hide a later invocation behind a conditional write.
 *
 * @param {any} scope
 * @param {any} pattern
 * @param {any | null} binding
 */
function propagateRawHostCallbackBinding(scope, pattern, binding) {
  if (binding === null) {
    return;
  }

  for (const name of rawHostPatternNames(pattern)) {
    if (scope.bindings.get(name) === null) {
      scope.bindings.set(name, binding);
    }
  }
}

/**
 * @param {any} node
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string }[]} violations
 */
function reportRawHostCallbackInvocation(
  node,
  scope,
  file,
  allowed,
  violations,
) {
  const invocation = rawHostInvocation(node, scope);

  if (
    invocation === null ||
    isRawHostAccessorInvocation(
      file,
      invocation.binding.functionIdentity,
      invocation.binding.parameter,
      invocation.invocation,
      allowed,
    ) ||
    isInternalContinuation(
      file,
      invocation.binding.functionIdentity,
      invocation.binding.parameter,
      invocation.invocation,
    )
  ) {
    return;
  }

  addViolation(
    violations,
    file,
    node,
    `raw host callback ${invocation.invocation} is only allowed in ${allowed.file}#${allowed.functionName}`,
  );
}

/**
 * @param {string} file
 * @param {string | null} functionIdentity
 * @param {string} parameter
 * @param {string} invocation
 * @param {{
 *   file: string,
 *   functionName: string,
 *   parameter: string,
 *   invocation: string,
 * }} allowed
 * @returns {boolean}
 */
function isRawHostAccessorInvocation(
  file,
  functionIdentity,
  parameter,
  invocation,
  allowed,
) {
  return (
    file === allowed.file &&
    functionIdentity === `function:${allowed.functionName}` &&
    parameter === allowed.parameter &&
    invocation === allowed.invocation
  );
}

/**
 * These continuation callbacks never hold a descriptor or guest value: their
 * enclosing engine operation creates and consumes them synchronously. They are
 * intentionally distinct from the raw accessor boundary above.
 *
 * @param {string} file
 * @param {string | null} functionIdentity
 * @param {string} parameter
 * @param {string} invocation
 * @returns {boolean}
 */
function isInternalContinuation(file, functionIdentity, parameter, invocation) {
  const continuations =
    /** @type {Record<string, readonly InternalContinuationAllowance[]>} */ (
      OBJECT_CONTRACT_ALLOWLIST.internalContinuations
    )[file];

  return (
    continuations?.some(
      (continuation) =>
        continuation.functionIdentity === functionIdentity &&
        continuation.parameter === parameter &&
        continuation.invocation === invocation,
    ) ?? false
  );
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
function patternIdentifierName(node) {
  const pattern = node.type === 'AssignmentPattern' ? node.left : node;

  return pattern.type === 'Identifier' ? pattern.name : null;
}

/**
 * @param {any} node
 * @param {any} parent
 * @returns {string | null}
 */
function namedFunction(node, parent) {
  if (node.id?.type === 'Identifier') {
    return node.id.name;
  }

  if (parent?.type === 'MethodDefinition') {
    return propertyName(parent.key, parent.computed);
  }

  return parent?.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier'
    ? parent.id.name
    : null;
}

/**
 * The allowlist is tied to a declaration's lexical owner, not merely its
 * spelling, so another class or nested helper cannot inherit a continuation
 * exception by reusing one of these names.
 *
 * @param {any} node
 * @param {any} parent
 * @param {Map<any, any>} parents
 * @returns {string | null}
 */
function rawHostFunctionIdentity(node, parent, parents) {
  const name = namedFunction(node, parent);

  if (name === null) {
    return null;
  }

  if (parent?.type === 'MethodDefinition') {
    const classBody = parents.get(parent);
    const classDeclaration = parents.get(classBody);

    if (
      classDeclaration?.type === 'ClassDeclaration' &&
      classDeclaration.id?.type === 'Identifier' &&
      isTopLevelDeclaration(classDeclaration, parents)
    ) {
      return `class:${classDeclaration.id.name}#${name}`;
    }

    return null;
  }

  if (parent?.type === 'VariableDeclarator') {
    const owner = enclosingRawHostFunctionIdentity(parent, parents);
    return owner === null ? null : `${owner}>binding:${name}`;
  }

  return node.type === 'FunctionDeclaration' &&
    isTopLevelDeclaration(node, parents)
    ? `function:${name}`
    : null;
}

/**
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {string | null}
 */
function enclosingRawHostFunctionIdentity(node, parents) {
  let current = parents.get(node);

  while (current !== null && current !== undefined) {
    if (isFunctionNode(current)) {
      return rawHostFunctionIdentity(current, parents.get(current), parents);
    }
    current = parents.get(current);
  }

  return null;
}

/**
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {boolean}
 */
function isTopLevelDeclaration(node, parents) {
  let parent = parents.get(node);

  while (
    parent?.type === 'ExportNamedDeclaration' ||
    parent?.type === 'ExportDefaultDeclaration'
  ) {
    parent = parents.get(parent);
  }

  return parent?.type === 'Program';
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
