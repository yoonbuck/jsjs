import { runTests } from './harness/runner.js';

const [, , testPath] = process.argv;

if (!testPath) {
  throw new Error('Usage: node test/run-node.js <test-file>');
}

main().catch((error) => {
  process.exitCode = 1;
  process.stdout.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
});

async function main() {
  const testModule = await import(
    new URL(`../${testPath}`, import.meta.url).href
  );
  const tests = testModule.default ?? testModule.tests;

  if (!Array.isArray(tests)) {
    throw new Error(`Expected ${testPath} to export a test array`);
  }

  /** @type {{ name: string, status: 'passed' | 'failed', error?: { name: string, message: string } }[]} */
  const results = [];

  await runTests(tests, (result) => {
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  });

  const failed = results.some((result) => result.status !== 'passed');

  if (failed) {
    process.exitCode = 1;
  }
}
