/*---
description: Raw modules run once without harness includes or source rewriting
flags: [module, raw]
---*/

if (typeof assert !== 'undefined') {
  throw 'harness includes leaked into a raw module';
}

export const value = 42;
