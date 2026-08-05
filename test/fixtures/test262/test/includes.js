/*---
description: Declared includes are evaluated before the test source
esid: fixture-includes
includes: [fixtureAdd.js]
---*/

assert.sameValue(fixtureAdd(2, 3), 5, 'fixtureAdd is available');
assert.sameValue(typeof assert.sameValue, 'function', 'default includes stay loaded');
