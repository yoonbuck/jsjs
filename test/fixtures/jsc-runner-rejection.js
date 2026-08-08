import { startJscRun } from '../jsc-runner.js';

startJscRun(async () => {
  throw new Error('deliberate JSC runner rejection');
});
