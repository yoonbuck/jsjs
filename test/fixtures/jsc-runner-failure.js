import { runJscSuites, startJscRun } from '../jsc-runner.js';

startJscRun(() =>
  runJscSuites([
    {
      file: 'test/fixtures/jsc-runner-failure.js',
      tests: [
        {
          name: 'deliberate JSC failure reports a failed record',
          run() {
            throw new Error('deliberate JSC failure');
          },
        },
      ],
    },
  ]),
);
