/*---
description: Arithmetic, closures, and property access evaluate in both variants
esid: fixture-positive
---*/

function twice(value) {
  return value * 2;
}

assert.sameValue(twice(21), 42, 'twice(21)');
assert.sameValue(typeof twice, 'function', 'typeof twice');

var counter = { total: 0 };
counter.total = counter.total + 5;

assert.sameValue(counter.total, 5, 'counter.total');
assert(counter.total < 6, 'counter.total is below six');
