/**
 * @typedef {{
 *   url: string,
 *   functionName: string,
 *   scriptId?: string,
 *   lineNumber?: number,
 *   columnNumber?: number,
 * }} ProfileCallFrame
 */

/**
 * @typedef {{
 *   id: number,
 *   callFrame: ProfileCallFrame,
 *   children?: readonly number[],
 * }} CpuProfileNode
 */

/**
 * @typedef {{
 *   nodes: readonly CpuProfileNode[],
 *   samples: readonly number[],
 *   timeDeltas: readonly number[],
 * }} CpuProfile
 */

/**
 * @typedef {{
 *   id: number,
 *   callFrame: ProfileCallFrame,
 *   selfSize: number,
 *   children: readonly AllocationNode[],
 * }} AllocationNode
 */

/**
 * @typedef {{
 *   head: AllocationNode,
 * }} AllocationProfile
 */

/**
 * @typedef {{
 *   url: string,
 *   functionName: string,
 *   selfTime: number,
 *   percentage: number,
 *   category: string,
 * }} CpuFrameSummary
 */

/**
 * @typedef {{
 *   url: string,
 *   functionName: string,
 *   selfSize: number,
 *   percentage: number,
 *   category: string,
 * }} AllocationFrameSummary
 */

/**
 * @typedef {{
 *   category: string,
 *   selfTime: number,
 *   percentage: number,
 * }} CpuCategorySummary
 */

/**
 * @typedef {{
 *   category: string,
 *   selfSize: number,
 *   percentage: number,
 * }} AllocationCategorySummary
 */

const STABLE_CATEGORIES = Object.freeze([
  'object-property',
  'arrays',
  'arithmetic',
  'calls',
  'references-environments',
  'completions',
  'realm-setup',
  'parser',
  'evaluator',
  'other-runtime',
  'host',
]);

/**
 * Classify a profile call frame into a stable category based on its source URL.
 *
 * @param {{ url: string, functionName: string }} frame
 * @returns {string}
 */
export function classifyProfileFrame(frame) {
  const url = normalizeUrl(frame.url ?? '');

  if (!url.startsWith('src/')) {
    return 'host';
  }

  if (url === 'src/runtime/object.js' || url.endsWith('/runtime/object.js')) {
    return 'object-property';
  }

  if (url.includes('runtime/array')) {
    return 'arrays';
  }

  if (url.includes('runtime/environment') || url.includes('runtime/reference')) {
    return 'references-environments';
  }

  if (url.includes('/completion')) {
    return 'completions';
  }

  if (url.includes('/arithmetic') || url.includes('/operators') || url.includes('/conversion')) {
    return 'arithmetic';
  }

  if (url.includes('/call') || url.includes('/function-object')) {
    return 'calls';
  }

  if (url.includes('realm')) {
    return 'realm-setup';
  }

  if (url.startsWith('src/parser')) {
    return 'parser';
  }

  if (url.startsWith('src/evaluator')) {
    return 'evaluator';
  }

  return 'other-runtime';
}

/**
 * @param {CpuProfile} profile
 * @returns {{
 *   total: number,
 *   frames: readonly CpuFrameSummary[],
 *   categories: readonly CpuCategorySummary[],
 * }}
 */
export function summarizeCpuProfile(profile) {
  const { nodes, samples, timeDeltas } = profile;

  /** @type {Map<number, CpuProfileNode>} */
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  /** @type {Map<string, { url: string, functionName: string, selfTime: number }>} */
  const frameTotals = new Map();

  let total = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const nodeId = samples[i];
    const delta = timeDeltas[i] ?? 0;
    const node = nodeById.get(nodeId);

    if (node === undefined) {
      continue;
    }

    const url = normalizeUrl(node.callFrame.url ?? '');
    const { functionName } = node.callFrame;
    const key = `${url}#${functionName}`;

    const existing = frameTotals.get(key);

    if (existing === undefined) {
      frameTotals.set(key, { url, functionName, selfTime: delta });
    } else {
      existing.selfTime += delta;
    }

    total += delta;
  }

  const frames = [...frameTotals.values()]
    .map((f) => ({
      url: f.url,
      functionName: f.functionName,
      selfTime: f.selfTime,
      percentage: total > 0 ? (f.selfTime / total) * 100 : 0,
      category: classifyProfileFrame(f),
    }))
    .sort(compareFramesBySelfTime);

  const categories = buildCpuCategories(frames, total);

  return Object.freeze({
    total,
    frames: Object.freeze(frames),
    categories: Object.freeze(categories),
  });
}

/**
 * @param {AllocationProfile} profile
 * @returns {{
 *   total: number,
 *   frames: readonly AllocationFrameSummary[],
 *   categories: readonly AllocationCategorySummary[],
 * }}
 */
export function summarizeAllocationProfile(profile) {
  /** @type {Map<string, { url: string, functionName: string, selfSize: number }>} */
  const frameTotals = new Map();

  walkAllocationNode(profile.head, frameTotals);

  let total = 0;

  for (const frame of frameTotals.values()) {
    total += frame.selfSize;
  }

  const frames = [...frameTotals.values()]
    .map((f) => ({
      url: f.url,
      functionName: f.functionName,
      selfSize: f.selfSize,
      percentage: total > 0 ? (f.selfSize / total) * 100 : 0,
      category: classifyProfileFrame(f),
    }))
    .sort(compareFramesBySelfSize);

  const categories = buildAllocationCategories(frames, total);

  return Object.freeze({
    total,
    frames: Object.freeze(frames),
    categories: Object.freeze(categories),
  });
}

/**
 * @param {AllocationNode} node
 * @param {Map<string, { url: string, functionName: string, selfSize: number }>} totals
 * @returns {void}
 */
function walkAllocationNode(node, totals) {
  const url = normalizeUrl(node.callFrame.url ?? '');
  const { functionName } = node.callFrame;
  const key = `${url}#${functionName}`;

  if (node.selfSize > 0) {
    const existing = totals.get(key);

    if (existing === undefined) {
      totals.set(key, { url, functionName, selfSize: node.selfSize });
    } else {
      existing.selfSize += node.selfSize;
    }
  }

  for (const child of node.children) {
    walkAllocationNode(child, totals);
  }
}

/**
 * @param {readonly CpuFrameSummary[]} frames
 * @param {number} total
 * @returns {readonly CpuCategorySummary[]}
 */
function buildCpuCategories(frames, total) {
  /** @type {Map<string, number>} */
  const categoryTotals = new Map();

  for (const category of STABLE_CATEGORIES) {
    categoryTotals.set(category, 0);
  }

  for (const frame of frames) {
    const current = categoryTotals.get(frame.category) ?? 0;
    categoryTotals.set(frame.category, current + frame.selfTime);
  }

  return Object.freeze(
    STABLE_CATEGORIES.map((category) => {
      const selfTime = categoryTotals.get(category) ?? 0;
      return Object.freeze({
        category,
        selfTime,
        percentage: total > 0 ? (selfTime / total) * 100 : 0,
      });
    }).sort(compareCategoriesByCpuTime),
  );
}

/**
 * @param {readonly AllocationFrameSummary[]} frames
 * @param {number} total
 * @returns {readonly AllocationCategorySummary[]}
 */
function buildAllocationCategories(frames, total) {
  /** @type {Map<string, number>} */
  const categoryTotals = new Map();

  for (const category of STABLE_CATEGORIES) {
    categoryTotals.set(category, 0);
  }

  for (const frame of frames) {
    const current = categoryTotals.get(frame.category) ?? 0;
    categoryTotals.set(frame.category, current + frame.selfSize);
  }

  return Object.freeze(
    STABLE_CATEGORIES.map((category) => {
      const selfSize = categoryTotals.get(category) ?? 0;
      return Object.freeze({
        category,
        selfSize,
        percentage: total > 0 ? (selfSize / total) * 100 : 0,
      });
    }).sort(compareCategoriesByAllocationSize),
  );
}

/**
 * Normalize a profiler URL to a repository-relative path starting with `src/`.
 * Strips `file://` prefixes, absolute path prefixes up to `src/`, and leaves
 * paths that are already repository-relative unchanged.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (url === '') {
    return '';
  }

  const srcIndex = url.indexOf('src/');

  if (srcIndex !== -1) {
    return url.slice(srcIndex);
  }

  return url;
}

/**
 * @param {{ selfTime: number, url: string, functionName: string }} a
 * @param {{ selfTime: number, url: string, functionName: string }} b
 * @returns {number}
 */
function compareFramesBySelfTime(a, b) {
  if (b.selfTime !== a.selfTime) {
    return b.selfTime - a.selfTime;
  }

  const keyA = `${a.url}#${a.functionName}`;
  const keyB = `${b.url}#${b.functionName}`;

  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  return 0;
}

/**
 * @param {{ selfSize: number, url: string, functionName: string }} a
 * @param {{ selfSize: number, url: string, functionName: string }} b
 * @returns {number}
 */
function compareFramesBySelfSize(a, b) {
  if (b.selfSize !== a.selfSize) {
    return b.selfSize - a.selfSize;
  }

  const keyA = `${a.url}#${a.functionName}`;
  const keyB = `${b.url}#${b.functionName}`;

  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  return 0;
}

/**
 * @param {{ selfTime: number }} a
 * @param {{ selfTime: number }} b
 * @returns {number}
 */
function compareCategoriesByCpuTime(a, b) {
  return b.selfTime - a.selfTime;
}

/**
 * @param {{ selfSize: number }} a
 * @param {{ selfSize: number }} b
 * @returns {number}
 */
function compareCategoriesByAllocationSize(a, b) {
  return b.selfSize - a.selfSize;
}
