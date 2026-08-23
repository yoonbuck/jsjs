import { readdir, readFile } from 'node:fs/promises';
import { load as parseYaml } from 'js-yaml';
import { sortStrings } from './selection.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/**
 * @param {string} checkoutPath
 * @param {URL} [repositoryRootUrl]
 */
export async function readTest262HarnessDefinitions(
  checkoutPath,
  repositoryRootUrl = REPOSITORY_ROOT_URL,
) {
  const root = new URL(
    `${checkoutPath.replace(/\/$/u, '')}/harness/`,
    repositoryRootUrl,
  );
  const definitions = new Map();
  for (const name of await listFiles(root)) {
    const facts = { features: [], includes: [] };
    definitions.set(name, facts);
    if (name.endsWith('.js')) {
      definitions.set(name.slice(0, -'.js'.length), facts);
    }
  }

  /** @type {unknown} */
  let manifest;
  try {
    manifest = parseYaml(await readFile(new URL('features.yml', root), 'utf8'));
  } catch (error) {
    throw new Error(
      `vendor/test262/harness/features.yml is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest)
  ) {
    throw new Error(
      'vendor/test262/harness/features.yml must map include names to facts',
    );
  }

  const declared = new Set();
  for (const [name, value] of Object.entries(manifest)) {
    const aliases = harnessAliases(name);
    const identity = aliases[0];
    if (declared.has(identity)) {
      throw new Error(
        `vendor/test262/harness/features.yml repeats include alias ${name}`,
      );
    }
    if (!aliases.some((alias) => definitions.has(alias))) {
      throw new Error(
        `vendor/test262/harness/features.yml names missing include ${name}`,
      );
    }
    declared.add(identity);
    const facts = parseHarnessFacts(value, name);
    for (const alias of aliases) {
      definitions.set(alias, facts);
    }
  }
  return definitions;
}

/** @param {string} name */
function harnessAliases(name) {
  return name.endsWith('.js')
    ? [name.slice(0, -'.js'.length), name]
    : [name, `${name}.js`];
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function parseHarnessFacts(value, name) {
  if (Array.isArray(value)) {
    return {
      features: harnessStrings(value, `${name} features`),
      includes: [],
    };
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `vendor/test262/harness/features.yml include ${name} has invalid facts`,
    );
  }
  const facts = /** @type {Record<string, unknown>} */ (value);
  for (const key of Object.keys(facts)) {
    if (key !== 'features' && key !== 'includes') {
      throw new Error(
        `vendor/test262/harness/features.yml include ${name} has unknown key ${key}`,
      );
    }
  }
  return {
    features: harnessStrings(facts.features ?? [], `${name} features`),
    includes: harnessStrings(facts.includes ?? [], `${name} includes`),
  };
}

/** @param {unknown} values @param {string} label */
function harnessStrings(values, label) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || value === '')
  ) {
    throw new Error(
      `vendor/test262/harness/features.yml ${label} must be non-empty strings`,
    );
  }
  if (new Set(values).size !== values.length) {
    throw new Error(
      `vendor/test262/harness/features.yml ${label} must not repeat entries`,
    );
  }
  return sortStrings([...values]);
}

/** @param {URL} directory @param {string} [prefix] */
async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = sortStrings(entries.map((entry) => entry.name));
  /** @type {string[]} */
  const files = [];
  for (const name of names) {
    const entry = entries.find((candidate) => candidate.name === name);
    const relative = `${prefix}${name}`;
    if (entry?.isDirectory()) {
      files.push(
        ...(await listFiles(new URL(`${name}/`, directory), `${relative}/`)),
      );
    } else if (entry?.isFile()) {
      files.push(relative);
    }
  }
  return files;
}
