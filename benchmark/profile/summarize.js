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
const PROFILE_CAPTURE_ORIGIN = 'http://jsjs.localhost';
/**
 * Matches an RFC 3986 scheme prefix (`scheme ":"`) anchored at the start of a
 * URL. Two or more scheme characters are required so a Windows drive prefix
 * (`C:/repo/src/...`) stays a filesystem path instead of being read as a
 * one-letter scheme.
 */
const PROFILE_URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]+:/u;

/**
 * Classify a profile call frame into a stable category based on its source URL.
 *
 * @param {{ url: string, functionName: string }} frame
 * @returns {string}
 */
export function classifyProfileFrame(frame) {
  const url = normalizeProfileUrl(frame.url ?? '');

  if (!url.startsWith('src/')) {
    return 'host';
  }

  if (
    url === 'src/runtime/descriptors.js' ||
    url === 'src/runtime/object.js' ||
    url === 'src/builtins/object.js'
  ) {
    return 'object-property';
  }

  if (
    url === 'src/runtime/array-object.js' ||
    url === 'src/builtins/array.js'
  ) {
    return 'arrays';
  }

  if (
    url.includes('runtime/environment') ||
    url.includes('runtime/reference')
  ) {
    return 'references-environments';
  }

  if (url.includes('/completion')) {
    return 'completions';
  }

  if (
    url.includes('/arithmetic') ||
    url.includes('/operators') ||
    url.includes('/conversion')
  ) {
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

    const url = normalizeProfileUrl(node.callFrame.url ?? '');
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
  const url = normalizeProfileUrl(node.callFrame.url ?? '');
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
 *
 * Only two shapes may be normalized: a scheme-less path, and an absolute URL
 * under a scheme this project actually captures from (`file:`, and `http:` at
 * the capture origin). Everything else is host code — a browser extension, a
 * bundler-synthesised `webpack:` source, a `blob:` worker, a Node builtin —
 * whose path is opaque, so it is returned byte for byte rather than having a
 * `src/` segment lifted out of it and misattributed to this repository.
 *
 * Within a normalizable path the last path-segment-bounded `src/` wins, and a
 * `src/` segment below `node_modules` is always host code.
 *
 * @param {string} url
 * @returns {string}
 */
export function normalizeProfileUrl(url) {
  if (url === '') {
    return '';
  }

  if (url.startsWith('src/')) {
    return url;
  }

  const scheme = readProfileUrlScheme(url);

  if (scheme === null) {
    return normalizeProfilePathname(url, url);
  }

  const protocol = recognizedProfileUrlProtocol(url, scheme);

  if (protocol === null) {
    return url;
  }

  const parsedUrl = parseAbsoluteProfileUrl(url, protocol);

  if (parsedUrl === null) {
    return url;
  }

  if (
    (parsedUrl.protocol === 'http:' &&
      parsedUrl.origin !== PROFILE_CAPTURE_ORIGIN) ||
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'file:')
  ) {
    return url;
  }

  return normalizeProfilePathname(parsedUrl.pathname, url);
}

/**
 * The lowercased `scheme:` prefix of an absolute URL, or `null` when the input
 * carries no scheme at all and is therefore a path.
 *
 * @param {string} url
 * @returns {string | null}
 */
function readProfileUrlScheme(url) {
  const match = PROFILE_URL_SCHEME_PATTERN.exec(url);

  return match === null ? null : match[0].toLowerCase();
}

/**
 * @param {string} url
 * @param {string} scheme The lowercased `scheme:` prefix of `url`.
 * @returns {'file:' | 'http:' | 'https:' | null}
 */
function recognizedProfileUrlProtocol(url, scheme) {
  if (scheme !== 'http:' && scheme !== 'https:' && scheme !== 'file:') {
    return null;
  }

  // Every recognized capture scheme is authority-based in profiler output, so
  // a missing `//` is a shape the parser below cannot read; treat it as
  // unknown rather than guessing at a pathname.
  return url.slice(scheme.length, scheme.length + 2) === '//' ? scheme : null;
}

/**
 * @param {string} url
 * @param {'file:' | 'http:' | 'https:'} protocol
 * @returns {{ protocol: string, origin: string, pathname: string } | null}
 */
function parseAbsoluteProfileUrl(url, protocol) {
  if (protocol === 'file:') {
    return {
      protocol,
      origin: 'null',
      pathname: readFileUrlPathname(url),
    };
  }

  return readHttpUrlParts(url, protocol);
}

/**
 * @param {string} url
 * @returns {string}
 */
function readFileUrlPathname(url) {
  const pathStart = 'file://'.length;
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  let pathEnd = url.length;

  if (queryStart !== -1) {
    pathEnd = queryStart;
  }

  if (hashStart !== -1 && hashStart < pathEnd) {
    pathEnd = hashStart;
  }

  return url.slice(pathStart, pathEnd);
}

/**
 * @param {string} url
 * @param {'http:' | 'https:'} protocol
 * @returns {{ protocol: string, origin: string, pathname: string } | null}
 */
function readHttpUrlParts(url, protocol) {
  const authorityStart = protocol.length + 2;
  const suffix = url.slice(authorityStart);
  const pathOffset = suffix.search(/[/?#]/u);
  const authority =
    pathOffset === -1 ? suffix : suffix.slice(0, Math.max(pathOffset, 0));

  if (authority.length === 0) {
    return null;
  }

  const delimiter = pathOffset === -1 ? '' : suffix[pathOffset];
  const remainder = pathOffset === -1 ? '' : suffix.slice(pathOffset);
  let pathname = '/';

  if (delimiter === '/') {
    const queryStart = remainder.indexOf('?');
    const hashStart = remainder.indexOf('#');
    let pathEnd = remainder.length;

    if (queryStart !== -1) {
      pathEnd = queryStart;
    }

    if (hashStart !== -1 && hashStart < pathEnd) {
      pathEnd = hashStart;
    }

    pathname = remainder.slice(0, pathEnd);
  }

  return {
    protocol,
    origin: `${protocol}//${normalizeHttpAuthority(authority, protocol)}`,
    pathname,
  };
}

/**
 * @param {string} authority
 * @param {'http:' | 'https:'} protocol
 * @returns {string}
 */
function normalizeHttpAuthority(authority, protocol) {
  const normalizedAuthority = authority.toLowerCase();

  if (
    (protocol === 'http:' && normalizedAuthority.endsWith(':80')) ||
    (protocol === 'https:' && normalizedAuthority.endsWith(':443'))
  ) {
    return normalizedAuthority.slice(0, normalizedAuthority.lastIndexOf(':'));
  }

  return normalizedAuthority;
}

/**
 * @param {string} pathname
 * @param {string} fallback
 * @returns {string}
 */
function normalizeProfilePathname(pathname, fallback) {
  const pathSegments = pathname.split('/');
  const srcIndex = pathSegments.lastIndexOf('src');

  if (
    srcIndex === -1 ||
    pathSegments.slice(0, srcIndex).includes('node_modules')
  ) {
    return fallback;
  }

  return pathSegments.slice(srcIndex).join('/');
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
