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

/**
 * Whether a source parses under the engine's supported grammar. Selection asks
 * only the yes/no question, so parse failure is a non-candidate rather than a
 * generator failure.
 *
 * @param {string} source
 * @returns {boolean}
 */
export function parsesUnderEngineGrammar(source) {
  try {
    parseScript(source);

    return true;
  } catch {
    return false;
  }
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
    const info = {
      declaresFeatures: frontmatter.hasFeatures,
      features: frontmatter.features,
      isModule: frontmatter.isModule,
      parsesUnderEngineGrammar: parsesUnderEngineGrammar(source),
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
