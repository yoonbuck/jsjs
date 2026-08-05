/**
 * Node-only contract test for the CI workflow and the Test262 feature
 * manifest.
 *
 * Like `repository-invariants.test.js`, this suite needs a filesystem and a
 * shell, so it cannot run in the browser or the `jsc` shell. Its job is
 * narrower than that file's, though: rather than reading source text and
 * grepping for expected substrings, every assertion here either runs a
 * declared command for real and checks its actual exit status and output, or
 * cross-references two structured sources (parsed JSON/JS data) against each
 * other. `.github/workflows/ci.yml` is treated as a generated artifact of
 * `tools/ci/pipeline.js` (the same relationship `vendor/` has to
 * `tools/vendor/sync.js`): the workflow file is never hand-authored text this
 * suite pattern-matches, it is the byte-for-byte output of a function this
 * suite calls directly.
 *
 * `npm run test:browser` is only actually executed when a Playwright
 * Chromium binary is already installed locally, mirroring this project's
 * existing "run JSC conditionally when available" convention — a fresh
 * checkout without browsers installed must still be able to run
 * `npm test`/`npm run test:node`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertSame, assertThrows } from '../harness/assert.js';
import { createRealm, evaluateScript } from '../../src/index.js';
import { runTest262Suite } from '../../tools/test262/runner.js';
import {
  CI_JOBS,
  renderWorkflowYaml,
  listDeclaredNpmScripts,
} from '../../tools/ci/pipeline.js';
import {
  FEATURES_MANIFEST_FILE,
  Test262FeatureManifestError,
  parseFeatureManifest,
  resolveSupportedFeatures,
} from '../../tools/test262/features.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT_URL);
const REQUIRED_JOB_IDS = Object.freeze([
  'vendor',
  'format',
  'lint',
  'typecheck',
  'test-node',
  'test-browser',
  'test262-subset',
]);

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * Runs an npm script for real and returns its stdout, so a declared CI
 * command is validated by executing it rather than by inspecting text.
 *
 * @param {string} script
 * @returns {string}
 */
function runNpmScript(script) {
  const output = execFileSync('npm', ['run', '--silent', script], {
    cwd: REPOSITORY_ROOT_PATH,
    encoding: 'utf8',
  });

  return typeof output === 'string' ? output : String(output);
}

/**
 * @param {string} output Newline-delimited JSON, as every project report is.
 * @returns {unknown[]}
 */
function parseJsonLines(output) {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/**
 * @returns {Promise<boolean>}
 */
async function isPlaywrightChromiumInstalled() {
  try {
    const { existsSync } = await import('node:fs');
    const { chromium } = await import('playwright');

    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/**
 * A minimal, raw (no harness) fixture declaring exactly one feature, used to
 * probe the runner's real pass/skip decision for that feature name.
 *
 * @param {string} feature
 * @returns {string}
 */
function featureProbeSource(feature) {
  return [
    '/*---',
    `description: probes runner behavior for the feature "${feature}"`,
    `features: [${feature}]`,
    'flags: [raw]',
    '---*/',
    'var probe = true;',
  ].join('\n');
}

/**
 * @param {string} feature
 * @returns {import('../../tools/test262/runner.js').Test262Host}
 */
function createFeatureProbeHost(feature) {
  const source = featureProbeSource(feature);

  return {
    readTest() {
      return source;
    },
    readInclude(name) {
      throw new Error(`unexpected include for a raw fixture: ${name}`);
    },
  };
}

const engine = { createRealm, evaluateScript };

export default [
  {
    name: 'the CI pipeline module declares a job for every required check',
    run: () => {
      const ids = [...CI_JOBS.map((job) => job.id)].sort().join(',');

      assertSame(ids, [...REQUIRED_JOB_IDS].sort().join(','));
    },
  },
  {
    name: 'every npm-run command the CI pipeline declares exists in package.json',
    run: async () => {
      const packageManifest = JSON.parse(
        await readRepositoryFile('package.json'),
      );
      const declared = listDeclaredNpmScripts(CI_JOBS);
      const missing = declared.filter(
        (script) =>
          !Object.prototype.hasOwnProperty.call(
            packageManifest.scripts,
            script,
          ),
      );

      assertSame(missing.join(','), '');
      assertSame(declared.length >= REQUIRED_JOB_IDS.length, true);
    },
  },
  {
    name: 'the browser job installs Playwright reproducibly before running suites',
    run: () => {
      const browserJob = CI_JOBS.find((job) => job.id === 'test-browser');

      if (browserJob === undefined) {
        throw new Error('expected a test-browser job');
      }

      const installStep = browserJob.steps.find(
        (step) => 'run' in step && step.run.includes('playwright install'),
      );

      if (installStep === undefined || !('run' in installStep)) {
        throw new Error('expected a Playwright install step');
      }

      assertSame(installStep.run.includes('--with-deps'), true);
      assertSame(installStep.run.includes('chromium'), true);
    },
  },
  {
    name: 'the committed workflow file is exactly what the pipeline module renders',
    run: async () => {
      const rendered = renderWorkflowYaml(CI_JOBS);
      const committed = await readRepositoryFile('.github/workflows/ci.yml');

      assertSame(committed, rendered);
    },
  },
  {
    name: 'npm run vendor:check passes for real',
    run: () => {
      runNpmScript('vendor:check');
    },
  },
  {
    name: 'npm run format passes for real',
    run: () => {
      runNpmScript('format');
    },
  },
  {
    name: 'npm run lint passes for real',
    run: () => {
      runNpmScript('lint');
    },
  },
  {
    name: 'npm run typecheck passes for real',
    run: () => {
      runNpmScript('typecheck');
    },
  },
  {
    name: 'npm run test262:subset passes for real and reports a clean, valid summary',
    run: () => {
      const output = runNpmScript('test262:subset');
      const records = parseJsonLines(output);
      const summary = records[records.length - 1];

      assertSame(typeof summary === 'object' && summary !== null, true);
      assertSame(/** @type {{ type: string }} */ (summary).type, 'summary');
      assertSame(/** @type {{ failed: number }} */ (summary).failed, 0);
      assertSame(records.length > 1, true);
    },
  },
  {
    name: 'npm run test:browser runs for real when a Playwright browser is installed locally',
    run: async () => {
      if (!(await isPlaywrightChromiumInstalled())) {
        return;
      }

      runNpmScript('test:browser');
    },
  },
  {
    name: 'features.json parses as a well-formed manifest and matches the current milestone baseline',
    run: async () => {
      const text = await readRepositoryFile(FEATURES_MANIFEST_FILE);
      const features = parseFeatureManifest(text);

      assertSame(Array.isArray(features), true);
      assertSame(new Set(features).size, features.length);
      assertSame(features.join(','), [...features].sort().join(','));
      // Today's milestone baseline: this is still an ES5-core engine, so no
      // post-ES5 Test262 `features` tag is supported yet. Updating this
      // number is expected the day a future task adds a test-backed feature.
      assertSame(features.length, 0);
    },
  },
  {
    name: 'parseFeatureManifest rejects every malformed shape through real parsing, not inspection',
    run: () => {
      assertThrows(
        () => parseFeatureManifest('not json'),
        Test262FeatureManifestError,
      );
      assertThrows(
        () => parseFeatureManifest('{}'),
        Test262FeatureManifestError,
      );
      assertThrows(
        () => parseFeatureManifest('["Proxy","Proxy"]'),
        Test262FeatureManifestError,
      );
      assertThrows(
        () => parseFeatureManifest('["", "Proxy"]'),
        Test262FeatureManifestError,
      );
      assertThrows(
        () => parseFeatureManifest('[1]'),
        Test262FeatureManifestError,
      );
    },
  },
  {
    name: 'resolveSupportedFeatures lets an explicit CLI list override the manifest, and reads the manifest for real otherwise',
    run: () => {
      assertSame(
        resolveSupportedFeatures({
          cliFeatures: ['Zeta', 'Alpha'],
          manifestText: '["ignored-because-explicit-wins"]',
        }).join(','),
        'Alpha,Zeta',
      );
      assertSame(
        resolveSupportedFeatures({
          cliFeatures: undefined,
          manifestText: '["Beta", "Alpha"]',
        }).join(','),
        'Alpha,Beta',
      );
      assertThrows(
        () =>
          resolveSupportedFeatures({
            cliFeatures: undefined,
            manifestText: 'not json',
          }),
        Test262FeatureManifestError,
      );
    },
  },
  {
    name: 'the Node adapter default and an explicit --features flag built from the manifest report byte-identical output',
    run: async () => {
      const manifestText = await readRepositoryFile(FEATURES_MANIFEST_FILE);
      const manifestFeatures = parseFeatureManifest(manifestText);
      const withDefault = execFileSync(
        'node',
        ['tools/test262/adapters/node.js', '--root=test/fixtures/test262'],
        { cwd: REPOSITORY_ROOT_PATH, encoding: 'utf8' },
      );
      const withExplicit = execFileSync(
        'node',
        [
          'tools/test262/adapters/node.js',
          '--root=test/fixtures/test262',
          `--features=${manifestFeatures.join(',')}`,
        ],
        { cwd: REPOSITORY_ROOT_PATH, encoding: 'utf8' },
      );

      assertSame(withDefault, withExplicit);
    },
  },
  {
    name: 'every feature the manifest declares is honoured by the runner: skipped when unsupported, passed when supported',
    run: async () => {
      const text = await readRepositoryFile(FEATURES_MANIFEST_FILE);
      const features = parseFeatureManifest(text);

      // Vacuous today (the manifest is empty), but this exercises the real
      // pass/skip decision through `runTest262Suite` for every declared
      // feature automatically the day one is added — it is not a static
      // assertion about the runner, it is the runner actually running.
      for (const feature of features) {
        const supported = await runTest262Suite({
          engine,
          host: createFeatureProbeHost(feature),
          paths: ['probe.js'],
          supportedFeatures: [feature],
        });

        assertSame(supported.records[0].status, 'passed');

        const unsupported = await runTest262Suite({
          engine,
          host: createFeatureProbeHost(feature),
          paths: ['probe.js'],
          supportedFeatures: [],
        });

        assertSame(unsupported.records[0].status, 'skipped');
        assertSame(unsupported.records[0].reason, 'unsupported-feature');
      }
    },
  },
];
