import { EngineObject } from '../runtime/object.js';
import { isConstructor } from '../runtime/capabilities.js';
import { GuestErrorSignal } from '../runtime/completion.js';
import { newDeclarativeEnvironment } from '../runtime/environment.js';
import { createFunctionObject } from './declarations.js';
import { evaluateExpressionValue } from './expressions.js';
import {
  evaluatePropertyName,
  functionNameFromPropertyKey,
} from './property-name.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 * @typedef {import('../runtime/function-object.js').EngineFunction} EngineFunction
 * @typedef {import('../runtime/environment.js').EnvironmentRecordLike}
 *   EnvironmentRecordLike
 * @typedef {{
 *   node: any,
 *   context: EvaluationContext,
 *   classContext: EvaluationContext,
 *   className: string,
 *   classEnvironment: EnvironmentRecordLike,
 *   classNameEnvironment:
 *     import('../runtime/environment.js').DeclarativeEnvironmentRecord
 *     | undefined,
 *   heritageApplied: boolean,
 *   derived: boolean,
 *   heritage: unknown,
 *   constructorDefinition: any | undefined,
 *   prototype: EngineObject | null,
 *   constructor: EngineFunction | null,
 * }} ClassDefinitionState
 */

const DEFAULT_BASE_CONSTRUCTOR = Object.freeze({
  type: 'FunctionExpression',
  id: null,
  params: [],
  generator: false,
  async: false,
  expression: false,
  body: Object.freeze({ type: 'BlockStatement', body: Object.freeze([]) }),
});

/**
 * Evaluates an ES2015 ClassDefinition and returns its class constructor.
 *
 * A named class creates an immutable inner binding even when the surrounding
 * declaration is mutable. That keeps the class name in the required TDZ while
 * heritage is evaluated and lets methods retain the class's own stable name
 * after the outer declaration is subsequently reassigned.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string} [bindingName='']
 * @returns {EngineFunction}
 */
export function evaluateClassDefinition(node, context, bindingName = '') {
  const state = createClassDefinitionState(node, context, bindingName);
  const heritage =
    node.superClass === null
      ? undefined
      : evaluateExpressionValue(node.superClass, state.classContext);
  applyClassHeritage(state, heritage);

  for (const definition of node.body.body) {
    if (definition === state.constructorDefinition) {
      continue;
    }

    const key = evaluatePropertyName(
      definition.key,
      definition.computed,
      state.classContext,
    );
    defineClassElement(state, definition, key);
  }

  return finishClassDefinition(state);
}

/**
 * @param {any} node
 * @param {EvaluationContext} context
 * @param {string} [bindingName='']
 * @returns {ClassDefinitionState}
 */
export function createClassDefinitionState(node, context, bindingName = '') {
  const className = node.id ? node.id.name : bindingName;
  let classEnvironment = context.env;
  /** @type {import('../runtime/environment.js').DeclarativeEnvironmentRecord | undefined} */
  let classNameEnvironment;

  if (node.id) {
    classNameEnvironment = newDeclarativeEnvironment(context.env);
    classNameEnvironment.createImmutableBinding(className, true);
    classEnvironment = classNameEnvironment;
  }
  const classContext = { ...context, env: classEnvironment, strict: true };

  return {
    node,
    context,
    classContext,
    className,
    classEnvironment,
    classNameEnvironment,
    heritageApplied: false,
    derived: node.superClass !== null,
    heritage: undefined,
    constructorDefinition: undefined,
    prototype: null,
    constructor: null,
  };
}

/**
 * @param {ClassDefinitionState} state
 * @param {unknown} heritage
 * @returns {void}
 */
export function applyClassHeritage(state, heritage) {
  if (state.heritageApplied) {
    throw new TypeError('Class heritage was already applied');
  }

  const { context, node, classContext, classEnvironment, className } = state;
  const derived = node.superClass !== null;
  /** @type {EngineObject | null} */
  let instancePrototype = context.realm.intrinsics.objectPrototype;

  if (derived) {
    if (heritage === null) {
      instancePrototype = null;
    } else {
      if (!(heritage instanceof EngineObject) || !isConstructor(heritage)) {
        throw new GuestErrorSignal(
          'TypeError',
          'Class extends value is not a constructor',
        );
      }

      const parentPrototype = heritage.get('prototype');

      if (
        parentPrototype !== null &&
        !(parentPrototype instanceof EngineObject)
      ) {
        throw new GuestErrorSignal(
          'TypeError',
          'Class extends value has a non-object prototype property',
        );
      }
      instancePrototype = parentPrototype;
    }
  }

  const constructorDefinition = findConstructorDefinition(node.body.body);
  const constructorNode =
    constructorDefinition === undefined
      ? DEFAULT_BASE_CONSTRUCTOR
      : constructorDefinition.value;

  if (constructorNode.generator === true) {
    throw new GuestErrorSignal(
      'SyntaxError',
      'Class constructors cannot be generators',
    );
  }

  const prototype = new EngineObject(
    instancePrototype,
    'Object',
    context.realm.agent,
  );
  const constructor = createFunctionObject(
    constructorNode,
    classEnvironment,
    classContext,
    {
      name: className,
      functionKind: 'classConstructor',
      thisMode: 'strict',
      constructible: true,
      createPrototype: false,
      homeObject: prototype,
      strict: true,
      constructorKind: derived ? 'derived' : 'base',
      defaultDerivedConstructor: derived && constructorDefinition === undefined,
    },
  );

  defineClassProperty(prototype, 'constructor', {
    value: constructor,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  defineClassProperty(constructor, 'prototype', {
    value: prototype,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  if (heritage instanceof EngineObject) {
    if (!constructor.setPrototypeOf(heritage)) {
      throw new GuestErrorSignal(
        'TypeError',
        'Cannot set class constructor inheritance',
      );
    }
  }

  state.heritageApplied = true;
  state.derived = derived;
  state.heritage = heritage;
  state.constructorDefinition = constructorDefinition;
  state.prototype = prototype;
  state.constructor = constructor;
}

/**
 * @param {ClassDefinitionState} state
 * @param {any} definition
 * @param {string | symbol} key
 * @returns {void}
 */
export function defineClassElement(state, definition, key) {
  if (!state.heritageApplied || state.constructor === null) {
    throw new TypeError('Class heritage must be applied before its elements');
  }

  if (definition === state.constructorDefinition) {
    return;
  }

  const target = definition.static ? state.constructor : state.prototype;

  if (target === null) {
    throw new TypeError('Class definition lost its prototype');
  }

  const functionObject = createFunctionObject(
    definition.value,
    state.classEnvironment,
    state.classContext,
    {
      name: functionNameFromPropertyKey(
        key,
        definition.kind === 'get' || definition.kind === 'set'
          ? definition.kind
          : '',
      ),
      functionKind:
        definition.value.generator === true ? 'generatorMethod' : 'method',
      thisMode: 'strict',
      constructible: false,
      createPrototype: definition.value.generator === true,
      homeObject: target,
      strict: true,
    },
  );

  if (definition.kind === 'get' || definition.kind === 'set') {
    defineClassProperty(target, key, {
      ...(definition.kind === 'get'
        ? { get: functionObject }
        : { set: functionObject }),
      enumerable: false,
      configurable: true,
    });
    return;
  }

  defineClassProperty(target, key, {
    value: functionObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * @param {ClassDefinitionState} state
 * @returns {EngineFunction}
 */
export function finishClassDefinition(state) {
  if (!state.heritageApplied || state.constructor === null) {
    throw new TypeError('Class definition is incomplete');
  }

  if (state.classNameEnvironment !== undefined) {
    state.classNameEnvironment.initializeBinding(
      state.className,
      state.constructor,
    );
  }

  return state.constructor;
}

/**
 * @param {readonly any[]} definitions
 * @returns {any | undefined}
 */
function findConstructorDefinition(definitions) {
  for (const definition of definitions) {
    if (
      definition.static === false &&
      definition.computed === false &&
      definition.kind === 'constructor'
    ) {
      return definition;
    }
  }

  return undefined;
}

/**
 * @param {EngineObject} object
 * @param {string | symbol} key
 * @param {import('../runtime/descriptors.js').PropertyDescriptorRecord} descriptor
 * @returns {void}
 */
function defineClassProperty(object, key, descriptor) {
  if (!object.defineOwnProperty(key, descriptor)) {
    throw new GuestErrorSignal('TypeError', 'Cannot define class property');
  }
}
