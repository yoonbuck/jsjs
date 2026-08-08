/**
 * ES2015 (ECMA-262 6th edition) static semantics for declaration forms,
 * implemented as pure functions over Acorn AST nodes. This module is the
 * shared foundation `src/evaluator/declarations.js` and later block-scoping
 * work build on: it names things exactly the way the spec does, so a reader
 * can hold a clause number up against a function here.
 *
 * Two return shapes recur throughout:
 *
 * - `*Names` functions return `string[]`, in source order, **with duplicates
 *   preserved** — exactly as the spec's `List` concatenation does (e.g.
 *   `var a; var a;` yields `["a", "a"]`). A caller that wants a set of unique
 *   names (as global/function declaration instantiation do) builds one from
 *   the result; deduplicating here would throw away the source-order
 *   information a spec algorithm never discards.
 * - `*Declarations` functions return the declaration **nodes** themselves
 *   (an Acorn `VariableDeclaration` or `FunctionDeclaration`), in source
 *   order. The spec's grammar distinguishes a `VariableDeclaration` (one
 *   binding) from the `VariableDeclarationList` (`var a = 1, b = 2`) that
 *   groups several of them; this engine instead returns the enclosing Acorn
 *   `VariableDeclaration` statement node as a single unit, matching the
 *   granularity `evaluateVariableDeclaration` (`./declarations.js`) already
 *   evaluates and `boundNames` already unpacks (it returns every name a
 *   `VariableDeclaration` binds, across all of its declarators).
 *
 * Every walk here uses an explicit worklist rather than host recursion: these
 * run outside the realm's stack guard (`src/runtime/stack-guard.js` only
 * counts evaluation, not the hoisting pass that precedes it), and the parser
 * accepts source nested more deeply than a recursive walk of it would
 * survive. See `varScopedDeclarations`'s doc comment for the container set
 * this shares with the ES5 hoisting walk it replaces.
 */

import { createUnsupportedNodeError } from '../runtime/errors.js';

/**
 * ES2015 §12.1.2 (`BindingIdentifier : Identifier`), §13.3.1.2
 * (`LexicalDeclaration`), §13.3.2.1 (`VariableDeclarationList`), and §14.1.3
 * (`FunctionDeclaration`) — the names `node` binds, in source order.
 *
 * `node` may be an `Identifier` (a bare `BindingIdentifier`, e.g. a `catch`
 * parameter or a function parameter), a `FunctionDeclaration` (its own name),
 * or a `VariableDeclaration` of any `kind` (`var`, `let`, or `const`) — every
 * declarator's bound name, in source order, since `boundNames` of the whole
 * declaration is the concatenation the spec's `BindingList`/
 * `VariableDeclarationList` recursion produces.
 *
 * @param {any} node
 * @returns {string[]}
 */
export function boundNames(node) {
  switch (node.type) {
    case 'Identifier':
      return [node.name];
    case 'FunctionDeclaration':
      // ES2015 grammar allows an anonymous `export default function () {}`,
      // whose BoundNames is the synthetic `"*default*"`, but this engine
      // parses no module grammar, so `node.id` is always present here.
      return [node.id.name];
    case 'VariableDeclaration': {
      /** @type {string[]} */
      const names = [];
      for (const declarator of node.declarations) {
        // ES5/ES2015 destructuring patterns (`BindingPattern`) are a later
        // grammar this engine's parser does not produce; `boundNames`
        // recurses through `declarator.id` anyway so a future `Identifier`-
        // only declarator keeps working unchanged.
        names.push(...boundNames(declarator.id));
      }
      return names;
    }
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * ES2015 §13.3.1.3 — true for a `const` `LexicalDeclaration`, false for
 * `let`, `var`, and every other declaration form (a `FunctionDeclaration`'s
 * `IsConstantDeclaration`, §14.1.10, is always false).
 *
 * @param {any} node
 * @returns {boolean}
 */
export function isConstantDeclaration(node) {
  return node.type === 'VariableDeclaration' && node.kind === 'const';
}

/**
 * Reverses `items` in place from `start` to its end. Used after pushing a
 * node's children onto a worklist in source order, so popping them back off
 * (LIFO) yields source order instead of reverse source order.
 *
 * @param {any[]} items
 * @param {number} start
 * @returns {void}
 */
function reverseFrom(items, start) {
  for (
    let low = start, high = items.length - 1;
    low < high;
    low += 1, high -= 1
  ) {
    const swap = items[low];
    items[low] = items[high];
    items[high] = swap;
  }
}

/**
 * Runs an iterative worklist walk over `seed`, in source order, using
 * `classify` to decide what each visited node contributes and to push
 * whatever children share the walk's notion of scope. `classify(node,
 * pending)` pushes children onto `pending` (in source order — the reversal
 * that keeps them popping in source order happens here, once per node, so
 * every `classify` implementation can push in the natural left-to-right
 * order) and returns the node's own contribution (a declaration node) or
 * `null` for "nothing".
 *
 * @param {readonly any[]} seed
 * @param {(node: any, pending: any[]) => any} classify
 * @returns {any[]}
 */
function collectOrdered(seed, classify) {
  /** @type {any[]} */
  const pending = [...seed];
  reverseFrom(pending, 0);
  /** @type {any[]} */
  const results = [];

  while (pending.length > 0) {
    const current = pending.pop();
    const mark = pending.length;
    const contribution = classify(current, pending);
    reverseFrom(pending, mark);

    if (contribution !== null) {
      results.push(contribution);
    }
  }

  return results;
}

/**
 * Pushes the children of `node` that share its enclosing *variable* scope
 * onto `pending`, for the container set ES2015 §13.2.11/§13.2.12
 * (`VarDeclaredNames`/`VarScopedDeclarations`) walk through: blocks, `if`
 * branches, loop bodies, a `for`/`for-in` head's own `var`/`let`/`const`
 * declaration (kind filtering happens where the pushed declaration is later
 * classified, not here), `try` block/handler/finalizer, `switch` cases,
 * labelled bodies, and `with` bodies (a `with` body shares the enclosing
 * variable scope — ES5.1 §12.10). Returns `true` if `node` was one of these
 * containers (whether or not it had children to push), `false` if `node` is
 * some other node type the caller must classify itself (a declaration, or an
 * unrecognized/unsupported statement).
 *
 * This is shared, unchanged, by both the spec-pure walk (`varScopedDeclarations`)
 * and the top-level walk that deliberately diverges from the spec to preserve
 * this engine's current behavior (`topLevelVarScopedDeclarations`); the two
 * differ only in what a `FunctionDeclaration` terminal node contributes.
 *
 * @param {any} node
 * @param {any[]} pending
 * @returns {boolean}
 */
function pushVarScopeContainerChildren(node, pending) {
  switch (node.type) {
    case 'BlockStatement':
      for (const statement of node.body) {
        pending.push(statement);
      }
      return true;
    case 'IfStatement':
      pending.push(node.consequent);
      if (node.alternate) {
        pending.push(node.alternate);
      }
      return true;
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'LabeledStatement':
    case 'WithStatement':
      pending.push(node.body);
      return true;
    case 'ForStatement':
      if (node.init && node.init.type === 'VariableDeclaration') {
        pending.push(node.init);
      }
      pending.push(node.body);
      return true;
    case 'ForInStatement':
      if (node.left.type === 'VariableDeclaration') {
        pending.push(node.left);
      }
      pending.push(node.body);
      return true;
    case 'TryStatement':
      pending.push(node.block);
      if (node.handler !== null) {
        pending.push(node.handler.body);
      }
      if (node.finalizer !== null) {
        pending.push(node.finalizer);
      }
      return true;
    case 'SwitchStatement':
      for (const switchCase of node.cases) {
        for (const statement of switchCase.consequent) {
          pending.push(statement);
        }
      }
      return true;
    default:
      return false;
  }
}

/**
 * `classify` callback (see `collectOrdered`) for the spec-pure ES2015
 * §13.2.11/§13.2.12 walk: a `var` `VariableDeclaration` is a terminal
 * contribution; a `let`/`const` `VariableDeclaration` is a `Declaration`
 * (`StatementListItem : Declaration` always contributes an empty list to
 * `VarDeclaredNames`/`VarScopedDeclarations`) and contributes nothing; a
 * `FunctionDeclaration` is likewise a `Declaration` in ES2015 — it is
 * lexically scoped, not var-scoped, so it *also* contributes nothing and the
 * walk does not descend into its body (a function is a new variable scope).
 *
 * @param {any} node
 * @param {any[]} pending
 * @returns {any}
 */
function classifyVarScope(node, pending) {
  if (node.type === 'VariableDeclaration') {
    return node.kind === 'var' ? node : null;
  }

  if (node.type === 'FunctionDeclaration') {
    return null;
  }

  pushVarScopeContainerChildren(node, pending);
  return null;
}

/**
 * `classify` callback for `topLevelVarScopedDeclarations`. Identical to
 * `classifyVarScope` except a `FunctionDeclaration` *is* a terminal
 * contribution here.
 *
 * ES2015 §13.2.9/§13.2.10 only give this treatment to a `FunctionDeclaration`
 * that is a *direct* `StatementListItem` of the top-level list (or reached
 * through a chain of `LabeledStatement`s starting there) — everything else
 * falls back to the ordinary, spec-pure walk, so a `function` nested inside a
 * top-level `if`/block is lexically scoped, not var-scoped, in real ES2015.
 *
 * This engine does not implement block scoping yet (that is a later task in
 * the ES2015 lexical-declarations plan — see Task 4), so a block-scoped
 * `FunctionDeclaration` has nowhere to live except the variable scope it
 * already lives in for ES5. Rather than regress `{ function f() {} } f();`
 * (which the pre-refactor `pushHoistingChildren`/`collectFunctionDeclarations`
 * walk in `./declarations.js` hoisted to the variable scope, unconditionally,
 * at any nesting depth), this classify function deliberately keeps collecting
 * a `FunctionDeclaration` found *anywhere* the container walk reaches — not
 * only at the direct top level or through a label chain. That is a knowing
 * divergence from §13.2.9/§13.2.10, standing in for Annex B.3.3 (Block-Level
 * Function Declarations Web Legacy Compatibility Semantics) until Task 4
 * implements real block scoping and Annex B.3.3 together and removes it.
 *
 * @param {any} node
 * @param {any[]} pending
 * @returns {any}
 */
function classifyVarScopeWithFunctionHoistingCompat(node, pending) {
  if (node.type === 'VariableDeclaration') {
    return node.kind === 'var' ? node : null;
  }

  if (node.type === 'FunctionDeclaration') {
    return node;
  }

  pushVarScopeContainerChildren(node, pending);
  return null;
}

/**
 * ES2015 §13.1.6 (`VarScopedDeclarations`, defined per-statement-form and
 * reached here via its Block form, §13.2.12) over `statements`, a
 * `StatementList` (e.g. a `Program`/function body's `.body`, or any nested
 * block's `.body`): every `var` `VariableDeclaration` reachable without
 * crossing a function boundary, as Acorn `VariableDeclaration` nodes, in
 * source order. See `pushVarScopeContainerChildren` for the exact container
 * set. A `let`/`const` declaration or a `FunctionDeclaration` — lexically
 * scoped in ES2015 — contributes nothing, at any depth.
 *
 * @param {readonly any[]} statements
 * @returns {any[]}
 */
export function varScopedDeclarations(statements) {
  return collectOrdered(statements, classifyVarScope);
}

/**
 * ES2015 §13.1.5 (`VarDeclaredNames`, via its Block form §13.2.11) over
 * `statements` — the names `varScopedDeclarations` would hoist, in source
 * order, with duplicates preserved.
 *
 * @param {readonly any[]} statements
 * @returns {string[]}
 */
export function varDeclaredNames(statements) {
  return varScopedDeclarations(statements).flatMap(boundNames);
}

/**
 * The declaration `item` contributes to `lexicallyScopedDeclarations`, or
 * `null`. Implements ES2015 §13.2.6's `StatementListItem` cases directly (a
 * `let`/`const` declaration, or a `FunctionDeclaration`) plus its
 * `LabelledStatement` bridge into §13.13.7: a chain of `LabeledStatement`
 * wrappers around a `FunctionDeclaration` contributes that
 * `FunctionDeclaration`, unwrapped iteratively (a `while` loop over `.body`,
 * not host recursion) so an arbitrarily long label chain costs no stack
 * depth. §13.13.7's literal `LabelledItem : Statement -> empty list` clause
 * does not itself recurse through a *nested* `LabeledStatement`, but nothing
 * in the spec's observable behavior distinguishes `a: function f(){}` from
 * `a: b: function f(){}` either (both are Annex B.3.2 sloppy-mode labelled
 * function declarations), so unwrapping the whole chain is the more useful,
 * consistent reading and is what this engine implements.
 *
 * @param {any} item
 * @returns {any}
 */
function lexicalDeclarationOf(item) {
  if (item.type === 'VariableDeclaration') {
    return item.kind === 'var' ? null : item;
  }

  if (item.type === 'FunctionDeclaration') {
    return item;
  }

  if (item.type === 'LabeledStatement') {
    let body = item.body;

    while (body.type === 'LabeledStatement') {
      body = body.body;
    }

    return body.type === 'FunctionDeclaration' ? body : null;
  }

  return null;
}

/**
 * ES2015 §13.2.6 (`LexicallyScopedDeclarations`) over `statements`, a
 * `StatementList`: the `let`/`const` declarations and `FunctionDeclaration`s
 * that are direct items of `statements` itself, plus any reached by
 * unwrapping a `LabeledStatement` chain rooted at a direct item (see
 * `lexicalDeclarationOf`), in source order. This does **not** descend into a
 * nested block, loop body, `if` branch, `try` part, `switch` case, or `with`
 * body — each of those is a separate `StatementList` with its own lexical
 * scope, reached by calling this function on *that* list, not by recursing
 * into it here.
 *
 * @param {readonly any[]} statements
 * @returns {any[]}
 */
export function lexicallyScopedDeclarations(statements) {
  /** @type {any[]} */
  const declarations = [];

  for (const item of statements) {
    const declaration = lexicalDeclarationOf(item);

    if (declaration !== null) {
      declarations.push(declaration);
    }
  }

  return declarations;
}

/**
 * ES2015 §13.2.5 (`LexicallyDeclaredNames`) over `statements` — the names
 * `lexicallyScopedDeclarations` collects, in source order, with duplicates
 * preserved.
 *
 * @param {readonly any[]} statements
 * @returns {string[]}
 */
export function lexicallyDeclaredNames(statements) {
  return lexicallyScopedDeclarations(statements).flatMap(boundNames);
}

/**
 * The declaration `item` contributes to `topLevelLexicallyScopedDeclarations`,
 * or `null`. ES2015 §13.2.8: a `let`/`const` declaration contributes; a
 * `FunctionDeclaration` — var-scoped at the top level, per §13.2.8's explicit
 * `HoistableDeclaration` exclusion — contributes nothing here, whether direct
 * or reached through a label (a `Statement`, which a `LabeledStatement` is,
 * always contributes an empty list per §13.2.8's `StatementListItem :
 * Statement` clause; no label-chain unwrapping applies to the lexical
 * top-level variant the way it does for the var top-level variant below).
 *
 * @param {any} item
 * @returns {any}
 */
function topLevelLexicalDeclarationOf(item) {
  if (item.type === 'VariableDeclaration' && item.kind !== 'var') {
    return item;
  }

  return null;
}

/**
 * ES2015 §13.2.8 (`TopLevelLexicallyScopedDeclarations`) over `statements`, a
 * `Program`/function body's `StatementList`: the `let`/`const` declarations
 * that are direct items of `statements`, in source order. Unlike
 * `lexicallyScopedDeclarations`, a top-level `FunctionDeclaration` is
 * excluded — see the note on §13.2.7 this engine mirrors: "At the top level
 * of a function, or script, function declarations are treated like var
 * declarations rather than like lexical declarations."
 *
 * @param {readonly any[]} statements
 * @returns {any[]}
 */
export function topLevelLexicallyScopedDeclarations(statements) {
  /** @type {any[]} */
  const declarations = [];

  for (const item of statements) {
    const declaration = topLevelLexicalDeclarationOf(item);

    if (declaration !== null) {
      declarations.push(declaration);
    }
  }

  return declarations;
}

/**
 * ES2015 §13.2.7 (`TopLevelLexicallyDeclaredNames`) over `statements` — the
 * names `topLevelLexicallyScopedDeclarations` collects, in source order,
 * with duplicates preserved.
 *
 * @param {readonly any[]} statements
 * @returns {string[]}
 */
export function topLevelLexicallyDeclaredNames(statements) {
  return topLevelLexicallyScopedDeclarations(statements).flatMap(boundNames);
}

/**
 * ES2015 §13.2.10 (`TopLevelVarScopedDeclarations`) over `statements`, a
 * `Program`/function body's `StatementList`: every `var` `VariableDeclaration`
 * *and* every `FunctionDeclaration` reachable without crossing a function
 * boundary, in source order.
 *
 * Uses `classifyVarScopeWithFunctionHoistingCompat` rather than the spec-pure
 * `classifyVarScope` `varScopedDeclarations` uses — see that classify
 * function's doc comment for why: this engine has no block scoping yet, so a
 * `FunctionDeclaration` nested anywhere in a top-level block/if/loop/etc. is
 * still hoisted to the variable scope here, matching this engine's pre-Task-1
 * behavior exactly (`collectFunctionDeclarations` in `./declarations.js`, now
 * deleted) rather than real ES2015 (where only a *direct* top-level
 * `FunctionDeclaration`, or one reached through a top-level label chain, is
 * var-scoped). Task 4 replaces this with real block scoping plus Annex B.3.3
 * and removes the divergence.
 *
 * @param {readonly any[]} statements
 * @returns {any[]}
 */
export function topLevelVarScopedDeclarations(statements) {
  return collectOrdered(statements, classifyVarScopeWithFunctionHoistingCompat);
}

/**
 * ES2015 §13.2.9 (`TopLevelVarDeclaredNames`) over `statements` — the names
 * `topLevelVarScopedDeclarations` collects, in source order, with duplicates
 * preserved. Includes top-level (and nested-block, per the compatibility
 * note on `topLevelVarScopedDeclarations`) function declaration names
 * alongside `var` names, since ES2015 treats a top-level function declaration
 * as var-scoped.
 *
 * @param {readonly any[]} statements
 * @returns {string[]}
 */
export function topLevelVarDeclaredNames(statements) {
  return topLevelVarScopedDeclarations(statements).flatMap(boundNames);
}
