/**
 * @typedef {{ name: string, source: string, expectedChecksum: number }} Workload
 */

/**
 * @param {readonly string[]} lines
 * @returns {string}
 */
function workloadSource(lines) {
  return lines.join('\n');
}

/**
 * @param {string} name
 * @param {string} source
 * @param {number} expectedChecksum
 * @returns {Workload}
 */
function createWorkload(name, source, expectedChecksum) {
  return Object.freeze({ name, source, expectedChecksum });
}

/**
 * @param {Workload} workload
 * @param {number} repetitions
 * @returns {Workload}
 */
function scaleWorkload(workload, repetitions) {
  return createWorkload(
    workload.name,
    workloadSource([
      '(function () {',
      '  var __jsjsBenchmarkChecksum = 0;',
      '  var __jsjsBenchmarkRepeat;',
      `  for (__jsjsBenchmarkRepeat = 0; __jsjsBenchmarkRepeat < ${repetitions}; __jsjsBenchmarkRepeat += 1) {`,
      `    __jsjsBenchmarkChecksum = ${workload.source};`,
      '  }',
      '  return __jsjsBenchmarkChecksum;',
      '}())',
    ]),
    workload.expectedChecksum,
  );
}

export const WORKLOADS = Object.freeze([
  createWorkload(
    'arithmetic-loops',
    workloadSource([
      '(function () {',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 20000; i += 1) {',
      '    acc = (acc + ((i * 17) ^ (i >>> 3))) | 0;',
      '    acc = (acc ^ ((acc << 5) | (acc >>> 7))) | 0;',
      '  }',
      '  return (acc + -709160451) | 0;',
      '}())',
    ]),
    1397312734,
  ),
  createWorkload(
    'calls-recursion',
    workloadSource([
      '(function () {',
      '  function climb(n, a, b) {',
      '    return n === 0 ? a : climb(n - 1, b, (a + b + n) | 0);',
      '  }',
      '  var total = 0;',
      '  var i;',
      '  for (i = 0; i < 2000; i += 1) {',
      '    total = (total + climb(12, i | 0, 1)) | 0;',
      '  }',
      '  return (total + -1283335460) | 0;',
      '}())',
    ]),
    -1100296460,
  ),
  createWorkload(
    'object-properties',
    workloadSource([
      '(function () {',
      '  var obj = { alpha: 1, beta: 2, gamma: 3, delta: 4 };',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 25000; i += 1) {',
      '    obj.alpha = (obj.alpha + i) | 0;',
      '    obj.beta = (obj.beta ^ obj.alpha) | 0;',
      '    obj.gamma = (obj.gamma + obj.beta + (i & 7)) | 0;',
      '    obj.delta = (obj.delta + obj.gamma - obj.beta) | 0;',
      '    acc = (acc + obj.alpha + obj.beta + obj.gamma + obj.delta) | 0;',
      '  }',
      '  return (acc + -295970853) | 0;',
      '}())',
    ]),
    1122746965,
  ),
  createWorkload(
    'arrays',
    workloadSource([
      '(function () {',
      '  var values = [];',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 8000; i += 1) {',
      '    values.push((i * 7) & 255);',
      '  }',
      '  for (i = 0; i < 32000; i += 1) {',
      '    var index = i % values.length;',
      '    values[index] = (values[index] + i + (index & 3)) & 255;',
      '    acc = (acc + values[index] + values[(index + 1) % values.length]) | 0;',
      '  }',
      '  return (acc + 770289492) | 0;',
      '}())',
    ]),
    778416596,
  ),
  createWorkload(
    'strings',
    workloadSource([
      '(function () {',
      '  var parts = ["alpha", "beta", "gamma", "delta"];',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 10000; i += 1) {',
      '    var text = parts[i % parts.length] + ":" + String(i % 97) + ":" + parts[(i + 1) % parts.length];',
      '    text = text.replace(/a/g, "A");',
      '    acc = (acc + text.charCodeAt(i % text.length) + text.length) | 0;',
      '  }',
      '  return (acc + -282821) | 0;',
      '}())',
    ]),
    677005,
  ),
  createWorkload(
    'json',
    workloadSource([
      '(function () {',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 4000; i += 1) {',
      '    var payload = { id: i, even: i % 2 === 0, values: [i & 7, (i * 3) & 7, (i * 5) & 7], label: "item-" + (i % 23) };',
      '    var text = JSON.stringify(payload);',
      '    var parsed = JSON.parse(text);',
      '    acc = (acc + parsed.id + parsed.values[1] + text.length + (parsed.even ? 1 : 0)) | 0;',
      '  }',
      '  return (acc + 10344784) | 0;',
      '}())',
    ]),
    18589934,
  ),
  createWorkload(
    'regexp',
    workloadSource([
      '(function () {',
      '  var acc = 0;',
      '  var re = /([a-z]+)-(\\d+)/g;',
      '  var i;',
      '  for (i = 0; i < 12000; i += 1) {',
      '    var text = "alpha-" + (i % 97) + " beta-" + (i % 89) + " gamma-" + (i % 83);',
      '    var match;',
      '    re.lastIndex = 0;',
      '    while ((match = re.exec(text)) !== null) {',
      '      acc = (acc + match[1].length * match[2].length + match.index) | 0;',
      '    }',
      '  }',
      '  return (acc + 8274680) | 0;',
      '}())',
    ]),
    8900000,
  ),
]);

const SMOKE_WORKLOAD_BASES = Object.freeze([
  createWorkload(
    'arithmetic-loops',
    workloadSource([
      '(function () {',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 400; i += 1) {',
      '    acc = (acc + ((i * 17) ^ (i >>> 3))) | 0;',
      '    acc = (acc ^ ((acc << 5) | (acc >>> 7))) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
    326514743,
  ),
  createWorkload(
    'calls-recursion',
    workloadSource([
      '(function () {',
      '  function climb(n, a, b) {',
      '    return n === 0 ? a : climb(n - 1, b, (a + b + n) | 0);',
      '  }',
      '  var total = 0;',
      '  var i;',
      '  for (i = 0; i < 80; i += 1) {',
      '    total = (total + climb(8, i | 0, 1)) | 0;',
      '  }',
      '  return total | 0;',
      '}())',
    ]),
    60200,
  ),
  createWorkload(
    'object-properties',
    workloadSource([
      '(function () {',
      '  var obj = { alpha: 1, beta: 2, gamma: 3, delta: 4 };',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 500; i += 1) {',
      '    obj.alpha = (obj.alpha + i) | 0;',
      '    obj.beta = (obj.beta ^ obj.alpha) | 0;',
      '    obj.gamma = (obj.gamma + obj.beta + (i & 7)) | 0;',
      '    obj.delta = (obj.delta + obj.gamma - obj.beta) | 0;',
      '    acc = (acc + obj.alpha + obj.beta + obj.gamma + obj.delta) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
    1809722845,
  ),
  createWorkload(
    'arrays',
    workloadSource([
      '(function () {',
      '  var values = [];',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 200; i += 1) {',
      '    values.push((i * 7) & 255);',
      '  }',
      '  for (i = 0; i < 1200; i += 1) {',
      '    var index = i % values.length;',
      '    values[index] = (values[index] + i + (index & 3)) & 255;',
      '    acc = (acc + values[index] + values[(index + 1) % values.length]) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
    300744,
  ),
  createWorkload(
    'strings',
    workloadSource([
      '(function () {',
      '  var parts = ["alpha", "beta", "gamma", "delta"];',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 300; i += 1) {',
      '    var text = parts[i % parts.length] + ":" + String(i % 19) + ":" + parts[(i + 1) % parts.length];',
      '    text = text.replace(/a/g, "A");',
      '    acc = (acc + text.charCodeAt(i % text.length) + text.length) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
    28839,
  ),
  createWorkload(
    'json',
    workloadSource([
      '(function () {',
      '  var acc = 0;',
      '  var i;',
      '  for (i = 0; i < 120; i += 1) {',
      '    var payload = { id: i, even: i % 2 === 0, values: [i & 7, (i * 3) & 7, (i * 5) & 7], label: "item-" + (i % 11) };',
      '    var text = JSON.stringify(payload);',
      '    var parsed = JSON.parse(text);',
      '    acc = (acc + parsed.id + parsed.values[1] + text.length + (parsed.even ? 1 : 0)) | 0;',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
    14300,
  ),
  createWorkload(
    'regexp',
    workloadSource([
      '(function () {',
      '  var acc = 0;',
      '  var re = /([a-z]+)-(\\d+)/g;',
      '  var i;',
      '  for (i = 0; i < 240; i += 1) {',
      '    var text = "alpha-" + (i % 17) + " beta-" + (i % 13) + " gamma-" + (i % 11);',
      '    var match;',
      '    re.lastIndex = 0;',
      '    while ((match = re.exec(text)) !== null) {',
      '      acc = (acc + match[1].length * match[2].length + match.index) | 0;',
      '    }',
      '  }',
      '  return acc | 0;',
      '}())',
    ]),
    9941,
  ),
]);

const SMOKE_WORKLOADS = Object.freeze(
  SMOKE_WORKLOAD_BASES.map((workload) => scaleWorkload(workload, 32)),
);

/** @type {Readonly<Record<string, readonly Workload[]>>} */
const PROFILE_WORKLOADS = Object.freeze({
  default: WORKLOADS,
  smoke: SMOKE_WORKLOADS,
});

/**
 * @param {string} profile
 * @returns {readonly Workload[]}
 */
export function workloadsForProfile(profile) {
  const workloads = Object.prototype.hasOwnProperty.call(
    PROFILE_WORKLOADS,
    profile,
  )
    ? PROFILE_WORKLOADS[profile]
    : undefined;

  if (workloads === undefined) {
    throw new RangeError(`Unknown benchmark profile: ${profile}`);
  }

  return workloads;
}
