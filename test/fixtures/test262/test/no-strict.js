/*---
description: noStrict tests run once, without the strict directive
esid: fixture-no-strict
flags: [noStrict]
---*/

var octal = 010;

assert.sameValue(octal, 8, 'legacy octal literals only parse outside strict mode');
