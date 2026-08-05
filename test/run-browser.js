import { runTests } from './harness/runner.js';

main().catch((error) => {
  const output = document.getElementById('output');

  if (output) {
    output.textContent += `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`;
  }

  throw error;
});

async function main() {
  const output = document.getElementById('output');
  const testFiles = new URLSearchParams(location.search).getAll('test');

  if (!output) {
    throw new Error('Missing output element');
  }

  const files = testFiles.length > 0 ? testFiles : ['./foundation.test.js'];

  for (const file of files) {
    const module = await import(new URL(file, import.meta.url).href);
    const tests = module.default ?? module.tests;

    if (!Array.isArray(tests)) {
      throw new Error(`Expected ${file} to export a test array`);
    }

    await runTests(tests, (result) => {
      output.textContent += `${JSON.stringify(result)}\n`;
    });
  }
}
