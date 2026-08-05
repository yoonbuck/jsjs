// Local stand-in for the upstream Test262 `harness/assert.js`, restricted to
// the ES5 subset this engine supports. Failures throw `Test262Error` from
// `sta.js`, which the runner always evaluates first.

function assert(condition, message) {
  if (condition !== true) {
    throw new Test262Error('assert failed: ' + message);
  }
}

assert._sameValue = function (actual, expected) {
  if (actual === expected) {
    return actual !== 0 || 1 / actual === 1 / expected;
  }

  return actual !== actual && expected !== expected;
};

assert.sameValue = function (actual, expected, message) {
  if (assert._sameValue(actual, expected) !== true) {
    throw new Test262Error('assert.sameValue failed: ' + message);
  }
};

assert.notSameValue = function (actual, unexpected, message) {
  if (assert._sameValue(actual, unexpected) === true) {
    throw new Test262Error('assert.notSameValue failed: ' + message);
  }
};
