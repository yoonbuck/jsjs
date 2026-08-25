import { newDeclarativeEnvironment } from '../runtime/environment.js';
import { initializeBindingPattern } from './patterns.js';
import { boundNames } from './static-semantics.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * Creates the catch clause's declarative environment and installs an
 * uninitialized mutable binding for every name the parameter pattern binds,
 * without initializing the pattern itself. The generator frame machinery uses
 * this so it can drive parameter *initialization* through the frame-driven
 * pattern machinery — a `yield` in a default value or computed key must be able
 * to suspend the generator rather than run synchronously.
 *
 * @param {any} param
 * @param {EvaluationContext} context
 * @returns {{ catchContext: EvaluationContext, catchEnv: any }}
 */
export function createCatchClauseEnvironment(param, context) {
  const catchEnv = newDeclarativeEnvironment(context.env);
  catchEnv.isCatchClauseEnvironment = true;
  const catchContext = { ...context, env: catchEnv };

  for (const name of boundNames(param)) {
    catchEnv.createMutableBinding(name, false);
  }

  return { catchContext, catchEnv };
}

/**
 * @param {any} param
 * @param {unknown} thrownValue
 * @param {EvaluationContext} context
 * @returns {EvaluationContext}
 */
export function createCatchClauseContext(param, thrownValue, context) {
  const { catchContext, catchEnv } = createCatchClauseEnvironment(
    param,
    context,
  );

  initializeBindingPattern(param, thrownValue, catchEnv, catchContext);
  return catchContext;
}
