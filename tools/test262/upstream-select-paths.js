/**
 * Source-dependent path selection for the pinned Test262 generator.
 *
 * The caller supplies its file list, parsed harness status, and source reader.
 * Keeping those boundaries injected lets the Node-only unit test prove that
 * path-only policy filters run before any test source is read.
 */

import { parseScript } from '../../src/parser.js';
import {
  isCandidatePath,
  isStructurallyEligiblePath,
  scanFrontmatter,
} from './es5-selection.js';

const GENERATOR_EXPANSION_FEATURE = 'generators';

/**
 * Whether a source parses under the grammar enabled for broad selection.
 * Production parsing may widen before the corresponding Test262 expansion is
 * ready, so generator syntax remains outside this boundary until the policy
 * explicitly enables it. Parse failure is a non-candidate rather than a
 * selection failure.
 *
 * @param {string} source
 * @param {import('./es5-selection.js').Es5SelectionPolicy} policy
 * @returns {boolean}
 */
export function parsesUnderEngineGrammar(source, policy) {
  return inspectEngineGrammar(source, policy).parsesUnderEngineGrammar;
}

/**
 * @param {string} source
 * @param {import('./es5-selection.js').Es5SelectionPolicy} policy
 * @returns {{ parsesUnderEngineGrammar: boolean, usesGeneratorSyntax: boolean }}
 */
function inspectEngineGrammar(source, policy) {
  try {
    const program = parseScript(source);
    const usesGeneratorSyntax = containsGeneratorSyntax(program);

    return {
      parsesUnderEngineGrammar:
        policy.expansionFeatures.includes(GENERATOR_EXPANSION_FEATURE) ||
        !usesGeneratorSyntax,
      usesGeneratorSyntax,
    };
  } catch {
    return {
      parsesUnderEngineGrammar: false,
      usesGeneratorSyntax: false,
    };
  }
}

/**
 * Detects generator syntax in a trusted Acorn AST without retaining a host call
 * stack proportional to source depth.
 *
 * @param {any} program
 * @returns {boolean}
 */
function containsGeneratorSyntax(program) {
  const worklist = [program];

  while (worklist.length > 0) {
    const node = worklist.pop();

    if (node.generator === true || node.type === 'YieldExpression') {
      return true;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || value === null || typeof value !== 'object') {
        continue;
      }

      if (Array.isArray(value)) {
        for (const element of value) {
          if (element !== null && typeof element === 'object') {
            worklist.push(element);
          }
        }
      } else {
        worklist.push(value);
      }
    }
  }

  return false;
}

/**
 * Applies path and source-derived selection decisions to an upstream file list.
 * `isStructurallyEligiblePath` must remain before `readSource`: it is the
 * metadata-free prefilter that avoids reading paths the policy already rejects.
 *
 * @param {{
 *   files: readonly string[],
 *   policy: import('./es5-selection.js').Es5SelectionPolicy,
 *   previouslySelected: ReadonlySet<string>,
 *   harnessParsing: ReadonlyMap<string, boolean>,
 *   readSource: (path: string) => string | Promise<string>,
 * }} options
 * @returns {Promise<string[]>}
 */
export async function selectPaths(options) {
  const { files, policy, previouslySelected, harnessParsing, readSource } =
    options;
  /** @type {string[]} */
  const selected = [];

  for (const path of files) {
    if (!isStructurallyEligiblePath(path, policy)) {
      continue;
    }

    const source = await readSource(path);
    const frontmatter = scanFrontmatter(source);
    const grammar = inspectEngineGrammar(source, policy);
    const info = {
      declaresFeatures: frontmatter.hasFeatures,
      features: frontmatter.features,
      isModule: frontmatter.isModule,
      usesGeneratorSyntax: grammar.usesGeneratorSyntax,
      parsesUnderEngineGrammar: grammar.parsesUnderEngineGrammar,
      includesParseUnderEngineGrammar: frontmatter.includes.every(
        (name) => harnessParsing.get(name) !== false,
      ),
    };

    if (isCandidatePath(path, info, policy, previouslySelected)) {
      selected.push(path);
    }
  }

  return selected;
}
