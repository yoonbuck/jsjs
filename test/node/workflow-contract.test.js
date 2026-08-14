/**
 * Node-only, deterministic contract for the generated CI workflow and the two
 * checked-in Test262 manifests.
 *
 * This suite runs inside `npm run test:node`, so it must stay deterministic
 * and machine-independent: it never spawns a subprocess, never touches the
 * network, and never runs the CI pipeline it describes. Everything here is
 * either structured data parsed from a real file (the workflow YAML through a
 * real YAML parser, `package.json`, the two manifests) or a real execution of
 * the engine against manifest-declared source. The commands themselves are
 * executed by `npm run ci:contract` (`test/ci/full-contract.test.js`), which is
 * deliberately *not* registered with the Node runner.
 *
 * The workflow is a generated artifact of `tools/ci/pipeline.js`, but a
 * byte comparison against its own generator proves only that nobody hand-edited
 * the file. So the claims that matter — least-privilege permissions, immutable
 * action pins, which command each job runs, the upstream Test262 revision, the
 * report artifact — are asserted against the *parsed committed YAML*, using an
 * expectation table written out here rather than imported from the generator.
 */

import { readFile } from 'node:fs/promises';
import { load as parseYaml } from 'js-yaml';
import { assertSame, assertThrows } from '../harness/assert.js';
import { createRealm, evaluateScript } from '../../src/index.js';
import { runTest262Suite } from '../../tools/test262/runner.js';
import {
  ACTION_PINS,
  TEST262_REPORT_FILE,
  WORKFLOW_FILE,
  loadCiPipeline,
  renderWorkflowYaml,
} from '../../tools/ci/pipeline.js';
import {
  FEATURES_MANIFEST_FILE,
  Test262FeatureManifestError,
  featureNames,
  featureProbeTestSource,
  parseFeatureManifest,
  resolveSupportedFeatures,
  runFeatureProbe,
} from '../../tools/test262/features.js';
import {
  UPSTREAM_SUBSET_FILE,
  Test262UpstreamSubsetError,
  formatUpstreamSummaryLines,
  parseUpstreamSubset,
  summarizeUpstreamRun,
  upstreamSubsetPaths,
} from '../../tools/test262/upstream.js';

const REPOSITORY_ROOT_URL = new URL('../../', import.meta.url);

/**
 * The command each CI job is supposed to run, spelled out here instead of
 * imported from `tools/ci/pipeline.js`: this table is the independent
 * expectation the committed workflow is checked against.
 */
const EXPECTED_JOB_COMMANDS = Object.freeze({
  'ci-drift': 'npm run ci:check',
  vendor: 'npm run vendor:check',
  format: 'npm run format',
  lint: 'npm run lint',
  typecheck: 'npm run typecheck',
  'test-node': 'npm run test:node',
  'test-browser': 'npm run test:browser',
  'test-jsc': 'npm run test:jsc',
  'test262-fixtures': 'npm run test262:fixtures',
  'test262-upstream': 'npm run test262:upstream',
  'benchmark-smoke': 'npm run benchmark:smoke',
});

/** The exact browser install command that docs/testing.md documents. */
const BROWSER_INSTALL_COMMAND =
  'npx playwright install --with-deps --only-shell chromium';

const JSC_INSTALL_COMMAND = [
  'sudo apt-get update',
  'sudo apt-get install --yes libjavascriptcoregtk-4.1-bin',
  'sudo ln --symbolic --force /usr/bin/jsc-4.1 /usr/local/bin/jsc',
].join(' && ');

/**
 * Representative fixtures for each ES5 Date family the engine completed.
 *
 * These began as the exact contents of hand-curated `date-*` subset groups,
 * back when the pinned subset was a small curated selection. The subset is now
 * derived from upstream directories, so `built-ins/Date` is selected wholesale
 * and those curated group names no longer exist. The fixtures are still the
 * independent expectation: whatever the derivation rules become, the subset has
 * to keep covering every family listed here, so a selection change that quietly
 * dropped Date coverage still fails this contract.
 */
const DATE_GROUPS = Object.freeze({
  'date-accessors-mutators': Object.freeze([
    'test/built-ins/Date/prototype/getUTCFullYear/this-value-valid-date.js',
    'test/built-ins/Date/prototype/getUTCMilliseconds/this-value-valid-date.js',
    'test/built-ins/Date/prototype/setUTCHours/this-value-valid-date-ms.js',
    'test/built-ins/Date/prototype/setUTCMilliseconds/this-value-valid-date.js',
    'test/built-ins/Date/prototype/setUTCMonth/this-value-valid-date-month.js',
  ]),
  'date-construction-statics': Object.freeze([
    'test/built-ins/Date/15.9.1.15-1.js',
    'test/built-ins/Date/S15.9.2.1_A2.js',
    'test/built-ins/Date/S15.9.3.2_A3_T1.1.js',
    'test/built-ins/Date/UTC/fp-evaluation-order.js',
    'test/built-ins/Date/UTC/overflow-make-day.js',
    'test/built-ins/Date/UTC/time-clip.js',
  ]),
  'date-formatting-json': Object.freeze([
    'test/built-ins/Date/prototype/S15.9.5_A42_T1.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-3.js',
    'test/built-ins/Date/prototype/toJSON/non-finite.js',
    'test/built-ins/Date/prototype/valueOf/S9.4_A3_T1.js',
  ]),
});

/**
 * The drift check the Test262 job is supposed to run, spelled out rather than
 * imported for the same reason the command table above is: it is the
 * independent expectation. A path git does not track has no diff at all, so the
 * tracked-ness check in front of `git diff` is the part that makes this
 * meaningful.
 */
const EXPECTED_DRIFT_COMMAND =
  'git ls-files --error-unmatch docs/test262-report.jsonl docs/conformance.md > /dev/null && git diff --exit-code -- docs/test262-report.jsonl docs/conformance.md';

const engine = { createRealm, evaluateScript };

/**
 * @param {string} path Repository-relative.
 * @returns {Promise<string>}
 */
function readRepositoryFile(path) {
  return readFile(new URL(path, REPOSITORY_ROOT_URL), 'utf8');
}

/**
 * @returns {Promise<any>}
 */
async function readPackageManifest() {
  return JSON.parse(await readRepositoryFile('package.json'));
}

/**
 * @returns {Promise<{ text: string, workflow: any }>}
 */
async function readWorkflow() {
  const text = await readRepositoryFile(WORKFLOW_FILE);

  return { text, workflow: parseYaml(text) };
}

/**
 * @param {any} workflow
 * @param {string} id
 * @returns {any}
 */
function requireJob(workflow, id) {
  const job = workflow.jobs?.[id];

  if (job === undefined) {
    throw new Error(`the committed workflow has no ${id} job`);
  }

  return job;
}

/**
 * @param {any} job
 * @returns {string[]}
 */
function runCommands(job) {
  return (job.steps ?? [])
    .filter((/** @type {any} */ step) => typeof step.run === 'string')
    .map((/** @type {any} */ step) => step.run);
}

/**
 * @param {any} job
 * @param {string} action
 * @returns {any[]}
 */
function usesSteps(job, action) {
  return (job.steps ?? []).filter(
    (/** @type {any} */ step) =>
      typeof step.uses === 'string' && step.uses.startsWith(`${action}@`),
  );
}

/**
 * A synthetic manifest with a probe that only completes on an engine that
 * really evaluates arithmetic and loops, so the probe machinery is exercised
 * for real even while the project's own manifest is still empty.
 */
const SYNTHETIC_MANIFEST_TEXT = JSON.stringify({
  version: 1,
  features: [
    {
      name: 'jsjs-arithmetic-probe',
      probe: [
        'var total = 0;',
        'var index = 0;',
        'while (index < 4) {',
        '  total = total + index;',
        '  index = index + 1;',
        '}',
        'if (total !== 6) {',
        '  throw "arithmetic probe computed " + total;',
        '}',
      ].join('\n'),
      tests: ['test/language/expressions/addition/S11.6.1_A2.4_T1.js'],
    },
  ],
});

/**
 * @param {string} probe
 * @returns {{ name: string, probe: string, tests: readonly string[] }}
 */
function syntheticFeature(probe) {
  return {
    name: 'jsjs-synthetic-probe',
    probe,
    tests: ['test/language/types/undefined/S8.1_A1_T1.js'],
  };
}

export default [
  {
    name: 'the committed workflow grants least-privilege permissions at the top level',
    run: async () => {
      const { workflow } = await readWorkflow();

      assertSame(JSON.stringify(workflow.permissions), '{"contents":"read"}');

      for (const id of Object.keys(EXPECTED_JOB_COMMANDS)) {
        const job = requireJob(workflow, id);

        assertSame(
          job.permissions === undefined,
          true,
          `${id} must inherit the workflow's read-only permissions`,
        );
      }
    },
  },
  {
    name: 'every action the workflow uses is pinned to an immutable commit SHA with a version comment',
    run: async () => {
      const { text, workflow } = await readWorkflow();
      /** @type {string[]} */
      const referenced = [];

      for (const id of Object.keys(workflow.jobs)) {
        for (const step of workflow.jobs[id].steps ?? []) {
          if (typeof step.uses === 'string') {
            referenced.push(step.uses);
          }
        }
      }

      assertSame(referenced.length > 0, true, 'the workflow uses actions');

      const pins = new Map(ACTION_PINS.map((pin) => [pin.action, pin]));

      for (const reference of referenced) {
        const match = /^([^@]+)@([0-9a-f]{40})$/.exec(reference);

        assertSame(
          match !== null,
          true,
          `${reference} must be pinned to a full 40-character commit SHA`,
        );

        const pin = pins.get(/** @type {RegExpExecArray} */ (match)[1]);

        assertSame(
          pin !== undefined,
          true,
          `${reference} is not a declared action pin`,
        );
        assertSame(
          /** @type {RegExpExecArray} */ (match)[2],
          /** @type {{ sha: string }} */ (pin).sha,
        );
      }

      // The comment identifying the human-readable version lives in the raw
      // text; a YAML parser drops it, so it is checked separately.
      const usesLines = text
        .split('\n')
        .filter((line) => /^\s*(?:- )?uses:/.test(line));

      assertSame(usesLines.length, referenced.length);

      for (const line of usesLines) {
        const match =
          /^\s*(?:- )?uses: ([^@]+)@([0-9a-f]{40}) # (v[\w.]+)$/.exec(line);

        assertSame(
          match !== null,
          true,
          `${line.trim()} must name its version in a trailing comment`,
        );

        const pin = pins.get(/** @type {RegExpExecArray} */ (match)[1]);

        assertSame(
          /** @type {RegExpExecArray} */ (match)[3],
          /** @type {{ version: string }} */ (pin).version,
        );
      }
    },
  },
  {
    name: 'every required job exists and runs exactly the command it is supposed to run',
    run: async () => {
      const { workflow } = await readWorkflow();
      const packageManifest = await readPackageManifest();

      assertSame(
        Object.keys(workflow.jobs).sort().join(','),
        Object.keys(EXPECTED_JOB_COMMANDS).sort().join(','),
      );

      for (const [id, command] of Object.entries(EXPECTED_JOB_COMMANDS)) {
        const job = requireJob(workflow, id);
        const commands = runCommands(job);

        assertSame(
          commands.includes(command),
          true,
          `${id} must run ${command}, found: ${commands.join(' | ')}`,
        );

        const script = command.slice('npm run '.length);

        assertSame(
          Object.prototype.hasOwnProperty.call(packageManifest.scripts, script),
          true,
          `package.json must declare the ${script} script`,
        );
      }
    },
  },
  {
    name: 'the browser job installs exactly the headless browser command that docs/testing.md documents',
    run: async () => {
      const { workflow } = await readWorkflow();
      const testingDoc = await readRepositoryFile('docs/testing.md');
      const commands = runCommands(requireJob(workflow, 'test-browser'));

      assertSame(
        commands.includes(BROWSER_INSTALL_COMMAND),
        true,
        `test-browser must install browsers with ${BROWSER_INSTALL_COMMAND}`,
      );
      assertSame(
        commands.indexOf(BROWSER_INSTALL_COMMAND) <
          commands.indexOf('npm run test:browser'),
        true,
        'the install step must come before the browser suite runs',
      );
      assertSame(
        testingDoc.includes(BROWSER_INSTALL_COMMAND),
        true,
        'docs/testing.md must document the exact install command CI uses',
      );
    },
  },
  {
    name: 'the required JavaScriptCore job installs a shell and runs the portable suite',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, 'test-jsc');
      const commands = runCommands(job);

      assertSame(job.name, 'JavaScriptCore tests');
      assertSame(JSON.stringify(job.needs), JSON.stringify(['vendor']));
      assertSame(
        commands.includes(JSC_INSTALL_COMMAND),
        true,
        `test-jsc must install JavaScriptCore with ${JSC_INSTALL_COMMAND}`,
      );
      assertSame(
        commands.indexOf(JSC_INSTALL_COMMAND) <
          commands.indexOf('npm run test:jsc'),
        true,
        'the JavaScriptCore shell must be installed before the JSC suite runs',
      );
    },
  },
  {
    name: 'the Test262 job checks out the pinned upstream revision and publishes its report even on failure',
    run: async () => {
      const { workflow } = await readWorkflow();
      const packageManifest = await readPackageManifest();
      const job = requireJob(workflow, 'test262-upstream');
      const checkouts = usesSteps(job, 'actions/checkout');
      const upstream = checkouts.filter(
        (step) => step.with?.repository !== undefined,
      );

      assertSame(upstream.length, 1, 'exactly one upstream checkout step');
      assertSame(upstream[0].with.repository, 'tc39/test262');
      assertSame(upstream[0].with.ref, packageManifest.test262.revision);
      assertSame(upstream[0].with.path, packageManifest.test262.checkoutPath);
      assertSame(String(upstream[0].with['persist-credentials']), 'false');
      assertSame(
        checkouts.indexOf(upstream[0]) > 0,
        true,
        'the upstream tree is checked out after the project checkout',
      );

      const uploads = usesSteps(job, 'actions/upload-artifact');

      assertSame(uploads.length, 1, 'exactly one artifact upload step');
      assertSame(uploads[0].if, 'always()');
      assertSame(uploads[0].with.path, TEST262_REPORT_FILE);
      assertSame(uploads[0].with['if-no-files-found'], 'error');

      const commands = runCommands(job);
      const run = commands.indexOf('npm run test262:upstream');
      const drift = commands.indexOf(EXPECTED_DRIFT_COMMAND);
      const select = commands.indexOf('npm run test262:select:check');

      assertSame(
        select >= 0 && select < run,
        true,
        `the ES5 selection drift check must run before the pinned subset:\n${commands.join('\n')}`,
      );

      assertSame(
        drift > run && run >= 0,
        true,
        `the generated report and coverage document must be checked for drift after the run:\n${commands.join('\n')}`,
      );
      assertSame(
        job.steps.indexOf(uploads[0]) >
          job.steps.findIndex(
            (/** @type {any} */ step) =>
              step.run === 'npm run test262:upstream',
          ),
        true,
        'the upload publishes what the run just wrote',
      );

      const runStep = job.steps.find(
        (/** @type {any} */ step) => step.run === 'npm run test262:upstream',
      );

      assertSame(
        runStep?.env?.TZ,
        'UTC',
        'the pinned subset must run under TZ=UTC so the committed report and coverage are a pure function of the engine, not the runner time zone',
      );
    },
  },
  {
    name: 'the benchmark smoke job depends on vendor and performs correctness-only validation',
    run: async () => {
      const { workflow } = await readWorkflow();
      const job = requireJob(workflow, 'benchmark-smoke');
      const commands = runCommands(job);

      assertSame(JSON.stringify(job.needs), JSON.stringify(['vendor']));
      assertSame(
        usesSteps(job, 'actions/upload-artifact').length,
        0,
        'benchmark-smoke must not upload artifacts',
      );
      assertSame(
        commands.includes('npm run benchmark:smoke'),
        true,
        `benchmark-smoke must run npm run benchmark:smoke, found: ${commands.join(' | ')}`,
      );

      for (const command of commands) {
        assertSame(
          /\b(threshold|baseline|regression)\b/i.test(command),
          false,
          `benchmark-smoke must stay correctness-only, found: ${command}`,
        );
      }
    },
  },
  {
    name: 'the workflow drift check is itself a CI job, not just a local script',
    run: async () => {
      const { workflow } = await readWorkflow();

      assertSame(
        runCommands(requireJob(workflow, 'ci-drift')).includes(
          'npm run ci:check',
        ),
        true,
      );
    },
  },
  {
    name: 'the committed workflow is exactly what the pipeline renders from the checked-in pin',
    run: async () => {
      const { jobs } = await loadCiPipeline();
      const committed = await readRepositoryFile(WORKFLOW_FILE);

      assertSame(committed, renderWorkflowYaml(jobs));
    },
  },
  {
    name: 'the supported-feature manifest parses and every feature it declares has its probe really executed',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const names = featureNames(manifest);

      assertSame(manifest.version, 1);
      assertSame(new Set(names).size, names.length);
      assertSame(names.join(','), [...names].sort().join(','));

      for (const feature of manifest.features) {
        const probe = runFeatureProbe({ engine, feature });

        assertSame(
          probe.outcome,
          'completed',
          `${feature.name}'s probe must run on this engine: ${probe.message}`,
        );

        const supported = await runTest262Suite({
          engine,
          host: probeHost(featureProbeTestSource(feature)),
          paths: ['probe.js'],
          supportedFeatures: [feature.name],
        });

        assertSame(supported.records[0].status, 'passed');

        const unsupported = await runTest262Suite({
          engine,
          host: probeHost(featureProbeTestSource(feature)),
          paths: ['probe.js'],
          supportedFeatures: [],
        });

        assertSame(unsupported.records[0].status, 'skipped');
        assertSame(unsupported.records[0].reason, 'unsupported-feature');
      }
    },
  },
  {
    name: 'the Symbol.iterator probe rejects a realm missing the Array iterator protocol',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.iterator',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.iterator');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(realm, 'delete Array.prototype[Symbol.iterator];');

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.iterator guards Array iterator feature areas and must probe Array.prototype[@@iterator]',
      );
    },
  },
  {
    name: 'the Symbol.iterator probe rejects a realm missing Array.prototype.keys',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.iterator',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.iterator');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(realm, 'delete Array.prototype.keys;');

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.iterator guards Array.prototype.keys and must probe its iterator wiring',
      );
    },
  },
  {
    name: 'the Symbol.toStringTag probe rejects a realm missing the Array iterator tag',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.toStringTag',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.toStringTag');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(
              realm,
              'delete Object.getPrototypeOf([][Symbol.iterator]())[Symbol.toStringTag];',
            );

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.toStringTag guards %ArrayIteratorPrototype% and must probe its @@toStringTag',
      );
    },
  },
  {
    name: 'the Symbol.toStringTag probe rejects a realm missing the String iterator tag',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );
      const feature = manifest.features.find(
        (candidate) => candidate.name === 'Symbol.toStringTag',
      );

      if (feature === undefined) {
        throw new Error('features.json must claim Symbol.toStringTag');
      }

      const probe = runFeatureProbe({
        engine: {
          createRealm() {
            const realm = createRealm();

            evaluateScript(
              realm,
              "delete Object.getPrototypeOf(''[Symbol.iterator]())[Symbol.toStringTag];",
            );

            return realm;
          },
          evaluateScript,
        },
        feature,
      });

      assertSame(
        probe.outcome === 'completed',
        false,
        'Symbol.toStringTag guards %StringIteratorPrototype% and must probe its @@toStringTag',
      );
    },
  },
  {
    name: 'the feature manifest probes every supported runtime-foundation grammar feature',
    run: async () => {
      const manifest = parseFeatureManifest(
        await readRepositoryFile(FEATURES_MANIFEST_FILE),
      );

      for (const name of ['const', 'for-of', 'let']) {
        const feature = manifest.features.find(
          (candidate) => candidate.name === name,
        );

        assertSame(
          feature !== undefined,
          true,
          `${name} is implemented and must have an executable feature probe`,
        );

        if (feature !== undefined) {
          const probe = runFeatureProbe({ engine, feature });

          assertSame(
            probe.outcome,
            'completed',
            `${name}'s probe must exercise the implemented grammar: ${probe.message}`,
          );
        }
      }
    },
  },
  {
    name: 'the probe machinery is exercised by a synthetic feature, so an empty manifest is never a vacuous check',
    run: async () => {
      const manifest = parseFeatureManifest(SYNTHETIC_MANIFEST_TEXT);
      const [feature] = manifest.features;

      assertSame(runFeatureProbe({ engine, feature }).outcome, 'completed');

      const supported = await runTest262Suite({
        engine,
        host: probeHost(featureProbeTestSource(feature)),
        paths: ['probe.js'],
        supportedFeatures: [feature.name],
      });

      assertSame(supported.records[0].status, 'passed');
      assertSame(supported.records[0].variant, 'raw');

      const unsupported = await runTest262Suite({
        engine,
        host: probeHost(featureProbeTestSource(feature)),
        paths: ['probe.js'],
        supportedFeatures: [],
      });

      assertSame(unsupported.records[0].status, 'skipped');
      assertSame(unsupported.records[0].reason, 'unsupported-feature');
    },
  },
  {
    name: 'a probe that does not really run on this engine is reported, not silently accepted',
    run: () => {
      assertSame(
        runFeatureProbe({
          engine,
          feature: syntheticFeature('throw "probe failed";'),
        }).outcome,
        'threw',
      );
      assertSame(
        runFeatureProbe({
          engine,
          feature: syntheticFeature('var = ;'),
        }).outcome,
        'parse-error',
      );
      assertSame(
        runFeatureProbe({
          // Every ES5 construct now evaluates, so an engine limitation can no
          // longer be provoked from source (`with` used to be the example).
          // Model one directly: an engine whose `evaluateScript` throws a host
          // error that is not a SyntaxError must be reported as `engine-error`,
          // never silently accepted as `completed`.
          engine: {
            createRealm,
            evaluateScript() {
              throw new Error('synthetic engine limitation');
            },
          },
          feature: syntheticFeature('ENGINE_LIMITATION;'),
        }).outcome,
        'engine-error',
      );
      assertSame(
        runFeatureProbe({
          engine,
          feature: syntheticFeature('if (1 !== 1) { throw "unreachable"; }'),
        }).outcome,
        'completed',
      );
    },
  },
  {
    name: 'parseFeatureManifest rejects every malformed manifest shape',
    run: () => {
      const reject = (/** @type {string} */ text) =>
        assertThrows(
          () => parseFeatureManifest(text),
          Test262FeatureManifestError,
        );

      reject('not json');
      reject('[]');
      reject('{}');
      reject(JSON.stringify({ version: 2, features: [] }));
      reject(JSON.stringify({ version: 1 }));
      reject(JSON.stringify({ version: 1, features: [], extra: true }));
      reject(JSON.stringify({ version: 1, features: ['Proxy'] }));
      reject(JSON.stringify({ version: 1, features: [{ name: 'Proxy' }] }));
      reject(
        JSON.stringify({
          version: 1,
          features: [{ name: '', probe: 'var x;', tests: ['test/a.js'] }],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [{ name: 'Proxy', probe: '', tests: ['test/a.js'] }],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [{ name: 'Proxy', probe: 'var x;', tests: [] }],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [
            { name: 'Proxy', probe: 'var x;', tests: ['harness/assert.js'] },
          ],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [
            { name: 'Proxy', probe: 'var x;', tests: ['test/a.js'] },
            { name: 'Proxy', probe: 'var y;', tests: ['test/b.js'] },
          ],
        }),
      );
      reject(
        JSON.stringify({
          version: 1,
          features: [
            { name: 'Reflect', probe: 'var x;', tests: ['test/a.js'] },
            { name: 'Proxy', probe: 'var y;', tests: ['test/b.js'] },
          ],
        }),
      );
    },
  },
  {
    name: 'resolveSupportedFeatures lets an explicit list win and otherwise reads the manifest for real',
    run: () => {
      assertSame(
        resolveSupportedFeatures({
          cliFeatures: ['Zeta', 'Alpha'],
          manifestText: 'not json',
        }).join(','),
        'Alpha,Zeta',
      );
      assertSame(
        resolveSupportedFeatures({
          cliFeatures: undefined,
          manifestText: SYNTHETIC_MANIFEST_TEXT,
        }).join(','),
        'jsjs-arithmetic-probe',
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
    name: 'the pinned upstream subset names the same revision package.json pins',
    run: async () => {
      const packageManifest = await readPackageManifest();
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const paths = upstreamSubsetPaths(subset);

      assertSame(subset.revision, packageManifest.test262.revision);
      assertSame(subset.repository, packageManifest.test262.repository);
      assertSame(paths.length > 0, true, 'the subset selects tests');
      assertSame(new Set(paths).size, paths.length);
      assertSame(paths.join('\n'), [...paths].sort().join('\n'));

      for (const path of paths) {
        assertSame(
          path.startsWith('test/') && path.endsWith('.js'),
          true,
          `${path} must be an upstream-relative test path`,
        );
      }
    },
  },
  {
    name: 'the pinned upstream subset covers the completed ES5 Date families with representative fixtures',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const selected = new Set(upstreamSubsetPaths(subset));

      for (const [name, paths] of Object.entries(DATE_GROUPS)) {
        for (const path of paths) {
          assertSame(
            selected.has(path),
            true,
            `${name} coverage lost representative fixture ${path}`,
          );
        }
      }
    },
  },
  {
    name: 'the upstream subset summary is deterministic and reports the feature baseline',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const paths = upstreamSubsetPaths(subset);
      const records = paths.map((file) => ({
        type: /** @type {const} */ ('test'),
        file,
        variant: /** @type {string | null} */ ('non-strict'),
        status: /** @type {const} */ ('passed'),
      }));
      const summary = summarizeUpstreamRun({
        subset,
        records,
        supportedFeatures: [],
      });
      const lines = formatUpstreamSummaryLines(summary);

      assertSame(
        lines.join('\n'),
        formatUpstreamSummaryLines(
          summarizeUpstreamRun({ subset, records, supportedFeatures: [] }),
        ).join('\n'),
        'the same inputs must summarize byte-identically',
      );
      assertSame(summary.groups.length, subset.groups.length);
      assertSame(
        summary.groups.map((group) => group.group).join(','),
        subset.groups.map((group) => group.name).join(','),
      );
      assertSame(
        summary.groups.reduce((total, group) => total + group.passed, 0),
        paths.length,
      );
      assertSame(summary.features.supported.join(','), '');
      assertSame(summary.features.tagged.join(','), '');
      assertSame(summary.features.untagged, paths.length);
      assertSame(lines[0].startsWith('{"type":"baseline"'), true);
      assertSame(
        lines[lines.length - 1].startsWith('{"type":"features"'),
        true,
      );
    },
  },
  {
    name: 'the upstream subset summary counts feature-tagged and skipped records honestly',
    run: async () => {
      const subset = parseUpstreamSubset(
        await readRepositoryFile(UPSTREAM_SUBSET_FILE),
      );
      const [path] = upstreamSubsetPaths(subset);
      const summary = summarizeUpstreamRun({
        subset,
        records: [
          {
            type: 'test',
            file: path,
            variant: null,
            status: 'skipped',
            reason: 'unsupported-feature',
            features: ['Proxy'],
          },
        ],
        supportedFeatures: ['Reflect'],
      });

      assertSame(summary.features.tagged.join(','), 'Proxy');
      assertSame(summary.features.supported.join(','), 'Reflect');
      assertSame(summary.features.untagged, 0);
      assertSame(
        summary.groups.reduce((total, group) => total + group.skipped, 0),
        1,
      );
    },
  },
  {
    name: 'parseUpstreamSubset rejects every malformed subset shape',
    run: () => {
      const base = {
        version: 1,
        repository: 'https://github.com/tc39/test262.git',
        revision: 'b363f29d3c43c626dc852744ad64a0b48a003693',
        groups: [
          {
            name: 'types',
            summary: 'primitive types',
            paths: ['test/language/types/null/S8.2_A1_T1.js'],
          },
        ],
      };
      const reject = (/** @type {unknown} */ value) =>
        assertThrows(
          () => parseUpstreamSubset(JSON.stringify(value)),
          Test262UpstreamSubsetError,
        );

      assertThrows(
        () => parseUpstreamSubset('not json'),
        Test262UpstreamSubsetError,
      );
      reject([]);
      reject({ ...base, version: 2 });
      reject({ ...base, extra: true });
      reject({ ...base, revision: 'not-a-sha' });
      reject({ ...base, groups: [] });
      reject({ ...base, groups: [{ ...base.groups[0], name: '' }] });
      reject({ ...base, groups: [{ ...base.groups[0], paths: [] }] });
      reject({
        ...base,
        groups: [{ ...base.groups[0], paths: ['harness/assert.js'] }],
      });
      reject({
        ...base,
        groups: [{ ...base.groups[0], paths: ['test/b.js', 'test/a.js'] }],
      });
      reject({
        ...base,
        groups: [base.groups[0], { ...base.groups[0], name: 'statements' }],
      });
      reject({
        ...base,
        groups: [
          { ...base.groups[0], name: 'zzz' },
          { ...base.groups[0], name: 'aaa', paths: ['test/other.js'] },
        ],
      });
    },
  },
];

/**
 * A host that serves one synthetic Test262 file, so a probe can be run through
 * the same runner CI uses without touching disk.
 *
 * @param {string} source
 * @returns {import('../../tools/test262/runner.js').Test262Host}
 */
function probeHost(source) {
  return {
    readTest() {
      return source;
    },
    readInclude(name) {
      throw new Error(`a raw probe must not load ${name}`);
    },
  };
}
