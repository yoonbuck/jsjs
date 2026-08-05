/*---
description: Raw tests run verbatim, without harness includes or variants
esid: fixture-raw
flags: [raw]
---*/

if (typeof assert !== 'undefined') {
  throw 'harness includes leaked into a raw test';
}

if (1 + 1 !== 2) {
  throw 'raw arithmetic is broken';
}
