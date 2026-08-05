/*---
description: A guest throw is reported as a runtime-phase negative result
esid: fixture-runtime-negative
negative:
  phase: runtime
  type: Test262Error
---*/

Test262Error.thrower('thrown on purpose');
