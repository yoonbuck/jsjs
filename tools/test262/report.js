/**
 * Deterministic Test262 report records.
 *
 * Every runner run emits one JSON object per line: a `test` record per
 * executed (file, variant) pair, then a single `summary` record. Records are
 * serialized through a fixed key projection so two runs of the same inputs
 * produce byte-identical output regardless of how the record objects were
 * built, and no host-specific data (absolute paths, timings, stack traces)
 * ever reaches the report.
 */

/**
 * @typedef {'passed' | 'failed' | 'skipped'} Test262Status
 *
 * @typedef {{
 *   type: 'test',
 *   file: string,
 *   variant: string | null,
 *   status: Test262Status,
 *   reason?: string,
 *   message?: string,
 *   features?: readonly string[],
 * }} Test262TestRecord
 *
 * @typedef {{
 *   type: 'summary',
 *   total: number,
 *   passed: number,
 *   failed: number,
 *   skipped: number,
 * }} Test262SummaryRecord
 *
 * @typedef {Test262TestRecord | Test262SummaryRecord} Test262Record
 */

const STATUSES = Object.freeze(['passed', 'failed', 'skipped']);

/**
 * @param {{
 *   file: string,
 *   variant?: string | null,
 *   status: Test262Status,
 *   reason?: string,
 *   message?: string,
 *   features?: readonly string[],
 * }} fields
 * @returns {Test262TestRecord}
 */
export function createTestRecord(fields) {
  if (typeof fields.file !== 'string' || fields.file === '') {
    throw new TypeError('A Test262 record needs a file path');
  }

  if (!STATUSES.includes(fields.status)) {
    throw new TypeError(`Unknown Test262 status: ${String(fields.status)}`);
  }

  /** @type {Test262TestRecord} */
  const record = {
    type: 'test',
    file: fields.file,
    variant: fields.variant ?? null,
    status: fields.status,
  };

  if (fields.reason !== undefined) {
    record.reason = fields.reason;
  }

  if (fields.message !== undefined) {
    record.message = fields.message;
  }

  if (fields.features !== undefined && fields.features.length > 0) {
    record.features = Object.freeze([...fields.features]);
  }

  return Object.freeze(record);
}

/**
 * @param {readonly Test262TestRecord[]} records
 * @returns {Test262SummaryRecord}
 */
export function createSummaryRecord(records) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const record of records) {
    if (record.status === 'passed') {
      passed += 1;
    } else if (record.status === 'failed') {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return Object.freeze({
    type: 'summary',
    total: records.length,
    passed,
    failed,
    skipped,
  });
}

/**
 * @param {Test262Record} record
 * @returns {string}
 */
export function formatRecordLine(record) {
  if (record.type === 'summary') {
    return JSON.stringify({
      type: 'summary',
      total: record.total,
      passed: record.passed,
      failed: record.failed,
      skipped: record.skipped,
    });
  }

  /** @type {Record<string, unknown>} */
  const projected = {
    type: 'test',
    file: record.file,
    variant: record.variant ?? null,
    status: record.status,
  };

  if (record.reason !== undefined) {
    projected.reason = record.reason;
  }

  if (record.message !== undefined) {
    projected.message = record.message;
  }

  if (record.features !== undefined && record.features.length > 0) {
    projected.features = [...record.features];
  }

  return JSON.stringify(projected);
}

/**
 * @param {readonly Test262Record[]} records
 * @returns {string[]}
 */
export function formatReportLines(records) {
  return records.map((record) => formatRecordLine(record));
}

/**
 * @param {readonly Test262Record[]} records
 * @returns {string}
 */
export function formatReport(records) {
  return formatReportLines(records)
    .map((line) => `${line}\n`)
    .join('');
}
