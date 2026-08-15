/*---
description: $DONE completes after a guest Promise reaction
esid: fixture-async-promise
flags: [async]
---*/

Promise.resolve(42).then(function (value) {
  $DONE(value === 42 ? undefined : 'wrong value');
});
