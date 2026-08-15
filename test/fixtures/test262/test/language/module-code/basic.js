/*---
description: A module fixture resolves an adjacent dependency
flags: [module]
---*/

import { value } from './basic_FIXTURE.js';

assert.sameValue(value, 42);
