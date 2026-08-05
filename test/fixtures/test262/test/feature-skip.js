/*---
description: Tests declaring unsupported features are skipped, never executed
esid: fixture-feature-skip
features: [Proxy, Reflect]
---*/

var handler = new Proxy({}, {});

assert.sameValue(typeof handler, 'object', 'this line must never run');
