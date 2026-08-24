import { newDeclarativeEnvironment } from '../runtime/environment.js';
import { initializeBindingPattern } from './patterns.js';
import { boundNames } from './static-semantics.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * @param {any} param
 * @param {unknown} thrownValue
 * @param {EvaluationContext} context
 * @returns {EvaluationContext}
 */
export function createCatchClauseContext(param, thrownValue, context) {
  const catchEnv = newDeclarativeEnvironment(context.env);
  catchEnv.isCatchClauseEnvironment = true;
  const catchContext = { ...context, env: catchEnv };

  for (const name of boundNames(param)) {
    catchEnv.createMutableBinding(name, false);
  }

  initializeBindingPattern(param, thrownValue, catchEnv, catchContext);
  return catchContext;
}
