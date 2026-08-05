/*---
description: onlyStrict tests run once, with the strict directive prepended
esid: fixture-only-strict
flags: [onlyStrict]
---*/

assert.sameValue(1 + 1, 2, 'arithmetic in the strict variant');
