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
  /** @type {string[]} */
  const names = [];
  /** @type {{ node: any, exiting: boolean }[]} */
  const pending = [{ node, exiting: false }];
  const visiting = new WeakSet();

  while (pending.length > 0) {
    const { node: current, exiting } =
      /** @type {{ node: any, exiting: boolean }} */ (pending.pop());

    if (!current || typeof current !== 'object') {
      throw createUnsupportedNodeError(current);
    }

    if (exiting) {
      visiting.delete(current);
      continue;
    }

    if (visiting.has(current)) {
      throw createUnsupportedNodeError(current);
    }

    visiting.add(current);
    pending.push({ node: current, exiting: true });

    switch (current.type) {
      case 'Identifier':
        names.push(current.name);
        break;
      case 'FunctionDeclaration':
        // ES2015 grammar allows an anonymous `export default function () {}`,
        // whose BoundNames is the synthetic `"*default*"`, but this engine
        // parses no module grammar, so `node.id` is always present here.
        names.push(current.id.name);
        break;
      case 'ClassDeclaration':
        names.push(current.id.name);
        break;
      case 'VariableDeclaration':
        for (
          let index = current.declarations.length - 1;
          index >= 0;
          index -= 1
        ) {
          pending.push({
            node: current.declarations[index].id,
            exiting: false,
          });
        }
        break;
      case 'AssignmentPattern':
        pending.push({ node: current.left, exiting: false });
        break;
      case 'RestElement':
        pending.push({ node: current.argument, exiting: false });
        break;
      case 'ArrayPattern':
        for (let index = current.elements.length - 1; index >= 0; index -= 1) {
          if (current.elements[index] !== null) {
            pending.push({ node: current.elements[index], exiting: false });
          }
        }
        break;
      case 'ObjectPattern':
        for (
          let index = current.properties.length - 1;
          index >= 0;
          index -= 1
        ) {
          const property = current.properties[index];

          if (property.type === 'Property') {
            pending.push({ node: property.value, exiting: false });
          } else if (property.type === 'RestElement') {
            pending.push({ node: property, exiting: false });
          } else {
            throw createUnsupportedNodeError(property);
          }
        }
        break;
      default:
        throw createUnsupportedNodeError(current);
    }
  }

  return names;
}

/** @type {readonly any[]} */
const EMPTY_BOUND_NAME_CHILDREN = Object.freeze([]);

/**
 * Summarizes the concatenation of several BoundNames lists without expanding
 * repeated aliases in an AST DAG. Each graph node is classified once, then a
 * capped occurrence count is propagated from the roots through every semantic
 * edge. Repeating the same node in two positions therefore still makes each of
 * its names duplicate, while a recursively shared pattern takes work
 * proportional to the graph rather than to its expanded tree.
 *
 * The returned `names` set contains each bound name once. `duplicate` reports
 * whether any name occurs more than once in the conceptual concatenated list.
 * Cycles and unsupported binding nodes fail exactly as `boundNames` does.
 *
 * @param {readonly any[]} nodes
 * @returns {{ names: Set<string>, duplicate: boolean }}
 */
export function summarizeBoundNames(nodes) {
  /** @type {WeakMap<object, readonly any[]>} */
  const children = new WeakMap();
  /** @type {WeakMap<object, 1 | 2>} */
  const occurrences = new WeakMap();
  const visiting = new WeakSet();
  const completed = new WeakSet();
  /** @type {{ node: any, exiting: boolean }[]} */
  const pending = [];
  /** @type {any[]} */
  const discoveryOrder = [];
  /** @type {any[]} */
  const postorder = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({ node: nodes[index], exiting: false });
  }

  while (pending.length > 0) {
    const { node: current, exiting } =
      /** @type {{ node: any, exiting: boolean }} */ (pending.pop());

    if (!current || typeof current !== 'object') {
      throw createUnsupportedNodeError(current);
    }

    if (exiting) {
      visiting.delete(current);
      completed.add(current);
      postorder.push(current);
      continue;
    }

    if (completed.has(current)) {
      continue;
    }

    if (visiting.has(current)) {
      throw createUnsupportedNodeError(current);
    }

    const currentChildren = boundNameChildren(current);
    visiting.add(current);
    children.set(current, currentChildren);
    discoveryOrder.push(current);
    pending.push({ node: current, exiting: true });

    for (let index = currentChildren.length - 1; index >= 0; index -= 1) {
      if (currentChildren[index] !== null) {
        pending.push({ node: currentChildren[index], exiting: false });
      }
    }
  }

  for (let index = 0; index < nodes.length; index += 1) {
    addBoundNameOccurrences(occurrences, nodes[index], 1);
  }

  for (let index = postorder.length - 1; index >= 0; index -= 1) {
    const current = postorder[index];
    const count = occurrences.get(current);

    if (count === undefined) {
      continue;
    }

    const currentChildren = /** @type {readonly any[]} */ (
      children.get(current)
    );

    for (
      let childIndex = 0;
      childIndex < currentChildren.length;
      childIndex += 1
    ) {
      const child = currentChildren[childIndex];

      if (child !== null) {
        addBoundNameOccurrences(occurrences, child, count);
      }
    }
  }

  const names = new Set();
  let duplicate = false;

  for (const current of discoveryOrder) {
    const name = directlyBoundName(current);

    if (name === undefined) {
      continue;
    }

    if (occurrences.get(current) === 2 || names.has(name)) {
      duplicate = true;
    }

    names.add(name);
  }

  return { names, duplicate };
}

/**
 * @param {any} node
 * @returns {readonly any[]}
 */
function boundNameChildren(node) {
  switch (node.type) {
    case 'Identifier':
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return EMPTY_BOUND_NAME_CHILDREN;
    case 'VariableDeclaration': {
      /** @type {any[]} */
      const declarationIds = [];

      for (let index = 0; index < node.declarations.length; index += 1) {
        declarationIds.push(node.declarations[index].id);
      }

      return declarationIds;
    }
    case 'AssignmentPattern':
      return [node.left];
    case 'RestElement':
      return [node.argument];
    case 'ArrayPattern':
      return node.elements;
    case 'ObjectPattern':
      return node.properties;
    case 'Property':
      return [node.value];
    default:
      throw createUnsupportedNodeError(node);
  }
}

/**
 * @param {any} node
 * @returns {string | undefined}
 */
function directlyBoundName(node) {
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return node.id.name;
    default:
      return undefined;
  }
}

/**
 * @param {WeakMap<object, 1 | 2>} occurrences
 * @param {object} node
 * @param {1 | 2} count
 * @returns {void}
 */
function addBoundNameOccurrences(occurrences, node, count) {
  const previous = occurrences.get(node);
  occurrences.set(node, previous === undefined ? count : 2);
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
  const pending = [];
  for (let index = 0; index < seed.length; index += 1) {
    pending.push(seed[index]);
  }
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
 * This drives the spec-pure ES2015 §13.2.11/§13.2.12 walk (`varScopedDeclarations`
 * / `varDeclaredNames` via `classifyVarScope`), which descends through these
 * containers but never into a `FunctionDeclaration`'s body.
 *
 * @param {any} node
 * @param {any[]} pending
 * @returns {boolean}
 */
function pushVarScopeContainerChildren(node, pending) {
  switch (node.type) {
    case 'BlockStatement':
      for (let index = 0; index < node.body.length; index += 1) {
        pending.push(node.body[index]);
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
    case 'ForOfStatement':
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
      for (let caseIndex = 0; caseIndex < node.cases.length; caseIndex += 1) {
        const consequent = node.cases[caseIndex].consequent;
        for (
          let statementIndex = 0;
          statementIndex < consequent.length;
          statementIndex += 1
        ) {
          pending.push(consequent[statementIndex]);
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
 * The top-level `FunctionDeclaration` `item` designates, or `null`. A
 * `FunctionDeclaration` is one directly, and a `LabeledStatement` chain
 * (§13.2.8/§13.2.10 reach a `FunctionDeclaration` through `LabelledStatement`)
 * designates the `FunctionDeclaration` it ultimately wraps, unwrapped
 * iteratively so an arbitrarily long label chain costs no stack depth. Every
 * other item — including a `Block`, `if`, loop, `try`, or `switch` that may
 * *contain* a nested `FunctionDeclaration` — designates none: a nested
 * function is lexically scoped, and its web-legacy var alias is Annex B.3.3's
 * job (`annexBBlockFunctionDeclarations`), not `TopLevelVarScopedDeclarations`.
 *
 * @param {any} item
 * @returns {any}
 */
function topLevelFunctionDeclarationOf(item) {
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
 * `let`/`const` declaration, a `ClassDeclaration`, or a
 * `FunctionDeclaration`) plus its
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

  if (item.type === 'ClassDeclaration') {
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
 * `StatementList`: the `let`/`const` declarations, `ClassDeclaration`s, and
 * `FunctionDeclaration`s
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
 * or `null`. ES2015 §13.2.8: a `let`/`const` or `ClassDeclaration`
 * contributes; a
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
  if (
    (item.type === 'VariableDeclaration' && item.kind !== 'var') ||
    item.type === 'ClassDeclaration'
  ) {
    return item;
  }

  return null;
}

/**
 * ES2015 §13.2.8 (`TopLevelLexicallyScopedDeclarations`) over `statements`, a
 * `Program`/function body's `StatementList`: the `let`/`const` and class
 * declarations
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

  for (let index = 0; index < statements.length; index += 1) {
    const item = statements[index];
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
 * `Program`/function body's `StatementList`: every top-level
 * `FunctionDeclaration` — direct, or reached through a top-level
 * `LabeledStatement` chain — treated as var-scoped ("At the top level of a
 * function, or script, function declarations are treated like var declarations
 * rather than like lexical declarations", the §13.2.7 note), interleaved in
 * source order with the ordinary `VarScopedDeclarations` of every other item
 * (every `var` reachable without crossing a function boundary; §13.1.6 via its
 * per-statement forms).
 *
 * A `FunctionDeclaration` nested inside a block, `if`, loop, `try`, or `switch`
 * is *not* collected here: it is lexically scoped, and its non-strict web-
 * legacy var alias is `annexBBlockFunctionDeclarations`' job (Annex B.3.3), not
 * this function's. This is the real spec behavior; before block scoping existed
 * a deliberate stand-in collected such functions here (Task 1), which Task 4
 * replaced with `annexBBlockFunctionDeclarations` when it implemented block
 * scoping.
 *
 * @param {readonly any[]} statements
 * @returns {any[]}
 */
export function topLevelVarScopedDeclarations(statements) {
  /** @type {any[]} */
  const results = [];

  for (let index = 0; index < statements.length; index += 1) {
    const item = statements[index];
    const functionDeclaration = topLevelFunctionDeclarationOf(item);

    if (functionDeclaration !== null) {
      results.push(functionDeclaration);
      continue;
    }

    const scopedDeclarations = varScopedDeclarations([item]);
    for (
      let declarationIndex = 0;
      declarationIndex < scopedDeclarations.length;
      declarationIndex += 1
    ) {
      results.push(scopedDeclarations[declarationIndex]);
    }
  }

  return results;
}

/**
 * The lexically-declared names of a `for`/`for-in` head — the `BoundNames` of a
 * `let`/`const` `VariableDeclaration` in the head, or `[]` for a `var` or
 * expression head. Such a head is a lexical scope boundary over the loop body:
 * `for (let f; ; ) { var f; }` is an Early Error (ES2015 §13.7.5.1's "any
 * element of the BoundNames of LexicalDeclaration also occurs in the
 * VarDeclaredNames"), so a block-level `function f` in the body is *not*
 * eligible for the Annex B.3.3 var alias.
 *
 * @param {any} node
 * @returns {string[]}
 */
function forHeadLexicalNames(node) {
  const head = node.type === 'ForStatement' ? node.init : node.left;

  if (head && head.type === 'VariableDeclaration' && head.kind !== 'var') {
    return boundNames(head);
  }

  return [];
}

/**
 * Enqueues, onto `worklist`, every nested block-like `StatementList` reachable
 * from `list` without crossing a function boundary or descending *through*
 * another block first — the shallowest `Block`, `switch` `CaseBlock` (all
 * clause consequents concatenated into the one lexical scope §13.12.11 gives
 * them), and `try` part (each a `Block`) directly inside `list`. Non-block
 * containers (`if`, loops, `with`, labels) are transparent: their bodies are
 * walked for the blocks *they* contain, but a bare `FunctionDeclaration` that
 * is their direct child — `if (x) function f(){}` — is Annex B.3.2/B.3.4
 * territory, not B.3.3, so it is deliberately skipped.
 *
 * Each enqueued list carries `enclosingLexical`, the lexical names bound on the
 * path to it. A `for`/`for-in` head that declares `let`/`const` adds those
 * names for its body subtree only (`forHeadLexicalNames`), because such a head
 * is a lexical scope boundary — hence `pending` carries a per-node lexical set
 * rather than one set for the whole traversal. The walk is an explicit worklist
 * for the same reason the rest of this module is: it runs outside the stack
 * guard, over parser-accepted depth.
 *
 * @param {readonly any[]} list
 * @param {ReadonlySet<string>} enclosingLexical
 * @param {{ list: readonly any[], enclosingLexical: ReadonlySet<string> }[]} worklist
 * @returns {void}
 */
function pushNestedBlockLists(list, enclosingLexical, worklist) {
  /** @type {{ node: any, lexical: ReadonlySet<string> }[]} */
  const pending = [];
  for (const node of list) {
    pending.push({ node, lexical: enclosingLexical });
  }

  while (pending.length > 0) {
    const { node, lexical } =
      /** @type {{ node: any, lexical: ReadonlySet<string> }} */ (
        pending.pop()
      );

    switch (node.type) {
      case 'BlockStatement':
        worklist.push({ list: node.body, enclosingLexical: lexical });
        break;
      case 'SwitchStatement': {
        /** @type {any[]} */
        const caseBlock = [];
        for (const switchCase of node.cases) {
          for (const statement of switchCase.consequent) {
            caseBlock.push(statement);
          }
        }
        worklist.push({ list: caseBlock, enclosingLexical: lexical });
        break;
      }
      case 'TryStatement':
        pending.push({ node: node.block, lexical });
        if (node.handler !== null) {
          pending.push({ node: node.handler.body, lexical });
        }
        if (node.finalizer !== null) {
          pending.push({ node: node.finalizer, lexical });
        }
        break;
      case 'IfStatement':
        pending.push({ node: node.consequent, lexical });
        if (node.alternate) {
          pending.push({ node: node.alternate, lexical });
        }
        break;
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const headNames = forHeadLexicalNames(node);
        let bodyLexical = lexical;
        if (headNames.length > 0) {
          const augmented = new Set(lexical);
          for (const name of headNames) {
            augmented.add(name);
          }
          bodyLexical = augmented;
        }
        pending.push({ node: node.body, lexical: bodyLexical });
        break;
      }
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'LabeledStatement':
      case 'WithStatement':
        pending.push({ node: node.body, lexical });
        break;
      default:
        break;
    }
  }
}

/**
 * ES2015 Annex B.3.3 (Block-Level Function Declarations Web Legacy
 * Compatibility Semantics): the `FunctionDeclaration` nodes directly contained
 * in a `Block`, `switch` `CaseBlock`, or `try` part anywhere within
 * `statements` (without crossing a function boundary) that are *eligible* for a
 * var-scoped alias of the same name, returned in source order.
 *
 * Eligibility is a property of each declaration node, not of its name: two
 * block functions may share a name yet differ in eligibility, and only the
 * eligible ones alias. Callers therefore key their per-declaration copy on node
 * identity (a `Set` of these nodes), never on the name — see
 * `evaluateFunctionDeclaration` (`./statements.js`). The result is a
 * `*Declarations` list of nodes, so it needs no de-duplication and preserves
 * the module's source-order contract.
 *
 * `outerLexicalNames` is the set of names lexically declared at the top level
 * of the enclosing function/script/eval scope (its
 * `TopLevelLexicallyDeclaredNames`). A candidate declaration of `F` is eligible
 * only when replacing it with `var F` would raise no early error — i.e. `F`
 * collides with no lexical declaration in `outerLexicalNames`, in any block on
 * the path from the function to `F`'s block, nor in a `for`/`for-in` head that
 * encloses `F`'s block (B.3.3.1's "would not produce any Early Errors" clause).
 * A block's own lexical names cannot collide with a function it directly
 * contains (the parser rejects that redeclaration), so they only matter for the
 * *deeper* blocks they enclose, which is exactly how `enclosingLexical`
 * accumulates them.
 *
 * The caller (function/global/eval declaration instantiation) creates an
 * `undefined`-initialized var binding for each returned declaration's name
 * where doing so is legal for that scope, and the block function's evaluation
 * copies its value into the var scope in source order.
 *
 * @param {readonly any[]} statements
 * @param {ReadonlySet<string>} outerLexicalNames
 * @returns {any[]}
 */
export function annexBBlockFunctionDeclarations(statements, outerLexicalNames) {
  /** @type {any[]} */
  const eligible = [];
  /** @type {{ list: readonly any[], enclosingLexical: ReadonlySet<string> }[]} */
  const worklist = [];

  pushNestedBlockLists(statements, outerLexicalNames, worklist);

  while (worklist.length > 0) {
    const scope =
      /** @type {{ list: readonly any[], enclosingLexical: ReadonlySet<string> }} */ (
        worklist.pop()
      );

    for (const declaration of lexicallyScopedDeclarations(scope.list)) {
      if (declaration.type !== 'FunctionDeclaration') {
        continue;
      }

      if (!scope.enclosingLexical.has(declaration.id.name)) {
        eligible.push(declaration);
      }
    }

    /** @type {Set<string>} */
    const innerLexical = new Set(scope.enclosingLexical);
    for (const name of lexicallyDeclaredNames(scope.list)) {
      innerLexical.add(name);
    }

    pushNestedBlockLists(scope.list, innerLexical, worklist);
  }

  // The LIFO worklist visits scopes out of source order; sort by parser offset
  // so the returned list honors the `*Declarations` source-order contract.
  eligible.sort((a, b) => a.start - b.start);

  return eligible;
}

/**
 * ES2015 §13.2.9 (`TopLevelVarDeclaredNames`) over `statements` — the names
 * `topLevelVarScopedDeclarations` collects, in source order, with duplicates
 * preserved. Includes top-level function declaration names alongside `var`
 * names, since ES2015 treats a top-level function declaration as var-scoped; a
 * function nested in a block is lexically scoped and excluded (its Annex B.3.3
 * alias, if any, is `annexBBlockFunctionDeclarations`' concern).
 *
 * @param {readonly any[]} statements
 * @returns {string[]}
 */
export function topLevelVarDeclaredNames(statements) {
  return topLevelVarScopedDeclarations(statements).flatMap(boundNames);
}
