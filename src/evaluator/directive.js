/**
 * Directive-prologue detection for script and function bodies.
 *
 * Acorn attaches a `directive` string property to `ExpressionStatement` AST
 * nodes that are genuine *leading* directive-prologue statements — a string
 * literal that appears before any non-directive statement in a program body
 * or function body. It does **not** set `.directive` on a string literal that
 * appears later in the source, so walking until the first statement without
 * `.directive` and returning `false` there is both correct and explicit about
 * the "leading only" requirement.
 *
 * @param {readonly any[]} statements
 * @returns {boolean}
 */
export function hasUseStrictDirective(statements) {
  for (const statement of statements) {
    if (statement.directive === undefined) {
      return false;
    }

    if (statement.directive === 'use strict') {
      return true;
    }
  }

  return false;
}
