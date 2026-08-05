/*---
description: Tests whose declared features are all supported still run
esid: fixture-supported-feature
features: [fixture-subset]
---*/

assert.sameValue([1, 2, 3].length, 3, 'array literal length');
