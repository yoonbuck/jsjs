import { getIdentifierReference } from '../runtime/environment.js';
import { putValue } from '../runtime/reference.js';
import { EMPTY, createNormalCompletion } from '../runtime/completion.js';
import { evaluateExpressionValue } from './expressions.js';

/**
 * @typedef {import('./index.js').EvaluationContext} EvaluationContext
 */

/**
 * Performs (a deliberately ES5-only, function-free slice of) Global
 * Declaration Instantiation: walks the program body for every `var`
 * declaration reachable without crossing a function boundary and creates a
 * mutable, non-configurable global var binding for each name, initialized
 * to `undefined`. This must run before the program's statement list is
 * evaluated so identifier references and hoisted reads see the binding
 * even before its declaration statement executes.
 *
 * @param {any} program
 * @param {import('../runtime/realm.js').Realm} realm
 * @returns {void}
 */
export function globalDeclarationInstantiation(program, realm) {
  /** @type {Set<string>} */
  const varNames = new Set();

  for (const statement of program.body) {
    collectVarNames(statement, varNames);
  }

  for (const name of varNames) {
    realm.globalEnvironment.createGlobalVarBinding(name, false);
  }
}

/**
 * Recursively collects `var`-declared names from `node`, descending into
 * every ES5 statement form that shares its enclosing variable scope
 * (blocks, `if` branches, loop bodies, and a `for` loop's own
 * initializer). Any other node type — including statement forms the
 * evaluator does not support yet, and function boundaries once they exist
 * — is left alone: it is not a var-hoisting container, so no names are
 * collected and no descent happens.
 *
 * @param {any} node
 * @param {Set<string>} names
 * @returns {void}
 */
function collectVarNames(node, names) {
  switch (node.type) {
    case 'VariableDeclaration':
      for (const declarator of node.declarations) {
        names.add(declarator.id.name);
      }
      return;
    case 'BlockStatement':
      for (const statement of node.body) {
        collectVarNames(statement, names);
      }
      return;
    case 'IfStatement':
      collectVarNames(node.consequent, names);
      if (node.alternate) {
        collectVarNames(node.alternate, names);
      }
      return;
    case 'WhileStatement':
    case 'DoWhileStatement':
      collectVarNames(node.body, names);
      return;
    case 'ForStatement':
      if (node.init && node.init.type === 'VariableDeclaration') {
        collectVarNames(node.init, names);
      }
      collectVarNames(node.body, names);
      return;
    default:
      return;
  }
}

/**
 * Executes a `var` declaration's initializers, assigning each declarator
 * with an `init` expression to its (already-hoisted) binding. A
 * `VariableDeclaration`'s own completion value is always `EMPTY`
 * (ECMA-262 12.2), so callers combining it into a statement list see the
 * previous statement's value carried forward via `updateEmpty`.
 *
 * @param {any} node
 * @param {EvaluationContext} context
 * @returns {{ type: 'normal', value: unknown }}
 */
export function evaluateVariableDeclaration(node, context) {
  for (const declarator of node.declarations) {
    if (declarator.init) {
      const value = evaluateExpressionValue(declarator.init, context);
      const reference = getIdentifierReference(
        context.env,
        declarator.id.name,
        context.strict,
      );
      putValue(reference, value);
    }
  }

  return createNormalCompletion(EMPTY);
}
