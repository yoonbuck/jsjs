/*---
description: Always fails, so a Test262 adapter's nonzero-exit contract is observable
esid: fixture-adapter-failure
flags: [raw]
---*/

// `raw` keeps this tree to two files: no harness includes are loaded, so the
// only thing under test is that a failing record reaches the adapter's exit
// path.
throw 'deliberate Test262 adapter failure';
