// Local stand-in for the upstream Test262 `harness/sta.js`. It defines the
// same `Test262Error` contract the runner classifies negative runtime
// expectations against, written in the ES5 subset this engine supports (no
// `Object`, no `try`/`catch`, no update expressions).

function Test262Error(message) {
  this.message = message;
}

Test262Error.prototype.toString = function () {
  return 'Test262Error: ' + this.message;
};

Test262Error.thrower = function (message) {
  throw new Test262Error(message);
};
