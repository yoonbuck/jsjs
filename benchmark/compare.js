/**
 * Repeated-run benchmark comparison gate.
 *
 * A single pair of capture roots cannot decide whether a revision moved a
 * workload: the dominant term in these measurements is round-level host drift
 * (thermal, DVFS, scheduler, background load), which shifts *every* workload in
 * a capture round together. Independent pooling of a handful of runs aliases
 * that shared factor into the revision contrast, which is how a byte-identical
 * engine can score "+8%" on one cell.
 *
 * This module therefore consumes an ordered list of *pairs*: each pair is one
 * baseline capture root and one candidate capture root taken next to each other
 * in time, with the recorded capture order. Every statistic is paired within a
 * round, so the shared per-round factor cancels instead of being mistaken for
 * an effect.
 *
 * Nothing here contains a fixed percentage threshold. The only magnitude a cell
 * is compared against is the *measured* run-to-run spread of the same revision
 * on the same host, workload, and mode (`noiseEnvelopePercent`), computed from
 * the repeated runs in the same manifest.
 */

import { readFile, readdir } from 'node:fs/promises';
import {
  resolveOutputDirectory,
  resolveRepositoryFile,
  writeOutputFile,
} from './output.js';
import { REPORT_SCHEMA_VERSION, validateHostReport } from './report.js';
import { compareCodeUnitLexically, summarizeReports } from './summarize.js';
import {
  createSeededRandom,
  exactSignTestPValue,
  geometricMean,
  median,
  minimumNonzeroPairsForExactSignificance,
  percentile95,
  quantile,
} from './statistics.js';

/**
 * @typedef {ReturnType<typeof import('./run.js').runHostBenchmark>} HostReport
 * @typedef {'cold' | 'steady'} BenchmarkMode
 * @typedef {'baseline-candidate' | 'candidate-baseline'} CaptureOrder
 * @typedef {'regression' | 'improvement' | 'underpowered' | 'within-noise'} ComparisonVerdict
 * @typedef {{ workload: string, mode?: BenchmarkMode, host?: string }} ComparisonTarget
 * @typedef {{
 *   index: number,
 *   round: number,
 *   order: CaptureOrder,
 *   baseline: string,
 *   candidate: string,
 * }} ComparisonPair
 * @typedef {{
 *   schemaVersion: number,
 *   label: string | undefined,
 *   seed: number,
 *   resamples: number,
 *   targets: readonly ComparisonTarget[],
 *   pairs: readonly ComparisonPair[],
 * }} ComparisonManifest
 * @typedef {{
 *   root: string,
 *   side: 'baseline' | 'candidate',
 *   pairIndex: number,
 *   round: number,
 *   order: CaptureOrder,
 *   reports: readonly HostReport[],
 *   hosts: readonly string[],
 *   runId: string,
 *   generatedAt: string,
 *   gitCommit: string,
 * }} CaptureRoot
 * @typedef {{
 *   pairs: number,
 *   pointEstimatePercent: number,
 *   ci95LowPercent: number,
 *   ci95HighPercent: number,
 *   signTest: {
 *     nonzeroPairs: number,
 *     positivePairs: number,
 *     negativePairs: number,
 *     pValue: number,
 *     significant: boolean,
 *   },
 *   noiseEnvelopePercent: number,
 *   noiseEnvelopeSamples: number,
 * }} PairedStatistic
 * @typedef {{
 *   schemaVersion: number,
 *   kind: string,
 *   generatedAt?: string,
 *   label: string | undefined,
 *   methodology: Readonly<Record<string, any>>,
 *   manifest: Readonly<Record<string, any>>,
 *   audit: Readonly<Record<string, any>>,
 *   warnings: readonly string[],
 *   hosts: readonly string[],
 *   cells: readonly Readonly<Record<string, any>>[],
 *   targets: readonly Readonly<Record<string, any>>[],
 *   nonTargetRegressions: readonly Readonly<Record<string, any>>[],
 *   hostAggregates: readonly Readonly<Record<string, any>>[],
 *   allHostAggregate: Readonly<Record<string, any>>,
 *   acceptance: Readonly<Record<string, any>>,
 * }} ComparisonReport
 */

export const COMPARISON_SCHEMA_VERSION = 1;
export const COMPARISON_MANIFEST_SCHEMA_VERSION = 1;
export const SIGNIFICANCE_LEVEL = 0.05;
export const MINIMUM_PAIRS = 2;
export const MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE =
  minimumNonzeroPairsForExactSignificance(SIGNIFICANCE_LEVEL);
export const DEFAULT_RESAMPLES = 20000;
export const DEFAULT_SEED = 420042;
export const NOISE_ENVELOPE_PERCENTILE = 95;

/** @type {readonly CaptureOrder[]} */
const CAPTURE_ORDERS = Object.freeze([
  'baseline-candidate',
  'candidate-baseline',
]);
/** @type {readonly BenchmarkMode[]} */
const MODES = Object.freeze(['cold', 'steady']);

const METHODOLOGY_DESCRIPTION = Object.freeze([
  'Every capture root is one `benchmark/cli.js run` output directory. A pair is one baseline root and one candidate root captured next to each other, with the capture order recorded.',
  'Cell statistic: the run median of `lanes.jsjs.normalizedSamplesMs` per root, then one paired relative log ratio per round, `log(candidate) - log(baseline)`.',
  'Point estimate: `exp(median(paired log ratios)) - 1`.',
  'Interval: deterministic paired bootstrap of that median, resampling whole pairs with replacement from a seeded PRNG.',
  'Significance: exact two-sided sign test over the nonzero paired deltas. No normal approximation.',
  'Noise envelope: within each revision, every pairwise absolute log difference among its repeated run medians; baseline and candidate self-differences are pooled and the 95th percentile is transformed back to a relative percentage. This is measured noise, not a configured threshold.',
  'Aggregates: per run, the geometric mean of the jsjs run medians across every workload/mode cell of one host (and across all hosts), then the identical paired statistic, noise envelope, and verdict.',
]);

/**
 * @param {unknown} value
 * @returns {ComparisonManifest}
 */
export function validateComparisonManifest(value) {
  const manifest = objectAt(value, 'manifest');

  if (manifest.schemaVersion !== COMPARISON_MANIFEST_SCHEMA_VERSION) {
    throw new TypeError(
      `manifest.schemaVersion must equal ${COMPARISON_MANIFEST_SCHEMA_VERSION}`,
    );
  }

  if (manifest.label !== undefined) {
    nonEmptyStringAt(manifest.label, 'manifest.label');
  }

  const seed = manifest.seed === undefined ? DEFAULT_SEED : manifest.seed;
  const resamples =
    manifest.resamples === undefined ? DEFAULT_RESAMPLES : manifest.resamples;

  if (!Number.isInteger(seed)) {
    throw new TypeError('manifest.seed must be an integer');
  }

  if (!Number.isInteger(resamples) || resamples < 1000) {
    throw new TypeError('manifest.resamples must be an integer >= 1000');
  }

  const targets = arrayAt(manifest.targets, 'manifest.targets');

  if (targets.length === 0) {
    throw new RangeError('manifest.targets must name at least one workload');
  }

  const seenTargets = new Set();
  /** @type {ComparisonTarget[]} */
  const normalizedTargets = targets.map((entry, index) => {
    const path = `manifest.targets[${index}]`;
    const target = objectAt(entry, path);

    nonEmptyStringAt(target.workload, `${path}.workload`);

    if (target.mode !== undefined && !MODES.includes(target.mode)) {
      throw new TypeError(`${path}.mode must be "cold" or "steady"`);
    }

    if (target.host !== undefined) {
      nonEmptyStringAt(target.host, `${path}.host`);
    }

    const key = `${target.host ?? '*'}:${target.workload}:${target.mode ?? '*'}`;

    if (seenTargets.has(key)) {
      throw new RangeError(`${path} is a duplicate target: ${key}`);
    }

    seenTargets.add(key);

    return Object.freeze({
      workload: target.workload,
      mode: target.mode,
      host: target.host,
    });
  });

  const pairs = arrayAt(manifest.pairs, 'manifest.pairs');

  if (pairs.length < MINIMUM_PAIRS) {
    throw new RangeError(
      `manifest.pairs must contain at least ${MINIMUM_PAIRS} pairs; a single pair cannot separate a revision effect from round-level host drift`,
    );
  }

  const seenRoots = new Map();
  /** @type {ComparisonPair[]} */
  const normalizedPairs = pairs.map((entry, index) => {
    const path = `manifest.pairs[${index}]`;
    const pair = objectAt(entry, path);

    if (!CAPTURE_ORDERS.includes(pair.order)) {
      throw new TypeError(
        `${path}.order must be ${CAPTURE_ORDERS.map((order) => `"${order}"`).join(' or ')}`,
      );
    }

    nonEmptyStringAt(pair.baseline, `${path}.baseline`);
    nonEmptyStringAt(pair.candidate, `${path}.candidate`);
    resolveOutputDirectory(pair.baseline);
    resolveOutputDirectory(pair.candidate);

    if (pair.round !== undefined && !isPositiveInteger(pair.round)) {
      throw new TypeError(`${path}.round must be a positive integer`);
    }

    for (const [side, root] of [
      ['baseline', pair.baseline],
      ['candidate', pair.candidate],
    ]) {
      const previous = seenRoots.get(root);

      if (previous !== undefined) {
        throw new RangeError(
          `${path}.${side} is a duplicate capture root already used by ${previous}: ${root}`,
        );
      }

      seenRoots.set(root, `${path}.${side}`);
    }

    return Object.freeze({
      index,
      round: pair.round ?? index + 1,
      order: /** @type {CaptureOrder} */ (pair.order),
      baseline: pair.baseline,
      candidate: pair.candidate,
    });
  });

  return Object.freeze({
    schemaVersion: COMPARISON_MANIFEST_SCHEMA_VERSION,
    label: manifest.label,
    seed,
    resamples,
    targets: Object.freeze(normalizedTargets),
    pairs: Object.freeze(normalizedPairs),
  });
}

/**
 * @param {string} manifestPath
 * @returns {Promise<ComparisonManifest>}
 */
export async function readComparisonManifest(manifestPath) {
  const manifestUrl = resolveRepositoryFile(manifestPath);
  const contents = await readFile(manifestUrl, 'utf8');

  return validateComparisonManifest(JSON.parse(contents));
}

/**
 * @param {ComparisonManifest} manifest
 * @returns {Promise<readonly CaptureRoot[]>}
 */
export async function readCaptureRoots(manifest) {
  /** @type {CaptureRoot[]} */
  const roots = [];

  for (const pair of manifest.pairs) {
    roots.push(await readCaptureRoot(pair, 'baseline'));
    roots.push(await readCaptureRoot(pair, 'candidate'));
  }

  return Object.freeze(roots);
}

/**
 * @param {ComparisonManifest} manifest
 * @param {readonly CaptureRoot[]} roots
 * @param {{ generatedAt?: string }} [options]
 * @returns {ComparisonReport}
 */
export function compareCaptureRoots(manifest, roots, options = {}) {
  const audit = auditCaptureRoots(manifest, roots);
  const baselineByPair = indexBySide(roots, 'baseline');
  const candidateByPair = indexBySide(roots, 'candidate');
  const counterbalanced = audit.counterbalanced;
  const exactSignificancePossibleByDesign =
    manifest.pairs.length >= MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE;
  /** @type {string[]} */
  const warnings = [];

  if (!counterbalanced) {
    warnings.push(
      `Capture orders are not counterbalanced (${describeOrderCounts(audit.orderCounts)}). A gate-ready verdict needs both ${CAPTURE_ORDERS.join(' and ')} orders so the within-pair time slot cannot alias the revision contrast.`,
    );
  }

  if (!exactSignificancePossibleByDesign) {
    warnings.push(
      `Design is underpowered: ${manifest.pairs.length} pairs cannot reach an exact two-sided sign-test p < ${SIGNIFICANCE_LEVEL}, which needs at least ${MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE} nonzero paired deltas. No cell can report a regression or an improvement at this pair count.`,
    );
  }

  if (audit.baselineCommit === audit.candidateCommit) {
    warnings.push(
      `Baseline and candidate captures share commit ${audit.baselineCommit}; this is a control comparison, not a revision contrast.`,
    );
  }

  const design = Object.freeze({
    counterbalanced,
    exactSignificancePossibleByDesign,
  });
  /** @type {Record<string, any>[]} */
  const cells = [];

  for (const host of audit.hosts) {
    for (const cell of audit.cells) {
      const baselineMedians = manifest.pairs.map((pair) =>
        cellMedian(baselineByPair, pair, host, cell.workload, cell.mode),
      );
      const candidateMedians = manifest.pairs.map((pair) =>
        cellMedian(candidateByPair, pair, host, cell.workload, cell.mode),
      );
      const statistic = comparePairedSeries(
        baselineMedians,
        candidateMedians,
        manifest,
      );

      cells.push(
        Object.freeze({
          host,
          workload: cell.workload,
          mode: cell.mode,
          target: isTargetCell(
            manifest.targets,
            host,
            cell.workload,
            cell.mode,
          ),
          ...statistic,
          ...verdictFor(statistic, design),
          runs: Object.freeze(
            manifest.pairs.map((pair, index) =>
              Object.freeze({
                round: pair.round,
                order: pair.order,
                baselineRoot: pair.baseline,
                candidateRoot: pair.candidate,
                baselineMedianMs: baselineMedians[index],
                candidateMedianMs: candidateMedians[index],
                pairedLogRatio:
                  Math.log(candidateMedians[index]) -
                  Math.log(baselineMedians[index]),
              }),
            ),
          ),
        }),
      );
    }
  }

  const hostAggregates = audit.hosts.map((/** @type {string} */ host) =>
    aggregateFor(
      manifest,
      baselineByPair,
      candidateByPair,
      audit.cells,
      [host],
      design,
      host,
    ),
  );
  const allHostAggregate = aggregateFor(
    manifest,
    baselineByPair,
    candidateByPair,
    audit.cells,
    audit.hosts,
    design,
    'all-hosts',
  );
  const acceptance = summarizeAcceptance(
    cells,
    hostAggregates,
    allHostAggregate,
    design,
    manifest,
  );
  const underpoweredCells = cells.filter(
    (cell) => cell.verdict === 'underpowered',
  );

  if (underpoweredCells.length > 0) {
    warnings.push(
      `${underpoweredCells.length} cell(s) excluded zero but could not support a verdict and are reported as underpowered: ${underpoweredCells
        .map((cell) => `${cell.host}/${cell.workload}/${cell.mode}`)
        .join(', ')}. Collect more counterbalanced pairs.`,
    );
  }

  return Object.freeze({
    schemaVersion: COMPARISON_SCHEMA_VERSION,
    kind: 'benchmark-comparison',
    ...(options.generatedAt === undefined
      ? {}
      : { generatedAt: options.generatedAt }),
    label: manifest.label,
    methodology: Object.freeze({
      statistic:
        'paired relative log ratio of jsjs run medians, aggregated by median over rounds',
      description: METHODOLOGY_DESCRIPTION,
      seed: manifest.seed,
      resamples: manifest.resamples,
      significanceLevel: SIGNIFICANCE_LEVEL,
      noiseEnvelopePercentile: NOISE_ENVELOPE_PERCENTILE,
      minimumPairs: MINIMUM_PAIRS,
      minimumNonzeroPairsForExactSignificance:
        MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
    }),
    manifest: Object.freeze({
      schemaVersion: manifest.schemaVersion,
      label: manifest.label,
      seed: manifest.seed,
      resamples: manifest.resamples,
      targets: manifest.targets,
      pairs: Object.freeze(
        manifest.pairs.map((pair) =>
          Object.freeze({
            round: pair.round,
            order: pair.order,
            baseline: pair.baseline,
            candidate: pair.candidate,
          }),
        ),
      ),
    }),
    audit,
    warnings: Object.freeze(warnings),
    hosts: audit.hosts,
    cells: Object.freeze(cells),
    targets: Object.freeze(cells.filter((cell) => cell.target)),
    nonTargetRegressions: Object.freeze(
      cells.filter((cell) => !cell.target && cell.verdict === 'regression'),
    ),
    hostAggregates: Object.freeze(hostAggregates),
    allHostAggregate,
    acceptance,
  });
}

/**
 * @param {string} manifestPath
 * @param {string} outputBase
 * @param {{
 *   seed?: number,
 *   resamples?: number,
 *   generatedAt?: string,
 * }} [options]
 * @returns {Promise<ComparisonReport>}
 */
export async function compareManifestFile(
  manifestPath,
  outputBase,
  options = {},
) {
  const { directory, stem } = splitOutputBase(outputBase);
  const manifest = withOverrides(
    await readComparisonManifest(manifestPath),
    options,
  );
  const roots = await readCaptureRoots(manifest);
  const comparison = compareCaptureRoots(manifest, roots, {
    generatedAt: options.generatedAt,
  });

  await writeOutputFile(
    directory,
    `${stem}.json`,
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  await writeOutputFile(
    directory,
    `${stem}.md`,
    comparisonToMarkdown(comparison),
  );

  return comparison;
}

/**
 * @param {ComparisonReport} comparison
 * @returns {string}
 */
export function comparisonToMarkdown(comparison) {
  const lines = [];
  const acceptance = comparison.acceptance;

  lines.push(
    `# Benchmark comparison${comparison.label === undefined ? '' : `: ${comparison.label}`}`,
    '',
  );

  if (comparison.generatedAt !== undefined) {
    lines.push(`Generated at ${comparison.generatedAt}.`, '');
  }

  lines.push(
    `Verdict: **${acceptance.accepted ? 'accepted' : 'not accepted'}** (gate-ready: ${acceptance.gateReady}, non-target regressions: ${acceptance.nonTargetRegressionCount}).`,
    '',
    '## Methodology',
    '',
  );

  for (const entry of comparison.methodology.description) {
    lines.push(`- ${entry}`);
  }

  lines.push(
    `- Seed \`${comparison.methodology.seed}\`, ${comparison.methodology.resamples} bootstrap resamples, alpha ${comparison.methodology.significanceLevel}.`,
    '',
    '## Audit',
    '',
    `- Pairs: ${comparison.audit.pairCount} (${describeOrderCounts(comparison.audit.orderCounts)}); counterbalanced: ${comparison.audit.counterbalanced}.`,
    `- Capture roots: ${comparison.audit.rootCount}, unique run IDs: ${comparison.audit.uniqueRunIds}, clean source: ${comparison.audit.cleanSource}.`,
    `- Baseline commit \`${comparison.audit.baselineCommit}\`, candidate commit \`${comparison.audit.candidateCommit}\`.`,
    `- Hosts: ${comparison.audit.hosts.join(', ')}; host versions: ${comparison.audit.hostVersions.map((/** @type {any} */ entry) => `${entry.host} ${entry.version}`).join(', ')}.`,
    `- Report schema ${comparison.methodology.reportSchemaVersion}, profile \`${comparison.audit.config.profile}\`, warmups ${comparison.audit.config.warmups}, samples ${comparison.audit.config.samples}, checksums verified: ${comparison.audit.checksumsVerified}.`,
    '',
    '## Warnings',
    '',
  );

  if (comparison.warnings.length === 0) {
    lines.push('None.', '');
  } else {
    for (const warning of comparison.warnings) {
      lines.push(`- ${warning}`);
    }

    lines.push('');
  }

  lines.push(
    '## Cells',
    '',
    '| Host | Workload | Mode | Target | Point % | 95% CI % | Sign p | Noise envelope % | Verdict |',
    '| ---- | -------- | ---- | ------ | ------- | -------- | ------ | ---------------- | ------- |',
  );

  for (const cell of comparison.cells) {
    lines.push(
      `| ${cell.host} | ${cell.workload} | ${cell.mode} | ${cell.target ? 'yes' : 'no'} | ${formatPercent(cell.pointEstimatePercent)} | ${formatPercent(cell.ci95LowPercent)} … ${formatPercent(cell.ci95HighPercent)} | ${formatNumber(cell.signTest.pValue, 5)} | ±${formatNumber(cell.noiseEnvelopePercent, 2)} | ${cell.verdict} |`,
    );
  }

  lines.push('', '## Non-target regressions', '');

  if (comparison.nonTargetRegressions.length === 0) {
    lines.push('None.', '');
  } else {
    for (const cell of comparison.nonTargetRegressions) {
      lines.push(
        `- \`${cell.host}/${cell.workload}/${cell.mode}\`: ${formatPercent(cell.pointEstimatePercent)} (CI ${formatPercent(cell.ci95LowPercent)} … ${formatPercent(cell.ci95HighPercent)}, sign p ${formatNumber(cell.signTest.pValue, 5)}, measured noise ±${formatNumber(cell.noiseEnvelopePercent, 2)}%).`,
      );
    }

    lines.push('');
  }

  lines.push('## Targets', '');

  for (const cell of comparison.targets) {
    lines.push(
      `- \`${cell.host}/${cell.workload}/${cell.mode}\`: ${formatPercent(cell.pointEstimatePercent)} — ${cell.verdict}${cell.criteria.exceedsNoiseEnvelope ? '' : ' (inside the measured noise envelope)'}.`,
    );
  }

  lines.push(
    '',
    '## Aggregates',
    '',
    '| Scope | Point % | 95% CI % | Sign p | Noise envelope % | Verdict |',
    '| ----- | ------- | -------- | ------ | ---------------- | ------- |',
  );

  for (const aggregate of [
    ...comparison.hostAggregates,
    comparison.allHostAggregate,
  ]) {
    lines.push(
      `| ${aggregate.scope} | ${formatPercent(aggregate.pointEstimatePercent)} | ${formatPercent(aggregate.ci95LowPercent)} … ${formatPercent(aggregate.ci95HighPercent)} | ${formatNumber(aggregate.signTest.pValue, 5)} | ±${formatNumber(aggregate.noiseEnvelopePercent, 2)} | ${aggregate.verdict} |`,
    );
  }

  lines.push('', '## Per-run medians', '');

  for (const cell of comparison.cells) {
    lines.push(
      `- \`${cell.host}/${cell.workload}/${cell.mode}\` baseline: ${cell.runs.map((/** @type {any} */ run) => formatNumber(run.baselineMedianMs, 4)).join(', ')}`,
      `- \`${cell.host}/${cell.workload}/${cell.mode}\` candidate: ${cell.runs.map((/** @type {any} */ run) => formatNumber(run.candidateMedianMs, 4)).join(', ')}`,
    );
  }

  lines.push(
    '',
    '## Acceptance',
    '',
    `- Gate ready: ${acceptance.gateReady}`,
    `- Non-target regression count: ${acceptance.nonTargetRegressionCount}`,
    `- All host geomean point estimates improve: ${acceptance.allHostGeomeanPointEstimatesImprove}`,
    `- All host geomean verdicts improve or stay within noise: ${acceptance.allHostGeomeanVerdictsImproveOrWithinNoise}`,
    `- All-host aggregate improves: ${acceptance.allHostAggregateImproves}`,
    `- Target verdicts improve: ${acceptance.targetVerdictsImprove}`,
    `- Targets materially exceed measured noise: ${acceptance.targetsMateriallyExceedNoise}`,
    `- Accepted: ${acceptance.accepted}`,
    '',
    '## Exceptional-regression review',
    '',
    acceptance.exceptionalReview.required
      ? 'A statistically significant non-target regression is present. This comparison does **not** approve it. Every condition below must hold, and the ones marked `unknown` need evidence this tool cannot produce.'
      : 'Not required: no statistically significant non-target regression was reported.',
    '',
  );

  for (const condition of acceptance.exceptionalReview.conditions) {
    lines.push(
      `- \`${condition.id}\`: ${condition.satisfied === null ? 'unknown' : condition.satisfied} — ${condition.description}${condition.evidence === undefined ? '' : ` ${condition.evidence}`}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * @param {ComparisonPair} pair
 * @param {'baseline' | 'candidate'} side
 * @returns {Promise<CaptureRoot>}
 */
async function readCaptureRoot(pair, side) {
  const root = side === 'baseline' ? pair.baseline : pair.candidate;
  const rootUrl = resolveOutputDirectory(root);
  /** @type {string[]} */
  let fileNames;

  try {
    fileNames = (await readdir(rootUrl))
      .filter(
        (fileName) => fileName.endsWith('.json') && fileName !== 'summary.json',
      )
      .sort(compareCodeUnitLexically);
  } catch (error) {
    throw new Error(
      `Cannot read ${side} capture root ${root}: ${messageOf(error)}`,
    );
  }

  if (fileNames.length === 0) {
    throw new Error(
      `No benchmark host reports found in ${side} capture root ${root} (expected *.json excluding summary.json)`,
    );
  }

  /** @type {HostReport[]} */
  const reports = [];

  for (const fileName of fileNames) {
    const fileUrl = new URL(fileName, rootUrl);
    let parsed;

    try {
      parsed = JSON.parse(await readFile(fileUrl, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot parse ${root}/${fileName}: ${messageOf(error)}`);
    }

    try {
      reports.push(/** @type {HostReport} */ (validateHostReport(parsed)));
    } catch (error) {
      throw new Error(
        `Invalid host report ${root}/${fileName}: ${messageOf(error)}`,
      );
    }
  }

  try {
    summarizeReports(reports);
  } catch (error) {
    throw new Error(
      `Capture root ${root} is internally inconsistent: ${messageOf(error)}`,
    );
  }

  const [reference] = reports;

  for (const report of reports) {
    if (report.source.gitCommit !== reference.source.gitCommit) {
      throw new Error(
        `Capture root ${root} mixes revisions: source.gitCommit differs (${report.source.gitCommit} !== ${reference.source.gitCommit})`,
      );
    }
  }

  return Object.freeze({
    root,
    side,
    pairIndex: pair.index,
    round: pair.round,
    order: pair.order,
    reports: Object.freeze(reports),
    hosts: Object.freeze(reports.map((report) => report.host)),
    runId: reference.runId,
    generatedAt: reference.generatedAt,
    gitCommit: reference.source.gitCommit,
  });
}

/**
 * @param {ComparisonManifest} manifest
 * @param {readonly CaptureRoot[]} roots
 * @returns {Record<string, any>}
 */
function auditCaptureRoots(manifest, roots) {
  if (roots.length !== manifest.pairs.length * 2) {
    throw new Error(
      `Incomplete pairing: ${manifest.pairs.length} pairs need ${manifest.pairs.length * 2} capture roots, got ${roots.length}`,
    );
  }

  const [reference] = roots;
  const referenceHosts = [...reference.hosts].sort(compareCodeUnitLexically);
  const runIds = new Map();
  /** @type {string[]} */
  const baselineCommits = [];
  /** @type {string[]} */
  const candidateCommits = [];
  let checksumsVerified = 0;

  for (const root of roots) {
    const hosts = [...root.hosts].sort(compareCodeUnitLexically);

    if (hosts.join(',') !== referenceHosts.join(',')) {
      throw new Error(
        `Capture roots disagree on hosts: ${root.root} has ${hosts.join(', ')} but ${reference.root} has ${referenceHosts.join(', ')}`,
      );
    }

    const previousRoot = runIds.get(root.runId);

    if (previousRoot !== undefined) {
      throw new Error(
        `Capture roots ${previousRoot} and ${root.root} share runId ${root.runId}; every repeated run must be an independent capture`,
      );
    }

    runIds.set(root.runId, root.root);

    for (const report of root.reports) {
      const referenceReport = reportFor(reference, report.host);

      assertConsistentReports(
        reference.root,
        referenceReport,
        root.root,
        report,
      );
      checksumsVerified += report.results.length;
    }

    if (root.side === 'baseline') {
      baselineCommits.push(root.gitCommit);
    } else {
      candidateCommits.push(root.gitCommit);
    }
  }

  const baselineCommit = uniqueCommit(baselineCommits, 'baseline');
  const candidateCommit = uniqueCommit(candidateCommits, 'candidate');
  /** @type {Record<CaptureOrder, number>} */
  const orderCounts = {
    'baseline-candidate': 0,
    'candidate-baseline': 0,
  };

  for (const pair of manifest.pairs) {
    orderCounts[pair.order] += 1;
  }

  const cells = Object.freeze(
    reference.reports[0].results.map((result) =>
      Object.freeze({ workload: result.workload, mode: result.mode }),
    ),
  );

  assertTargetsExist(manifest.targets, referenceHosts, cells);

  return Object.freeze({
    pairCount: manifest.pairs.length,
    rootCount: roots.length,
    hosts: Object.freeze(referenceHosts),
    hostVersions: Object.freeze(
      referenceHosts.map((host) =>
        Object.freeze({
          host,
          version: reportFor(reference, host).version,
        }),
      ),
    ),
    baselineCommit,
    candidateCommit,
    cleanSource: true,
    uniqueRunIds: runIds.size,
    checksumsVerified,
    orderCounts: Object.freeze(orderCounts),
    counterbalanced: CAPTURE_ORDERS.every((order) => orderCounts[order] > 0),
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    config: Object.freeze({
      profile: reference.reports[0].config.profile,
      warmups: reference.reports[0].config.warmups,
      samples: reference.reports[0].config.samples,
      targetSampleMs: reference.reports[0].config.targetSampleMs,
      maxBatchSize: reference.reports[0].config.maxBatchSize,
      workloads: Object.freeze(
        reference.reports[0].config.workloads.map((workload) => workload.name),
      ),
    }),
    cells,
  });
}

/**
 * @param {string} referenceRoot
 * @param {HostReport} reference
 * @param {string} root
 * @param {HostReport} report
 * @returns {void}
 */
function assertConsistentReports(referenceRoot, reference, root, report) {
  /** @type {[string, unknown, unknown][]} */
  const checks = [
    ['schemaVersion', report.schemaVersion, reference.schemaVersion],
    ['version', report.version, reference.version],
    ['config.profile', report.config.profile, reference.config.profile],
    ['config.warmups', report.config.warmups, reference.config.warmups],
    ['config.samples', report.config.samples, reference.config.samples],
    [
      'config.targetSampleMs',
      report.config.targetSampleMs,
      reference.config.targetSampleMs,
    ],
    [
      'config.maxBatchSize',
      report.config.maxBatchSize,
      reference.config.maxBatchSize,
    ],
    [
      'config.workloads.length',
      report.config.workloads.length,
      reference.config.workloads.length,
    ],
    ['results.length', report.results.length, reference.results.length],
  ];

  for (const [path, actual, expected] of checks) {
    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      path,
      actual,
      expected,
    );
  }

  reference.config.workloads.forEach((workload, index) => {
    const candidate = report.config.workloads[index];

    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `config.workloads[${index}].name`,
      candidate.name,
      workload.name,
    );
    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `config.workloads[${index}].source`,
      candidate.source,
      workload.source,
    );
    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `config.workloads[${index}].expectedChecksum`,
      candidate.expectedChecksum,
      workload.expectedChecksum,
    );
  });

  reference.results.forEach((result, index) => {
    const candidate = report.results[index];

    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `results[${index}].workload`,
      candidate.workload,
      result.workload,
    );
    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `results[${index}].mode`,
      candidate.mode,
      result.mode,
    );
    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `results[${index}].boundary`,
      candidate.boundary,
      result.boundary,
    );
    assertSameAcrossRoots(
      referenceRoot,
      root,
      report.host,
      `results[${index}].checksum`,
      candidate.checksum,
      result.checksum,
    );
  });
}

/**
 * @param {string} referenceRoot
 * @param {string} root
 * @param {string} host
 * @param {string} path
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {void}
 */
function assertSameAcrossRoots(
  referenceRoot,
  root,
  host,
  path,
  actual,
  expected,
) {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Capture roots ${referenceRoot} and ${root} are not comparable for host ${host}: ${path} differs (${String(actual)} !== ${String(expected)})`,
    );
  }
}

/**
 * @param {readonly string[]} commits
 * @param {'baseline' | 'candidate'} side
 * @returns {string}
 */
function uniqueCommit(commits, side) {
  const unique = [...new Set(commits)];

  if (unique.length !== 1) {
    throw new Error(
      `Every ${side} capture must come from one revision, got source.gitCommit values ${unique.join(', ')}`,
    );
  }

  return unique[0];
}

/**
 * @param {readonly ComparisonTarget[]} targets
 * @param {readonly string[]} hosts
 * @param {readonly { workload: string, mode: BenchmarkMode }[]} cells
 * @returns {void}
 */
function assertTargetsExist(targets, hosts, cells) {
  for (const target of targets) {
    const matched = cells.some(
      (cell) =>
        cell.workload === target.workload &&
        (target.mode === undefined || cell.mode === target.mode),
    );

    if (!matched) {
      throw new Error(
        `Target ${target.workload}${target.mode === undefined ? '' : `/${target.mode}`} is not present in the captured workloads: ${cells.map((cell) => cell.workload).join(', ')}`,
      );
    }

    if (target.host !== undefined && !hosts.includes(target.host)) {
      throw new Error(
        `Target host ${target.host} is not present in the captured hosts: ${hosts.join(', ')}`,
      );
    }
  }
}

/**
 * @param {readonly CaptureRoot[]} roots
 * @param {'baseline' | 'candidate'} side
 * @returns {Map<number, CaptureRoot>}
 */
function indexBySide(roots, side) {
  /** @type {Map<number, CaptureRoot>} */
  const index = new Map();

  for (const root of roots) {
    if (root.side === side) {
      index.set(root.pairIndex, root);
    }
  }

  return index;
}

/**
 * @param {Map<number, CaptureRoot>} index
 * @param {ComparisonPair} pair
 * @param {string} host
 * @param {string} workload
 * @param {BenchmarkMode} mode
 * @returns {number}
 */
function cellMedian(index, pair, host, workload, mode) {
  const root = index.get(pair.index);

  if (root === undefined) {
    throw new Error(`Missing capture root for pair ${pair.round}`);
  }

  const result = reportFor(root, host).results.find(
    (entry) => entry.workload === workload && entry.mode === mode,
  );

  if (result === undefined) {
    throw new Error(
      `Capture root ${root.root} is missing ${host}/${workload}/${mode}`,
    );
  }

  return median(result.lanes.jsjs.normalizedSamplesMs);
}

/**
 * @param {CaptureRoot} root
 * @param {string} host
 * @returns {HostReport}
 */
function reportFor(root, host) {
  const report = root.reports.find((entry) => entry.host === host);

  if (report === undefined) {
    throw new Error(`Capture root ${root.root} is missing host ${host}`);
  }

  return report;
}

/**
 * @param {ComparisonManifest} manifest
 * @param {Map<number, CaptureRoot>} baselineByPair
 * @param {Map<number, CaptureRoot>} candidateByPair
 * @param {readonly { workload: string, mode: BenchmarkMode }[]} cells
 * @param {readonly string[]} hosts
 * @param {{ counterbalanced: boolean, exactSignificancePossibleByDesign: boolean }} design
 * @param {string} scope
 * @returns {Record<string, any>}
 */
function aggregateFor(
  manifest,
  baselineByPair,
  candidateByPair,
  cells,
  hosts,
  design,
  scope,
) {
  const baselineGeomeans = manifest.pairs.map((pair) =>
    geometricMean(
      hosts.flatMap((host) =>
        cells.map((cell) =>
          cellMedian(baselineByPair, pair, host, cell.workload, cell.mode),
        ),
      ),
    ),
  );
  const candidateGeomeans = manifest.pairs.map((pair) =>
    geometricMean(
      hosts.flatMap((host) =>
        cells.map((cell) =>
          cellMedian(candidateByPair, pair, host, cell.workload, cell.mode),
        ),
      ),
    ),
  );
  const statistic = comparePairedSeries(
    baselineGeomeans,
    candidateGeomeans,
    manifest,
  );

  return Object.freeze({
    scope,
    host: hosts.length === 1 ? hosts[0] : undefined,
    hosts: Object.freeze([...hosts]),
    cellCount: hosts.length * cells.length,
    ...statistic,
    ...verdictFor(statistic, design),
    runs: Object.freeze(
      manifest.pairs.map((pair, index) =>
        Object.freeze({
          round: pair.round,
          order: pair.order,
          baselineGeomeanMs: baselineGeomeans[index],
          candidateGeomeanMs: candidateGeomeans[index],
        }),
      ),
    ),
  });
}

/**
 * @param {readonly number[]} baselineValues
 * @param {readonly number[]} candidateValues
 * @param {ComparisonManifest} manifest
 * @returns {PairedStatistic}
 */
function comparePairedSeries(baselineValues, candidateValues, manifest) {
  if (baselineValues.length !== candidateValues.length) {
    throw new Error('Paired series must have the same length');
  }

  const logRatios = baselineValues.map(
    (value, index) => Math.log(candidateValues[index]) - Math.log(value),
  );
  const pointLogRatio = median(logRatios);
  const random = createSeededRandom(manifest.seed);
  const resampledMedians = new Array(manifest.resamples);

  for (let draw = 0; draw < manifest.resamples; draw += 1) {
    const resampled = new Array(logRatios.length);

    for (let index = 0; index < logRatios.length; index += 1) {
      resampled[index] =
        logRatios[Math.floor(random() * logRatios.length) % logRatios.length];
    }

    resampledMedians[draw] = median(resampled);
  }

  const positivePairs = logRatios.filter((ratio) => ratio > 0).length;
  const negativePairs = logRatios.filter((ratio) => ratio < 0).length;
  const pValue = exactSignTestPValue(positivePairs, negativePairs);
  const nonzeroPairs = positivePairs + negativePairs;
  const selfDifferences = [
    ...pairwiseAbsoluteLogDifferences(baselineValues),
    ...pairwiseAbsoluteLogDifferences(candidateValues),
  ];

  return Object.freeze({
    pairs: logRatios.length,
    pointEstimatePercent: toPercent(pointLogRatio),
    ci95LowPercent: toPercent(quantile(resampledMedians, 0.025)),
    ci95HighPercent: toPercent(quantile(resampledMedians, 0.975)),
    signTest: Object.freeze({
      nonzeroPairs,
      positivePairs,
      negativePairs,
      pValue,
      significant:
        pValue < SIGNIFICANCE_LEVEL &&
        nonzeroPairs >= MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE,
    }),
    noiseEnvelopePercent: toPercent(percentile95(selfDifferences)),
    noiseEnvelopeSamples: selfDifferences.length,
  });
}

/**
 * @param {readonly number[]} values
 * @returns {number[]}
 */
function pairwiseAbsoluteLogDifferences(values) {
  if (values.length < 2) {
    throw new RangeError(
      'An empirical noise envelope needs at least two repeated runs per revision',
    );
  }

  /** @type {number[]} */
  const differences = [];

  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      differences.push(
        Math.abs(Math.log(values[right]) - Math.log(values[left])),
      );
    }
  }

  return differences;
}

/**
 * @param {PairedStatistic} statistic
 * @param {{ counterbalanced: boolean, exactSignificancePossibleByDesign: boolean }} design
 * @returns {{
 *   criteria: Record<string, boolean>,
 *   unmetCriteria: readonly string[],
 *   verdict: ComparisonVerdict,
 * }}
 */
function verdictFor(statistic, design) {
  const point = statistic.pointEstimatePercent;
  const intervalDirection =
    point > 0 && statistic.ci95LowPercent > 0
      ? 'regression'
      : point < 0 && statistic.ci95HighPercent < 0
        ? 'improvement'
        : null;
  const criteria = Object.freeze({
    pointEstimateNonZero: point !== 0,
    confidenceIntervalExcludesZero: intervalDirection !== null,
    signTestSignificant: statistic.signTest.significant,
    exceedsNoiseEnvelope: Math.abs(point) > statistic.noiseEnvelopePercent,
    counterbalanced: design.counterbalanced,
    exactSignificancePossible:
      design.exactSignificancePossibleByDesign &&
      statistic.signTest.nonzeroPairs >=
        MINIMUM_NONZERO_PAIRS_FOR_EXACT_SIGNIFICANCE,
  });
  /** @type {string[]} */
  const unmetCriteria = [];

  if (!criteria.pointEstimateNonZero) {
    unmetCriteria.push('point-estimate-zero');
  }

  if (!criteria.confidenceIntervalExcludesZero) {
    unmetCriteria.push('confidence-interval-includes-zero');
  }

  if (!criteria.signTestSignificant) {
    unmetCriteria.push('sign-test-not-significant');
  }

  if (!criteria.exceedsNoiseEnvelope) {
    unmetCriteria.push('within-empirical-noise-envelope');
  }

  if (!criteria.counterbalanced) {
    unmetCriteria.push('capture-orders-not-counterbalanced');
  }

  if (!criteria.exactSignificancePossible) {
    unmetCriteria.push('exact-significance-impossible');
  }

  const designSupportsVerdict =
    criteria.signTestSignificant &&
    criteria.counterbalanced &&
    criteria.exactSignificancePossible;
  /** @type {ComparisonVerdict} */
  let verdict = 'within-noise';

  if (intervalDirection !== null && designSupportsVerdict) {
    verdict = criteria.exceedsNoiseEnvelope
      ? intervalDirection
      : 'within-noise';
  } else if (intervalDirection !== null) {
    verdict = 'underpowered';
  }

  return {
    criteria,
    unmetCriteria: Object.freeze(unmetCriteria),
    verdict,
  };
}

/**
 * @param {readonly Record<string, any>[]} cells
 * @param {readonly Record<string, any>[]} hostAggregates
 * @param {Record<string, any>} allHostAggregate
 * @param {{ counterbalanced: boolean, exactSignificancePossibleByDesign: boolean }} design
 * @param {ComparisonManifest} manifest
 * @returns {Record<string, any>}
 */
function summarizeAcceptance(
  cells,
  hostAggregates,
  allHostAggregate,
  design,
  manifest,
) {
  const targets = cells.filter((cell) => cell.target);
  const nonTargetRegressions = cells.filter(
    (cell) => !cell.target && cell.verdict === 'regression',
  );
  const targetExceptions = targets.filter(
    (cell) => !cell.criteria.exceedsNoiseEnvelope,
  );
  const gateReady =
    design.counterbalanced &&
    design.exactSignificancePossibleByDesign &&
    manifest.pairs.length >= MINIMUM_PAIRS;
  const allHostGeomeanPointEstimatesImprove = hostAggregates.every(
    (aggregate) => aggregate.pointEstimatePercent < 0,
  );
  const allHostGeomeanVerdictsImproveOrWithinNoise = hostAggregates.every(
    (aggregate) =>
      aggregate.verdict === 'improvement' ||
      aggregate.verdict === 'within-noise',
  );
  const targetVerdictsImprove =
    targets.length > 0 &&
    targets.every((cell) => cell.verdict === 'improvement');
  const targetsMateriallyExceedNoise =
    targets.length > 0 && targetExceptions.length === 0;
  const worstNonTargetRegressionPercent = nonTargetRegressions.reduce(
    (worst, cell) => Math.max(worst, cell.pointEstimatePercent),
    0,
  );
  const smallestTargetGainPercent = targets.reduce(
    (smallest, cell) => Math.min(smallest, Math.abs(cell.pointEstimatePercent)),
    Number.POSITIVE_INFINITY,
  );
  const targetGainEvidence =
    targets.length === 0
      ? 'no target cells were declared.'
      : !targetVerdictsImprove
        ? `not every target cell reports an improvement verdict (${targets.filter((cell) => cell.verdict !== 'improvement').length} of ${targets.length} do not).`
        : `smallest target gain ${formatNumber(smallestTargetGainPercent, 4)}% vs worst non-target regression ${formatNumber(worstNonTargetRegressionPercent, 4)}%.`;
  const accepted =
    gateReady &&
    nonTargetRegressions.length === 0 &&
    allHostGeomeanPointEstimatesImprove &&
    allHostGeomeanVerdictsImproveOrWithinNoise;

  return Object.freeze({
    gateReady,
    accepted,
    nonTargetRegressionCount: nonTargetRegressions.length,
    nonTargetRegressions: Object.freeze(
      nonTargetRegressions.map((cell) =>
        Object.freeze({
          host: cell.host,
          workload: cell.workload,
          mode: cell.mode,
          pointEstimatePercent: cell.pointEstimatePercent,
        }),
      ),
    ),
    allHostGeomeanPointEstimatesImprove,
    allHostGeomeanVerdictsImproveOrWithinNoise,
    allHostAggregateImproves: allHostAggregate.pointEstimatePercent < 0,
    targetVerdictsImprove,
    targetsMateriallyExceedNoise,
    targetExceptions: Object.freeze(
      targetExceptions.map((cell) =>
        Object.freeze({
          host: cell.host,
          workload: cell.workload,
          mode: cell.mode,
          pointEstimatePercent: cell.pointEstimatePercent,
          noiseEnvelopePercent: cell.noiseEnvelopePercent,
        }),
      ),
    ),
    exceptionalReview: Object.freeze({
      required: nonTargetRegressions.length > 0,
      conditions: Object.freeze([
        Object.freeze({
          id: 'target-gains-materially-larger',
          description:
            'Every target gain is materially larger than the worst non-target regression.',
          satisfied:
            targets.length > 0 &&
            targetVerdictsImprove &&
            smallestTargetGainPercent > worstNonTargetRegressionPercent,
          evidence: targetGainEvidence,
        }),
        Object.freeze({
          id: 'all-host-aggregate-geomeans-improve',
          description: 'Every host geomean and the all-host geomean improve.',
          satisfied:
            allHostGeomeanPointEstimatesImprove &&
            allHostAggregate.pointEstimatePercent < 0,
          evidence: `all-host geomean ${formatNumber(allHostAggregate.pointEstimatePercent, 4)}%.`,
        }),
        Object.freeze({
          id: 'tradeoff-root-cause-documented',
          description:
            'The tradeoff and the root cause of the non-target regression are documented.',
          satisfied: null,
          evidence: 'Requires evidence this tool cannot produce.',
        }),
        Object.freeze({
          id: 'conformance-green',
          description: 'The conformance suites are green.',
          satisfied: null,
          evidence: 'Requires a conformance run this tool does not perform.',
        }),
        Object.freeze({
          id: 'final-review-approves',
          description: 'Final review explicitly approves the regression.',
          satisfied: null,
          evidence: 'Requires a human decision.',
        }),
      ]),
    }),
  });
}

/**
 * @param {readonly ComparisonTarget[]} targets
 * @param {string} host
 * @param {string} workload
 * @param {BenchmarkMode} mode
 * @returns {boolean}
 */
function isTargetCell(targets, host, workload, mode) {
  return targets.some(
    (target) =>
      target.workload === workload &&
      (target.mode === undefined || target.mode === mode) &&
      (target.host === undefined || target.host === host),
  );
}

/**
 * @param {ComparisonManifest} manifest
 * @param {{ seed?: number, resamples?: number }} options
 * @returns {ComparisonManifest}
 */
function withOverrides(manifest, options) {
  if (options.seed === undefined && options.resamples === undefined) {
    return manifest;
  }

  return validateComparisonManifest({
    schemaVersion: manifest.schemaVersion,
    label: manifest.label,
    seed: options.seed ?? manifest.seed,
    resamples: options.resamples ?? manifest.resamples,
    targets: manifest.targets.map((target) => ({ ...target })),
    pairs: manifest.pairs.map((pair) => ({
      round: pair.round,
      order: pair.order,
      baseline: pair.baseline,
      candidate: pair.candidate,
    })),
  });
}

/**
 * @param {string} outputBase
 * @returns {{ directory: string, stem: string }}
 */
export function splitOutputBase(outputBase) {
  if (typeof outputBase !== 'string' || outputBase.length === 0) {
    throw new TypeError(
      'Benchmark comparison output base must be a non-empty string',
    );
  }

  const separatorIndex = outputBase.lastIndexOf('/');

  if (separatorIndex <= 0) {
    throw new RangeError(
      `Benchmark comparison output base must name a repository-relative directory and a file stem, for example .benchmark-results/compare/issue-42: ${outputBase}`,
    );
  }

  const directory = outputBase.slice(0, separatorIndex);
  const stem = outputBase.slice(separatorIndex + 1);

  if (!/^[a-z0-9-]+$/u.test(stem)) {
    throw new RangeError(
      `Benchmark comparison output stem is not a safe file name: ${stem}`,
    );
  }

  resolveOutputDirectory(directory);

  return { directory, stem };
}

/**
 * @param {Record<CaptureOrder, number>} orderCounts
 * @returns {string}
 */
function describeOrderCounts(orderCounts) {
  return CAPTURE_ORDERS.map((order) => `${order}: ${orderCounts[order]}`).join(
    ', ',
  );
}

/**
 * @param {number} logRatio
 * @returns {number}
 */
function toPercent(logRatio) {
  return (Math.exp(logRatio) - 1) * 100;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
  return `${value > 0 ? '+' : ''}${formatNumber(value, 2)}`;
}

/**
 * @param {number} value
 * @param {number} digits
 * @returns {string}
 */
function formatNumber(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, any>}
 */
function objectAt(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }

  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {any[]}
 */
function arrayAt(value, path) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }

  return /** @type {any[]} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {void}
 */
function nonEmptyStringAt(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
