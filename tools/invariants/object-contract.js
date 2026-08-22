import { parse } from '../../vendor/acorn/acorn.mjs';

const REGISTRATION_NAMES = new Set(['registerCallable', 'registerConstructor']);
const RAW_HOST_CALLBACK_PARAMETERS = new Set(['accessor', 'callback']);
const ORDINARY_STORAGE_SLOTS = new Set([
  '_prototype',
  '_extensible',
  '_properties',
]);
const LEGACY_OBJECT_METHODS = new Set([
  'getPrototype',
  'getProperty',
  'canPut',
  'put',
]);
const TABLE6_DISPATCH_METHODS = new Set(['callFunction', 'constructFunction']);

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
  ordinaryStorage: Object.freeze({
    file: 'src/runtime/object.js',
    functions: Object.freeze({
      _prototype: Object.freeze([
        'class:EngineObject#constructor',
        'function:ordinaryGetPrototypeOf',
        'function:ordinarySetPrototypeOf',
      ]),
      _extensible: Object.freeze([
        'class:EngineObject#constructor',
        'function:ordinaryIsExtensible',
        'function:ordinaryPreventExtensions',
      ]),
      _properties: Object.freeze([
        'class:EngineObject#constructor',
        'function:ordinaryOwnPropertyKeys',
        'function:ordinaryPeekOwnDescriptor',
        'function:ordinarySetOwnDescriptor',
        'function:ordinaryDeleteStoredProperty',
      ]),
    }),
  }),
  methodIdentity: Object.freeze({
    'src/runtime/object.js': Object.freeze([
      Object.freeze({
        functionIdentity: 'function:ordinarySetPrototypeOf',
        method: 'getPrototypeOf',
        reason: 'OrdinarySetPrototypeOf detects an overridden prototype seam.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryGet',
        method: 'get',
        reason: 'OrdinaryGet stops at an overridden [[Get]] seam.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryGet',
        method: 'getOwnProperty',
        reason: 'OrdinaryGet uses its audited own-descriptor fast path.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryGet',
        method: 'getPrototypeOf',
        reason: 'OrdinaryGet uses its audited prototype fast path.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryHasProperty',
        method: 'hasProperty',
        reason:
          'OrdinaryHasProperty stops at an overridden [[HasProperty]] seam.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryHasProperty',
        method: 'getOwnProperty',
        reason:
          'OrdinaryHasProperty uses its audited own-descriptor fast path.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryHasProperty',
        method: 'getPrototypeOf',
        reason: 'OrdinaryHasProperty uses its audited prototype fast path.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinarySet',
        method: 'set',
        reason: 'OrdinarySet stops at an overridden [[Set]] seam.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinarySet',
        method: 'getOwnProperty',
        reason: 'OrdinarySet uses its audited own-descriptor fast path.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinarySet',
        method: 'getPrototypeOf',
        reason: 'OrdinarySet uses its audited prototype fast path.',
      }),
      Object.freeze({
        functionIdentity: 'function:ordinaryDefineOwnProperty',
        method: 'getOwnProperty',
        reason: 'OrdinaryDefineOwnProperty guards its value-only fast path.',
      }),
    ]),
    'src/runtime/iterator-object.js': Object.freeze([
      Object.freeze({
        functionIdentity: 'function:snapshotForInCandidates',
        method: 'enumerate',
        reason:
          'ForInIterator detects the first overridden [[Enumerate]] boundary before consuming its public iterator protocol.',
      }),
    ]),
  }),
  classNameFallback: Object.freeze({
    file: 'src/builtins/object.js',
    reason:
      'Object.prototype.toString is the sole diagnostic class-tag fallback.',
  }),
  table6Terminals: Object.freeze([
    Object.freeze({
      file: 'src/runtime/capabilities.js',
      functionIdentity: 'function:callCallable',
      receiver: 'value',
      parameterIndex: 0,
      method: 'callFunction',
      reason:
        'Branded [[Call]] dispatch is centralized after the capability check.',
    }),
    Object.freeze({
      file: 'src/runtime/capabilities.js',
      functionIdentity: 'function:constructCallable',
      receiver: 'value',
      parameterIndex: 0,
      method: 'constructFunction',
      reason:
        'Branded [[Construct]] dispatch is centralized after the capability check.',
    }),
    Object.freeze({
      file: 'src/runtime/object.js',
      functionIdentity: 'function:callAccessor',
      receiver: 'accessor',
      parameterIndex: 0,
      method: 'callFunction',
      reason:
        'Engine-installed accessor functions dispatch after the callable capability check.',
    }),
  ]),
});

/**
 * @param {ReadonlyMap<string, string> | Record<string, string>} sources
 * @returns {string[]}
 */
export function checkObjectContractSources(sources) {
  const entries =
    sources instanceof Map ? [...sources.entries()] : Object.entries(sources);
  /** @type {{
   *   file: string,
   *   line: number,
   *   token: string,
   *   rule: string,
   * }[]} */
  const bypasses = [];

  for (const [file, source] of entries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    bypasses.push(...findObjectContractBypasses(file, source));
  }

  return bypasses
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.rule.localeCompare(right.rule),
    )
    .map(({ file, line, rule }) => `${file}:${line}: ${rule}`);
}

/**
 * Finds contract bypasses in one production source file.
 *
 * @param {string} file
 * @param {string} source
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} [allowlist]
 * @returns {{ file: string, line: number, token: string, rule: string }[]}
 */
export function findObjectContractBypasses(
  file,
  source,
  allowlist = OBJECT_CONTRACT_ALLOWLIST,
) {
  const program = parse(source, {
    ecmaVersion: 2020,
    sourceType: 'module',
    locations: true,
  });
  /** @type {Map<any, any>} */
  const parents = new Map();
  /** @type {{ file: string, line: number, message: string, token: string }[]} */
  const violations = [];
  walk(program, null, (node, parent) => {
    parents.set(node, parent);
  });
  checkRegistrationSources(file, program, violations, allowlist);
  checkCapabilityReads(file, program, violations, parents);
  checkRawHostAccessorCalls(file, program, violations, allowlist);
  checkOrdinaryStorageSlots(file, program, parents, violations, allowlist);
  checkLegacyObjectMethods(file, program, parents, violations);
  checkMethodIdentityDispatch(file, program, parents, violations, allowlist);
  checkClassNameDispatch(file, program, parents, violations, allowlist);
  checkTable6Terminals(file, program, parents, violations, allowlist);

  return violations
    .sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.message.localeCompare(right.message),
    )
    .map(({ file: violationFile, line, token, message }) => ({
      file: violationFile,
      line,
      token,
      rule: message,
    }));
}

/**
 * @param {string} file
 * @param {any} program
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 */
function checkRegistrationSources(file, program, violations, allowlist) {
  const registrations = /** @type {Record<string, RegistrationAllowance>} */ (
    allowlist.registrations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {Map<any, any>} parents
 */
function checkCapabilityReads(file, program, violations, parents) {
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
          staticPatternPropertyName(property, parents),
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

    const name = staticMemberName(node, parents);

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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {Map<any, any>} parents
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 */
function checkOrdinaryStorageSlots(
  file,
  program,
  parents,
  violations,
  allowlist,
) {
  walk(program, null, (node) => {
    if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (property.type !== 'Property') {
          continue;
        }

        const slot = staticPatternPropertyName(property, parents);

        if (
          slot === null ||
          !ORDINARY_STORAGE_SLOTS.has(slot) ||
          isAllowedOrdinaryStorageSlot(
            file,
            slot,
            enclosingRawHostFunctionIdentity(property, parents),
            allowlist,
          )
        ) {
          continue;
        }

        addViolation(
          violations,
          file,
          property,
          `ordinary storage slot ${slot} is only allowed in src/runtime/object.js ordinary helpers`,
          slot,
        );
      }
      return;
    }

    if (node.type !== 'MemberExpression') {
      return;
    }

    const slot = staticMemberName(node, parents);

    if (
      slot === null ||
      !ORDINARY_STORAGE_SLOTS.has(slot) ||
      isAllowedOrdinaryStorageSlot(
        file,
        slot,
        enclosingRawHostFunctionIdentity(node, parents),
        allowlist,
      )
    ) {
      return;
    }

    addViolation(
      violations,
      file,
      node,
      `ordinary storage slot ${slot} is only allowed in src/runtime/object.js ordinary helpers`,
      slot,
    );
  });
}

/**
 * @param {string} file
 * @param {string} slot
 * @param {string | null} functionIdentity
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 * @returns {boolean}
 */
function isAllowedOrdinaryStorageSlot(file, slot, functionIdentity, allowlist) {
  const ordinaryStorage = allowlist.ordinaryStorage;
  const slotFunctions = /** @type {Record<string, readonly string[]>} */ (
    ordinaryStorage.functions
  );

  return (
    file === ordinaryStorage.file &&
    functionIdentity !== null &&
    slotFunctions[slot]?.includes(functionIdentity) === true
  );
}

/**
 * @param {string} file
 * @param {any} program
 * @param {Map<any, any>} parents
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 */
function checkLegacyObjectMethods(file, program, parents, violations) {
  walk(program, null, (node) => {
    if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (property.type !== 'Property') {
          continue;
        }

        const method = staticPatternPropertyName(property, parents);

        if (method !== null && LEGACY_OBJECT_METHODS.has(method)) {
          addViolation(
            violations,
            file,
            property,
            `legacy object method ${method} is forbidden`,
            method,
          );
        }
      }
      return;
    }

    if (node.type !== 'MemberExpression') {
      return;
    }

    const method = staticMemberName(node, parents);

    if (method === null || !LEGACY_OBJECT_METHODS.has(method)) {
      return;
    }

    addViolation(
      violations,
      file,
      node,
      `legacy object method ${method} is forbidden`,
      method,
    );
  });
}

/**
 * @param {string} file
 * @param {any} program
 * @param {Map<any, any>} parents
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 */
function checkMethodIdentityDispatch(
  file,
  program,
  parents,
  violations,
  allowlist,
) {
  walk(program, null, (node, parent) => {
    if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (
          property.type === 'Property' &&
          staticPatternPropertyName(property, parents) === 'prototype' &&
          isEngineObjectPrototypeDestructure(property, parents)
        ) {
          addViolation(
            violations,
            file,
            property,
            'EngineObject.prototype aliases are forbidden outside audited method identity comparisons',
            'EngineObject.prototype',
          );
        }
      }
      return;
    }

    if (isEngineObjectPrototype(node, parents)) {
      if (parent?.type === 'MemberExpression' && parent.object === node) {
        return;
      }

      addViolation(
        violations,
        file,
        node,
        'EngineObject.prototype aliases are forbidden outside audited method identity comparisons',
        'EngineObject.prototype',
      );
      return;
    }

    const objectIsComparison =
      parent?.type === 'CallExpression' &&
      parent.arguments.includes(node) &&
      isObjectIsCall(parent);

    if (node.type !== 'MemberExpression') {
      return;
    }

    const method = engineObjectPrototypeMethod(node, parents);

    if (
      method === null ||
      ((objectIsComparison ||
        (parent?.type === 'BinaryExpression' &&
          ['===', '!==', '==', '!='].includes(parent.operator))) &&
        isAllowedMethodIdentity(
          file,
          method,
          enclosingRawHostFunctionIdentity(node, parents),
          allowlist,
        ))
    ) {
      return;
    }

    addViolation(
      violations,
      file,
      node,
      'EngineObject.prototype method identity dispatch is only allowed in audited ordinary helpers',
      `EngineObject.prototype.${method}`,
    );
  });
}

/**
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {string | null}
 */
function engineObjectPrototypeMethod(node, parents) {
  const member = unwrapChain(node);

  if (member.type !== 'MemberExpression') {
    return null;
  }

  const prototype = unwrapChain(member.object);

  if (!isEngineObjectPrototype(prototype, parents)) {
    return null;
  }

  return staticMemberName(member, parents);
}

/**
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {boolean}
 */
function isEngineObjectPrototype(node, parents) {
  const member = unwrapChain(node);

  return (
    member.type === 'MemberExpression' &&
    member.object.type === 'Identifier' &&
    member.object.name === 'EngineObject' &&
    staticMemberName(member, parents) === 'prototype'
  );
}

/**
 * @param {any} property
 * @param {Map<any, any>} parents
 * @returns {boolean}
 */
function isEngineObjectPrototypeDestructure(property, parents) {
  const pattern = parents.get(property);
  const declaration = parents.get(pattern);

  return (
    pattern?.type === 'ObjectPattern' &&
    declaration?.type === 'VariableDeclarator' &&
    declaration.id === pattern &&
    declaration.init?.type === 'Identifier' &&
    declaration.init.name === 'EngineObject'
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isObjectIsCall(node) {
  const callee = unwrapChain(node.callee);

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Object' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'is'
  );
}

/**
 * @param {string} file
 * @param {string} method
 * @param {string | null} functionIdentity
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 * @returns {boolean}
 */
function isAllowedMethodIdentity(file, method, functionIdentity, allowlist) {
  const identities = /** @type {Record<
    string,
    readonly { functionIdentity: string, method: string }[]
  >} */ (allowlist.methodIdentity);
  const allowances = identities[file] ?? [];

  return allowances.some(
    (allowance) =>
      allowance.functionIdentity === functionIdentity &&
      allowance.method === method,
  );
}

/**
 * @param {string} file
 * @param {any} program
 * @param {Map<any, any>} parents
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 */
function checkClassNameDispatch(file, program, parents, violations, allowlist) {
  walk(program, null, (node, parent) => {
    if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (
          property.type === 'Property' &&
          staticPatternPropertyName(property, parents) === 'getClassName'
        ) {
          addViolation(
            violations,
            file,
            property,
            'diagnostic getClassName() is only allowed for Object.prototype.toString fallback tagging',
            'getClassName',
          );
        }
      }
      return;
    }

    if (
      node.type !== 'MemberExpression' ||
      staticMemberName(node, parents) !== 'getClassName'
    ) {
      return;
    }

    if (
      parent?.type === 'CallExpression' &&
      parent.callee === node &&
      isDiagnosticClassNameFallback(file, parent, parents, allowlist)
    ) {
      return;
    }

    addViolation(
      violations,
      file,
      node,
      'diagnostic getClassName() is only allowed for Object.prototype.toString fallback tagging',
      'getClassName',
    );
  });
}

/**
 * @param {string} file
 * @param {any} node
 * @param {Map<any, any>} parents
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 * @returns {boolean}
 */
function isDiagnosticClassNameFallback(file, node, parents, allowlist) {
  if (file !== allowlist.classNameFallback.file) {
    return false;
  }

  const callee = unwrapChain(node.callee);
  const conditional = parents.get(node);
  const template = parents.get(conditional);

  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'object' &&
    conditional?.type === 'ConditionalExpression' &&
    conditional.alternate === node &&
    template?.type === 'TemplateLiteral' &&
    template.expressions.length === 1 &&
    template.quasis[0]?.value.cooked === '[object ' &&
    template.quasis[1]?.value.cooked === ']' &&
    isStringTypeofTest(conditional.test) &&
    isObjectPrototypeToStringFallback(node, parents)
  );
}

/**
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {boolean}
 */
function isObjectPrototypeToStringFallback(node, parents) {
  let functionNode = parents.get(node);

  while (
    functionNode !== null &&
    functionNode !== undefined &&
    !isFunctionNode(functionNode)
  ) {
    functionNode = parents.get(functionNode);
  }

  if (functionNode === null || functionNode === undefined) {
    return false;
  }

  const callProperty = parents.get(functionNode);
  const configuration = parents.get(callProperty);
  const nativeFactory = parents.get(configuration);
  const definition = parents.get(nativeFactory);

  return (
    callProperty?.type === 'Property' &&
    propertyName(callProperty.key, callProperty.computed) === 'call' &&
    configuration?.type === 'ObjectExpression' &&
    nativeFactory?.type === 'CallExpression' &&
    definition?.type === 'CallExpression' &&
    definition.callee.type === 'Identifier' &&
    definition.callee.name === 'defineMethod' &&
    definition.arguments[0]?.type === 'Identifier' &&
    definition.arguments[0].name === 'objectPrototype' &&
    definition.arguments[1]?.type === 'Literal' &&
    definition.arguments[1].value === 'toString' &&
    definition.arguments[2] === nativeFactory
  );
}

/**
 * @param {any} node
 * @returns {boolean}
 */
function isStringTypeofTest(node) {
  return (
    node?.type === 'BinaryExpression' &&
    node.operator === '===' &&
    node.left?.type === 'UnaryExpression' &&
    node.left.operator === 'typeof' &&
    node.left.argument?.type === 'Identifier' &&
    node.left.argument.name === 'tag' &&
    node.right?.type === 'Literal' &&
    node.right.value === 'string'
  );
}

/**
 * @param {string} file
 * @param {any} program
 * @param {Map<any, any>} parents
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 */
function checkTable6Terminals(file, program, parents, violations, allowlist) {
  walk(program, null, (node) => {
    if (node.type !== 'CallExpression') {
      return;
    }

    const callee = unwrapChain(node.callee);

    if (callee.type !== 'MemberExpression') {
      return;
    }

    const method = staticMemberName(callee, parents);

    if (method === null || !TABLE6_DISPATCH_METHODS.has(method)) {
      return;
    }

    const receiver = unwrapChain(callee.object);
    const receiverName = receiver.type === 'Identifier' ? receiver.name : null;

    if (
      isAllowedTable6Terminal(
        file,
        method,
        receiverName,
        enclosingRawHostFunctionIdentity(node, parents),
        node,
        parents,
        allowlist,
      )
    ) {
      return;
    }

    addViolation(
      violations,
      file,
      callee,
      `Table 6 ${method} dispatch is only allowed at audited terminals`,
      method,
    );
  });
}

/**
 * @param {string} file
 * @param {string} method
 * @param {string | null} receiver
 * @param {string | null} functionIdentity
 * @param {any} node
 * @param {Map<any, any>} parents
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 * @returns {boolean}
 */
function isAllowedTable6Terminal(
  file,
  method,
  receiver,
  functionIdentity,
  node,
  parents,
  allowlist,
) {
  return allowlist.table6Terminals.some(
    (terminal) =>
      terminal.file === file &&
      terminal.method === method &&
      terminal.receiver === receiver &&
      terminal.functionIdentity === functionIdentity &&
      isUnshadowedTerminalReceiver(
        node,
        receiver,
        terminal.parameterIndex,
        parents,
      ),
  );
}

/**
 * @param {any} node
 * @param {string | null} receiver
 * @param {number} parameterIndex
 * @param {Map<any, any>} parents
 * @returns {boolean}
 */
function isUnshadowedTerminalReceiver(node, receiver, parameterIndex, parents) {
  if (receiver === null) {
    return false;
  }

  const functionNode = /** @type {any} */ (
    enclosingFunctionNode(node, parents)
  );

  return (
    functionNode !== null &&
    functionNode.params[parameterIndex]?.type === 'Identifier' &&
    functionNode.params[parameterIndex].name === receiver &&
    !hasTerminalReceiverShadow(functionNode.body, receiver)
  );
}

/**
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {any | null}
 */
function enclosingFunctionNode(node, parents) {
  let current = parents.get(node);

  while (current !== null && current !== undefined) {
    if (isFunctionNode(current)) {
      return current;
    }
    current = parents.get(current);
  }

  return null;
}

/**
 * @param {any} body
 * @param {string} receiver
 * @returns {boolean}
 */
function hasTerminalReceiverShadow(body, receiver) {
  let shadowed = false;

  /** @param {any} node */
  const visit = (node) => {
    if (!isNode(node) || shadowed) {
      return;
    }

    const candidate = /** @type {any} */ (node);

    if (isFunctionNode(candidate)) {
      return;
    }

    if (
      candidate.type === 'VariableDeclarator' &&
      rawHostPatternNames(candidate.id).includes(receiver)
    ) {
      shadowed = true;
      return;
    }

    if (
      (candidate.type === 'FunctionDeclaration' ||
        candidate.type === 'ClassDeclaration') &&
      candidate.id?.type === 'Identifier' &&
      candidate.id.name === receiver
    ) {
      shadowed = true;
      return;
    }

    if (
      candidate.type === 'CatchClause' &&
      rawHostPatternNames(candidate.param).includes(receiver)
    ) {
      shadowed = true;
      return;
    }

    for (const child of nodeChildren(candidate)) {
      visit(child);
    }
  };

  visit(body);
  return shadowed;
}

/**
 * @param {string} file
 * @param {any} program
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {typeof OBJECT_CONTRACT_ALLOWLIST} allowlist
 */
function checkRawHostAccessorCalls(file, program, violations, allowlist) {
  const allowed = {
    ...allowlist.rawHostAccessor,
    internalContinuations: allowlist.internalContinuations,
  };
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

    const scope = createRawHostCallbackScope(null, null, parents);

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

  if (callee.type === 'CallExpression') {
    const bind = unwrapChain(callee.callee);

    if (
      bind.type === 'MemberExpression' &&
      bind.object.type === 'Identifier' &&
      staticMemberName(bind, scope.parents ?? undefined) === 'bind'
    ) {
      const binding = rawHostCallbackBinding(scope, bind.object.name);

      if (binding !== null) {
        return {
          binding,
          invocation: `${bind.object.name}.bind()()`,
        };
      }
    }
  }

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
    const method = staticMemberName(callee, scope.parents ?? undefined);

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
 * @param {Map<any, any> | null} [parents]
 * @returns {any}
 */
function createRawHostCallbackScope(
  parent,
  functionScope = null,
  parents = parent?.parents ?? null,
) {
  const scope = {
    parent,
    functionScope: /** @type {any} */ (null),
    bindings: /** @type {Map<string, any>} */ (new Map()),
    parents,
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
    collectRawHostCallbackParameterNames(parameter, callbacks);
  }

  return callbacks;
}

/**
 * @param {any} pattern
 * @param {Set<string>} callbacks
 */
function collectRawHostCallbackParameterNames(pattern, callbacks) {
  const target = pattern?.type === 'AssignmentPattern' ? pattern.left : pattern;

  if (target?.type === 'Identifier') {
    if (RAW_HOST_CALLBACK_PARAMETERS.has(target.name)) {
      callbacks.add(target.name);
    }
    return;
  }

  if (target?.type === 'ObjectPattern') {
    for (const property of target.properties) {
      if (property.type !== 'Property') {
        continue;
      }

      const key = propertyName(property.key, property.computed);

      if (key !== null && RAW_HOST_CALLBACK_PARAMETERS.has(key)) {
        for (const name of rawHostPatternNames(property.value)) {
          callbacks.add(name);
        }
      } else {
        collectRawHostCallbackParameterNames(property.value, callbacks);
      }
    }
    return;
  }

  if (target?.type === 'ArrayPattern') {
    for (const element of target.elements) {
      collectRawHostCallbackParameterNames(element, callbacks);
    }
  }
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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

    if (binding === null) {
      propagateRawHostDestructuredBindings(
        declarationScope,
        declarator.id,
        declarator.init,
        scope,
        declaration.kind !== 'var',
      );
    } else if (declaration.kind === 'var') {
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
 * @param {any} targetScope
 * @param {any} pattern
 * @param {any} source
 * @param {any} sourceScope
 * @param {boolean} replace
 */
function propagateRawHostDestructuredBindings(
  targetScope,
  pattern,
  source,
  sourceScope,
  replace,
) {
  const target = pattern?.type === 'AssignmentPattern' ? pattern.left : pattern;

  if (target?.type === 'ObjectPattern' && source?.type === 'ObjectExpression') {
    for (const targetProperty of target.properties) {
      if (targetProperty.type !== 'Property') {
        continue;
      }

      const key = propertyName(targetProperty.key, targetProperty.computed);
      const sourceProperty = source.properties.find(
        /** @param {any} property */
        (property) =>
          property.type === 'Property' &&
          propertyName(property.key, property.computed) === key,
      );

      if (sourceProperty === undefined) {
        continue;
      }

      const binding = rawHostCallbackExpressionBinding(
        sourceProperty.value,
        sourceScope,
      );

      if (binding !== null) {
        declareRawHostCallbackPattern(
          targetScope,
          targetProperty.value,
          binding,
          replace,
        );
      }
    }
    return;
  }

  if (target?.type === 'ArrayPattern' && source?.type === 'ArrayExpression') {
    for (let index = 0; index < target.elements.length; index += 1) {
      const binding = rawHostCallbackExpressionBinding(
        source.elements[index],
        sourceScope,
      );

      if (binding !== null) {
        declareRawHostCallbackPattern(
          targetScope,
          target.elements[index],
          binding,
          replace,
        );
      }
    }
  }
}

/**
 * @param {any} node
 * @param {any} scope
 * @param {string} file
 * @param {any} allowed
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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

  if (expression?.type === 'Identifier') {
    return rawHostCallbackBinding(scope, expression.name);
  }

  const member = /** @type {any} */ (expression);
  const method =
    member?.type === 'MemberExpression'
      ? staticMemberName(member, scope.parents ?? undefined)
      : null;

  if (
    expression?.type === 'MemberExpression' &&
    expression.object.type === 'Identifier' &&
    (method === 'call' || method === 'apply' || method === 'bind')
  ) {
    return rawHostCallbackBinding(scope, expression.object.name);
  }

  if (expression?.type !== 'CallExpression') {
    return null;
  }

  const callee = unwrapChain(expression.callee);

  return callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    staticMemberName(callee, scope.parents ?? undefined) === 'bind'
    ? rawHostCallbackBinding(scope, callee.object.name)
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
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
      allowed,
    )
  ) {
    return;
  }

  addViolation(
    violations,
    file,
    node,
    `raw host callback ${invocation.invocation} is only allowed in ${allowed.file}#${allowed.functionName}`,
    invocation.invocation,
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
 * @param {{ internalContinuations: typeof OBJECT_CONTRACT_ALLOWLIST.internalContinuations }} allowed
 * @returns {boolean}
 */
function isInternalContinuation(
  file,
  functionIdentity,
  parameter,
  invocation,
  allowed,
) {
  const continuations =
    /** @type {Record<string, readonly InternalContinuationAllowance[]>} */ (
      allowed.internalContinuations
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
 * @param {Map<any, any>} [parents]
 * @returns {string | null}
 */
function staticMemberName(node, parents) {
  const member = unwrapChain(node);

  if (member.type !== 'MemberExpression') {
    return null;
  }

  const direct = propertyName(member.property, member.computed);

  if (direct !== null || !member.computed || parents === undefined) {
    return direct;
  }

  return member.property.type === 'Identifier'
    ? resolveStaticStringBinding(member.property.name, member, parents)
    : null;
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
 * @param {any} property
 * @param {Map<any, any>} parents
 * @returns {string | null}
 */
function staticPatternPropertyName(property, parents) {
  const direct = propertyName(property.key, property.computed);

  if (direct !== null || !property.computed) {
    return direct;
  }

  return property.key.type === 'Identifier'
    ? resolveStaticStringBinding(property.key.name, property, parents)
    : null;
}

/**
 * @param {string} name
 * @param {any} node
 * @param {Map<any, any>} parents
 * @returns {string | null}
 */
function resolveStaticStringBinding(name, node, parents) {
  const position = node.start ?? Number.MAX_SAFE_INTEGER;
  let current = parents.get(node);

  while (current !== null && current !== undefined) {
    if (current.type === 'BlockStatement' || current.type === 'Program') {
      const binding = staticStringBindingInStatements(
        current.body,
        name,
        position,
      );

      if (binding !== undefined) {
        return binding;
      }
    } else if (current.type === 'ForStatement') {
      const binding = staticStringBindingInDeclaration(
        current.init,
        name,
        position,
      );

      if (binding !== undefined) {
        return binding;
      }
    } else if (current.type === 'SwitchStatement') {
      for (const switchCase of current.cases) {
        if (
          switchCase.start > position ||
          (switchCase.end !== undefined && switchCase.end < position)
        ) {
          continue;
        }

        const binding = staticStringBindingInStatements(
          switchCase.consequent,
          name,
          position,
        );

        if (binding !== undefined) {
          return binding;
        }
      }
    } else if (
      (current.type === 'ForInStatement' ||
        current.type === 'ForOfStatement') &&
      current.left?.type === 'VariableDeclaration' &&
      current.left.declarations.some(
        /** @param {any} declaration */
        (declaration) => rawHostPatternNames(declaration.id).includes(name),
      )
    ) {
      return null;
    } else if (current.type === 'CatchClause') {
      if (rawHostPatternNames(current.param).includes(name)) {
        return null;
      }
    } else if (isFunctionNode(current)) {
      if (
        current.params.some(
          /** @param {any} parameter */
          (parameter) => rawHostPatternNames(parameter).includes(name),
        ) ||
        current.id?.name === name
      ) {
        return null;
      }
    }

    current = parents.get(current);
  }

  return null;
}

/**
 * @param {any[]} statements
 * @param {string} name
 * @param {number} position
 * @returns {string | null | undefined}
 */
function staticStringBindingInStatements(statements, name, position) {
  /** @type {string | null | undefined} */
  let binding;

  for (const statement of statements) {
    if (statement.start >= position) {
      break;
    }

    const declaration = staticStringBindingInDeclaration(
      statement,
      name,
      position,
    );

    if (declaration !== undefined) {
      binding = declaration;
    }

    if (
      (statement.type === 'FunctionDeclaration' ||
        statement.type === 'ClassDeclaration') &&
      statement.id?.name === name
    ) {
      binding = null;
    }
  }

  return binding;
}

/**
 * @param {any} node
 * @param {string} name
 * @param {number} position
 * @returns {string | null | undefined}
 */
function staticStringBindingInDeclaration(node, name, position) {
  if (node?.type !== 'VariableDeclaration' || node.start >= position) {
    return undefined;
  }

  /** @type {string | null | undefined} */
  let binding;

  for (const declaration of node.declarations) {
    if (declaration.start >= position) {
      break;
    }

    if (!rawHostPatternNames(declaration.id).includes(name)) {
      continue;
    }

    binding =
      node.kind === 'const' &&
      declaration.id.type === 'Identifier' &&
      declaration.init?.type === 'Literal' &&
      typeof declaration.init.value === 'string'
        ? declaration.init.value
        : null;
  }

  return binding;
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
 * @param {{ file: string, line: number, message: string, token: string }[]} violations
 * @param {string} file
 * @param {any} node
 * @param {string} message
 * @param {string} [token]
 */
function addViolation(violations, file, node, message, token) {
  violations.push({
    file,
    line: node.loc?.start.line ?? 0,
    message,
    token: token ?? violationToken(node),
  });
}

/**
 * @param {any} node
 * @returns {string}
 */
function violationToken(node) {
  const value = unwrapChain(node);

  if (value.type === 'MemberExpression') {
    return staticMemberName(value) ?? value.type;
  }

  if (value.type === 'CallExpression') {
    const callee = unwrapChain(value.callee);

    if (callee.type === 'Identifier') {
      return callee.name;
    }

    if (callee.type === 'MemberExpression') {
      return staticMemberName(callee) ?? callee.type;
    }
  }

  if (value.type === 'ImportSpecifier') {
    return value.imported.name;
  }

  if (value.type === 'Property') {
    return propertyName(value.key, value.computed) ?? value.type;
  }

  return value.type;
}
