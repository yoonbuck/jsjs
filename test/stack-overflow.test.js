/**
 * Contracts for the engine's recursion boundary.
 *
 * Guest recursion runs on the host stack, so without a boundary of its own the
 * engine inherits whatever the host does when that stack runs out — an
 * uncatchable host `RangeError` escaping `evaluateScript`, at a depth that
 * differs between Node, Chromium, and `jsc`. These tests pin the replacement:
 * a deterministic budget of engine stack frames that raises a realm-local
 * guest `RangeError` guest code can catch, identically on every host.
 *
 * The unit is an engine frame rather than a guest call, so these tests avoid
 * asserting *which* depth a given program reaches — that is an implementation
 * detail of how many nodes the evaluator walks. What they pin is that the
 * budget is deterministic, that it grows with the configured limit, and that
 * it contains every shape of runaway recursion the engine can be driven into.
 *
 * Most cases set a small `maxStackDepth` so the contract under test is the
 * *boundary*, not the host's stack size, and so the suite stays fast. The
 * cases that deliberately exercise the default limit say so.
 */

import { assertSame, assertThrows } from './harness/assert.js';
import { createAgent, createRealm, evaluateScript } from '../src/index.js';
import { EngineObject } from '../src/runtime/object.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';
import { Reference, getValue } from '../src/runtime/reference.js';
import { SuperReferenceBase } from '../src/runtime/super-reference.js';

/**
 * @param {string} source
 * @param {import('../src/runtime/realm.js').RealmOptions} [options]
 * @returns {unknown}
 */
function run(source, options) {
  const realm = createRealm(options);
  return evaluateScript(realm, source).value;
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineGlobal(realm, name, value) {
  realm.globalObject.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {import('../src/runtime/agent.js').Agent} agent
 * @returns {any}
 */
function generatorHostChainRoot(agent) {
  let chain = agent._generatorHostChain;

  while (
    chain !== null &&
    chain.parent !== undefined &&
    chain.parent !== null
  ) {
    chain = chain.parent;
  }

  return chain;
}

/**
 * @param {readonly import('../src/runtime/realm.js').Realm[]} realms
 * @returns {void}
 */
function assertGeneratorAccountingCleared(realms) {
  for (const realm of realms) {
    assertSame(realm.stackGuard.depth, 0);
    assertSame(realm.stackGuard.synchronousCallChainDepth ?? 0, 0);
    assertSame(realm.stackGuard.generatorHostChainDepth, 0);
    assertSame(realm.agent._generatorHostChain, null);
    assertSame(realm.agent._synchronousCallChain, null);
    assertSame(realm.agent._activeStackGuards.size, 0);
  }
}

/**
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} label
 * @returns {void}
 */
function assertFiniteGeneratorResume(realm, label) {
  const completion = evaluateScript(
    realm,
    `
      var finite = (function* () {
        yield "${label}";
        return "${label}-done";
      }());
      var finiteFirst = finite.next();
      var finiteLast = finite.next();
      [
        finiteFirst.value,
        finiteFirst.done,
        finiteLast.value,
        finiteLast.done
      ].join("|");
    `,
  );

  assertSame(completion.type, 'normal');
  assertSame(completion.value, `${label}|false|${label}-done|true`);
}

/**
 * Creates a foreign guest function whose body starts a finite but deep
 * generator chain. The caller Realm's deliberately smaller budget must govern
 * that chain whenever an abstract operation invokes the function.
 *
 * @param {import('../src/runtime/realm.js').Realm} realm
 * @param {string} name
 * @returns {import('../src/runtime/descriptors.js').CallableLike}
 */
function createDeepGeneratorStarter(realm, name) {
  return /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
    evaluateScript(
      realm,
      `
        function* ${name}Generator(depth) {
          if (depth === 0) {
            return 41;
          }
          return ${name}Generator(depth - 1).next().value;
        }
        function ${name}() {
          return ${name}Generator(120).next().value;
        }
        ${name};
      `,
    ).value
  );
}

/**
 * @param {{ type: string, value: unknown }} completion
 * @param {readonly import('../src/runtime/realm.js').Realm[]} realms
 * @returns {void}
 */
function assertRealmRangeError(completion, realms) {
  const error = /** @type {EngineObject} */ (completion.value);

  assertSame(completion.type, 'normal');
  assertSame(error instanceof EngineObject, true);
  assertSame(error.get('name'), 'RangeError');
  assertSame(error.get('message'), 'Maximum call stack size exceeded');
  assertSame(
    realms.some(
      (realm) =>
        error.getPrototypeOf() === realm.intrinsics.rangeErrorPrototype,
    ),
    true,
  );
}

/**
 * @param {boolean} borrowed
 * @returns {void}
 */
function assertForeignGeneratorRecursionContained(borrowed) {
  const realms = [];
  const methodRealm = createRealm();
  const borrowedNext = evaluateScript(
    methodRealm,
    '(function* () {})().next',
  ).value;

  for (let index = 0; index < 8; index += 1) {
    const realm = createRealm();
    const recurse = borrowed
      ? 'var iterator = foreign(); iterator.next = borrowedNext; iterator.next();'
      : 'foreign().next();';

    evaluateScript(realm, `function* recurse() { ${recurse} }`);

    if (borrowed) {
      defineGlobal(realm, 'borrowedNext', borrowedNext);
    }

    realms.push(realm);
  }

  for (let index = 0; index < realms.length; index += 1) {
    defineGlobal(
      realms[index],
      'foreign',
      realms[(index + 1) % realms.length].globalObject.get('recurse'),
    );
  }

  const completion = evaluateScript(
    realms[0],
    'try { recurse().next(); "not thrown"; } catch (error) { error; }',
  );
  const allRealms = [...realms, methodRealm];

  assertRealmRangeError(completion, allRealms);
  assertGeneratorAccountingCleared(allRealms);

  for (let index = 0; index < allRealms.length; index += 1) {
    assertFiniteGeneratorResume(
      allRealms[index],
      `${borrowed ? 'borrowed' : 'foreign'}-${String(index)}`,
    );
  }

  assertGeneratorAccountingCleared(allRealms);
}

/**
 * @param {'direct' | 'call' | 'apply' | 'bind'} invocation
 * @returns {void}
 */
function assertOrdinaryForeignRecursionRemainsUnbudgeted(invocation) {
  const callerRealm = createRealm({ maxStackDepth: 40 });
  const functionRealm = createRealm({ maxStackDepth: 300 });
  const realms = [callerRealm, functionRealm];

  evaluateScript(
    functionRealm,
    `
      function foreignRecursive(depth) {
        return depth > 0 ? foreignRecursive(depth - 1) : "done";
      }
    `,
  );
  defineGlobal(
    callerRealm,
    'foreignRecursive',
    functionRealm.globalObject.get('foreignRecursive'),
  );

  const expression = {
    direct: 'foreignRecursive(10)',
    call: 'foreignRecursive.call(null, 10)',
    apply: 'foreignRecursive.apply(null, [10])',
    bind: 'foreignRecursive.bind(null)(10)',
  }[invocation];
  const completion = evaluateScript(
    callerRealm,
    `try { ${expression}; } catch (error) { error.name; }`,
  );

  assertSame(
    completion.value,
    'done',
    `${invocation} ordinary recursion must not start a generator budget`,
  );
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {'call' | 'apply'} wrapper
 * @returns {void}
 */
function assertGeneratorWrapperRecursionContained(wrapper) {
  const realms = [90, 200, 120, 70].map((maxStackDepth) =>
    createRealm({ maxStackDepth }),
  );
  const invocation =
    wrapper === 'call'
      ? 'iterator.next.call(iterator);'
      : 'iterator.next.apply(iterator, []);';

  for (const realm of realms) {
    evaluateScript(
      realm,
      `
        function* wrappedRecursiveGenerator() {
          var iterator = foreignWrappedRecursiveGenerator();
          ${invocation}
        }
      `,
    );
  }

  for (let index = 0; index < realms.length; index += 1) {
    defineGlobal(
      realms[index],
      'foreignWrappedRecursiveGenerator',
      realms[(index + 1) % realms.length].globalObject.get(
        'wrappedRecursiveGenerator',
      ),
    );
  }

  const completion = evaluateScript(
    realms[0],
    `
      try {
        wrappedRecursiveGenerator().next();
        "not thrown";
      } catch (error) {
        error;
      }
    `,
  );

  assertRealmRangeError(completion, realms);
  assertGeneratorAccountingCleared(realms);

  for (let index = 0; index < realms.length; index += 1) {
    assertFiniteGeneratorResume(realms[index], `${wrapper}-wrapper-${index}`);
  }
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {boolean} shareAgent
 * @param {'next' | 'return' | 'throw'} method
 * @param {'object' | 'primitive'} receiverKind
 * @returns {void}
 */
function assertInvalidForeignGeneratorReceiverPreflights(
  shareAgent,
  method,
  receiverKind,
) {
  const sharedAgent = shareAgent ? createAgent() : undefined;
  const callerRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 300,
  });
  const methodRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 1,
  });
  const realms = [callerRealm, methodRealm];
  const agents = [...new Set(realms.map((realm) => realm.agent))];
  let references = 0;
  let resumes = 0;
  let methodGuardEntries = 0;
  let baseline = { references: 0, resumes: 0, methodGuardEntries: 0 };
  let baselineRecorded = false;

  for (const agent of agents) {
    const enterReference = agent.enterGeneratorHostChainReference;
    agent.enterGeneratorHostChainReference = (maxDepth) => {
      references += 1;
      return enterReference.call(agent, maxDepth);
    };
    const enterResume = agent.enterGeneratorHostChain;
    agent.enterGeneratorHostChain = (maxDepth) => {
      resumes += 1;
      return enterResume.call(agent, maxDepth);
    };
  }

  const enterMethodGuard = methodRealm.stackGuard.enter;
  methodRealm.stackGuard.enter = () => {
    methodGuardEntries += 1;
    return enterMethodGuard.call(methodRealm.stackGuard);
  };
  const markInvalidCall = callerRealm.createNativeFunction({
    name: 'markInvalidCall',
    length: 0,
    call() {
      baseline = { references, resumes, methodGuardEntries };
      baselineRecorded = true;
    },
  });

  defineGlobal(
    callerRealm,
    'localCall',
    callerRealm.intrinsics.functionPrototype.get('call'),
  );
  defineGlobal(
    callerRealm,
    'foreignGeneratorMethod',
    /** @type {EngineObject} */ (methodRealm.intrinsics.generatorPrototype).get(
      method,
    ),
  );
  defineGlobal(callerRealm, 'markInvalidCall', markInvalidCall);
  defineGlobal(
    callerRealm,
    'invalidReceiver',
    receiverKind === 'object' ? evaluateScript(callerRealm, '({})').value : 1,
  );
  evaluateScript(
    callerRealm,
    `
      function* callInvalidGeneratorMethod() {
        markInvalidCall();
        try {
          localCall.call(foreignGeneratorMethod, invalidReceiver);
          return "not thrown";
        } catch (error) {
          return error;
        }
      }
    `,
  );
  const completion = evaluateScript(
    callerRealm,
    'callInvalidGeneratorMethod().next().value',
  );
  const error = /** @type {EngineObject} */ (completion.value);

  assertSame(
    completion.type,
    'normal',
    `${method} on an invalid ${receiverKind} receiver must reach the guest catch`,
  );
  assertSame(error instanceof EngineObject, true);
  assertSame(error.get('name'), 'TypeError');
  assertSame(
    error.get('message'),
    `Generator.prototype.${method} called on incompatible receiver`,
  );
  assertSame(
    error.getPrototypeOf(),
    methodRealm.intrinsics.typeErrorPrototype,
    `${method} must materialize its receiver error in the method Realm`,
  );
  assertSame(baselineRecorded, true);
  assertSame(
    references - baseline.references,
    0,
    `${method} on an invalid receiver must not create a generator-chain reference`,
  );
  assertSame(
    resumes - baseline.resumes,
    0,
    `${method} on an invalid receiver must not begin a generator resume`,
  );
  assertSame(
    methodGuardEntries - baseline.methodGuardEntries,
    0,
    `${method} must validate before entering the method Realm guard`,
  );
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {boolean} shareAgent
 * @param {'next' | 'return' | 'throw'} method
 * @returns {void}
 */
function assertValidForeignGeneratorReceiverStillActivates(shareAgent, method) {
  const sharedAgent = shareAgent ? createAgent() : undefined;
  const callerRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 300,
  });
  const methodRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 40,
  });
  const realms = [callerRealm, methodRealm];
  const agents = [...new Set(realms.map((realm) => realm.agent))];
  let references = 0;
  let resumes = 0;
  let methodGuardEntries = 0;
  let baseline = { references: 0, resumes: 0, methodGuardEntries: 0 };
  let baselineRecorded = false;

  for (const agent of agents) {
    const enterReference = agent.enterGeneratorHostChainReference;
    agent.enterGeneratorHostChainReference = (maxDepth) => {
      references += 1;
      return enterReference.call(agent, maxDepth);
    };
    const enterResume = agent.enterGeneratorHostChain;
    agent.enterGeneratorHostChain = (maxDepth) => {
      resumes += 1;
      return enterResume.call(agent, maxDepth);
    };
  }

  const enterMethodGuard = methodRealm.stackGuard.enter;
  methodRealm.stackGuard.enter = () => {
    methodGuardEntries += 1;
    return enterMethodGuard.call(methodRealm.stackGuard);
  };
  const markValidCall = callerRealm.createNativeFunction({
    name: 'markValidCall',
    length: 0,
    call() {
      baseline = { references, resumes, methodGuardEntries };
      baselineRecorded = true;
    },
  });

  defineGlobal(
    callerRealm,
    'localCall',
    callerRealm.intrinsics.functionPrototype.get('call'),
  );
  defineGlobal(
    callerRealm,
    'foreignGeneratorMethod',
    /** @type {EngineObject} */ (methodRealm.intrinsics.generatorPrototype).get(
      method,
    ),
  );
  defineGlobal(callerRealm, 'markValidCall', markValidCall);

  const completion = evaluateScript(
    callerRealm,
    `
      var validReceiver = (function* () {
        try {
          yield "ready";
          return "next-complete";
        } catch (error) {
          return "caught:" + error;
        }
      }());
      ${method === 'next' ? '' : 'validReceiver.next();'}
      function* callValidGeneratorMethod() {
        markValidCall();
        var result = localCall.call(
          foreignGeneratorMethod,
          validReceiver,
          "sent"
        );
        return result.value + "|" + result.done;
      }
      callValidGeneratorMethod().next().value;
    `,
  );
  const expected = {
    next: 'ready|false',
    return: 'sent|true',
    throw: 'caught:sent|true',
  }[method];

  assertSame(completion.type, 'normal');
  assertSame(completion.value, expected);
  assertSame(baselineRecorded, true);
  assertSame(
    references - baseline.references,
    1,
    `${method} on a valid receiver must create one generator-chain reference`,
  );
  assertSame(
    resumes - baseline.resumes,
    1,
    `${method} on a valid receiver must begin one generator resume`,
  );
  assertSame(
    methodGuardEntries - baseline.methodGuardEntries,
    1,
    `${method} on a valid receiver must enter the method Realm guard`,
  );
  assertGeneratorAccountingCleared(realms);

  if (method === 'next') {
    assertSame(
      evaluateScript(callerRealm, 'validReceiver.next().done;').value,
      true,
    );
  }

  baseline = { references, resumes, methodGuardEntries };
  const completed = evaluateScript(
    callerRealm,
    `
      try {
        var completedResult = localCall.call(
          foreignGeneratorMethod,
          validReceiver,
          "again"
        );
        completedResult.value + "|" + completedResult.done;
      } catch (error) {
        "thrown:" + error;
      }
    `,
  );
  const completedExpected = {
    next: 'undefined|true',
    return: 'again|true',
    throw: 'thrown:again',
  }[method];

  assertSame(completed.type, 'normal');
  assertSame(completed.value, completedExpected);
  assertSame(
    references - baseline.references,
    1,
    `${method} on a completed receiver must create one chain reference`,
  );
  assertSame(
    resumes - baseline.resumes,
    0,
    `${method} on a completed receiver must not restart its continuation`,
  );
  assertSame(
    methodGuardEntries - baseline.methodGuardEntries,
    1,
    `${method} on a completed receiver must retain method guard accounting`,
  );
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {boolean} shareAgent
 * @param {'next' | 'return' | 'throw'} method
 * @returns {void}
 */
function assertExecutingForeignGeneratorReceiverPreflights(shareAgent, method) {
  const sharedAgent = shareAgent ? createAgent() : undefined;
  const callerRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 300,
  });
  const methodRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 1,
  });
  const realms = [callerRealm, methodRealm];
  const agents = [...new Set(realms.map((realm) => realm.agent))];
  let links = 0;
  let references = 0;
  let resumes = 0;
  let methodGuardEntries = 0;
  let invocationCount = 0;
  let observed = { links: 0, references: 0, resumes: 0, methodGuardEntries: 0 };

  for (const agent of agents) {
    const linkChain = agent.linkGeneratorHostChain;
    agent.linkGeneratorHostChain = (otherAgent) => {
      links += 1;
      return linkChain.call(agent, otherAgent);
    };
    const enterReference = agent.enterGeneratorHostChainReference;
    agent.enterGeneratorHostChainReference = (maxDepth) => {
      references += 1;
      return enterReference.call(agent, maxDepth);
    };
    const enterResume = agent.enterGeneratorHostChain;
    agent.enterGeneratorHostChain = (maxDepth) => {
      resumes += 1;
      return enterResume.call(agent, maxDepth);
    };
  }

  const enterMethodGuard = methodRealm.stackGuard.enter;
  methodRealm.stackGuard.enter = () => {
    methodGuardEntries += 1;
    return enterMethodGuard.call(methodRealm.stackGuard);
  };
  const foreignGeneratorMethod = /** @type {any} */ (
    /** @type {EngineObject} */ (methodRealm.intrinsics.generatorPrototype).get(
      method,
    )
  );
  const callGeneratorMethod = foreignGeneratorMethod.callFunction;
  /** @param {any[]} args */
  foreignGeneratorMethod.callFunction = function measuredCall(...args) {
    const baseline = { links, references, resumes, methodGuardEntries };
    invocationCount += 1;

    try {
      return callGeneratorMethod.apply(foreignGeneratorMethod, args);
    } finally {
      observed = {
        links: links - baseline.links,
        references: references - baseline.references,
        resumes: resumes - baseline.resumes,
        methodGuardEntries: methodGuardEntries - baseline.methodGuardEntries,
      };
    }
  };

  defineGlobal(callerRealm, 'foreignGeneratorMethod', foreignGeneratorMethod);

  const completion = evaluateScript(
    callerRealm,
    `
      function dive(depth) {
        if (depth > 0) {
          return dive(depth - 1);
        }
        return activeGenerator.reenter("sent");
      }
      function* active() {
        try {
          return dive(40);
        } catch (error) {
          return error;
        }
      }
      var activeGenerator = active();
      activeGenerator.reenter = foreignGeneratorMethod;
      activeGenerator.next().value;
    `,
  );
  const error = /** @type {EngineObject} */ (completion.value);

  assertSame(completion.type, 'normal');
  assertSame(error instanceof EngineObject, true);
  assertSame(error.get('name'), 'TypeError');
  assertSame(error.get('message'), 'Generator is already running');
  assertSame(
    error.getPrototypeOf(),
    methodRealm.intrinsics.typeErrorPrototype,
    `${method} must materialize its executing-state error in the method Realm`,
  );
  assertSame(invocationCount, 1);
  assertSame(
    observed.links,
    0,
    `${method} must reject an executing generator before linking Agents`,
  );
  assertSame(
    observed.references,
    0,
    `${method} must reject an executing generator before creating a chain reference`,
  );
  assertSame(
    observed.resumes,
    0,
    `${method} must reject an executing generator before beginning a resume`,
  );
  assertSame(
    observed.methodGuardEntries,
    0,
    `${method} must reject an executing generator before entering the method Realm guard`,
  );
  assertGeneratorAccountingCleared(realms);

  assertFiniteGeneratorResume(
    callerRealm,
    `${shareAgent ? 'shared' : 'cross'}-${method}-after-reentry`,
  );
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {readonly number[] | undefined} maxDepths
 * @param {boolean} [shareAgent]
 * @returns {void}
 */
function assertOrdinaryCrossAgentUnionContainsRecursion(
  maxDepths,
  shareAgent = false,
) {
  const agent = shareAgent ? createAgent() : undefined;
  const realms = Array.from({ length: 4 }, (_unused, index) =>
    createRealm(
      maxDepths === undefined
        ? { agent }
        : { agent, maxStackDepth: maxDepths[index] },
    ),
  );

  evaluateScript(
    realms[0],
    `
      function startRecursiveRing() {
        return foreignRecursiveRing();
      }
      function recursiveRing() {
        return foreignRecursiveRing();
      }
      function finiteRing(depth) {
        return depth > 0 ? foreignFiniteRing(depth - 1) : "done";
      }
    `,
  );
  for (let index = 1; index < realms.length; index += 1) {
    evaluateScript(
      realms[index],
      `
        function recursiveRing() {
          return foreignRecursiveRing();
        }
        function finiteRing(depth) {
          return depth > 0 ? foreignFiniteRing(depth - 1) : "done";
        }
      `,
    );
  }

  defineGlobal(
    realms[0],
    'foreignRecursiveRing',
    realms[1].globalObject.get('recursiveRing'),
  );
  for (let index = 1; index < realms.length; index += 1) {
    const nextIndex = index === realms.length - 1 ? 0 : index + 1;
    defineGlobal(
      realms[index],
      'foreignRecursiveRing',
      realms[nextIndex].globalObject.get('recursiveRing'),
    );
  }
  for (let index = 0; index < realms.length; index += 1) {
    defineGlobal(
      realms[index],
      'foreignFiniteRing',
      realms[(index + 1) % realms.length].globalObject.get('finiteRing'),
    );
  }

  const completion = evaluateScript(
    realms[0],
    `
      try {
        startRecursiveRing();
        "not thrown";
      } catch (error) {
        error;
      }
    `,
  );

  assertRealmRangeError(completion, realms);
  assertGeneratorAccountingCleared(realms);

  for (let index = 0; index < realms.length; index += 1) {
    assertSame(
      evaluateScript(realms[index], 'finiteRing(16);').value,
      'done',
      `Agent ${String(index)} must remain callable after aggregate overflow`,
    );
  }
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {'direct' | 'call' | 'apply' | 'accessor' | 'coercion'} shape
 * @returns {void}
 */
function assertOrdinaryCrossAgentShapeContainsRecursion(shape) {
  const realms = [700, 900, 800, 1000].map((maxStackDepth) =>
    createRealm({ maxStackDepth }),
  );
  /** @type {string | undefined} */
  let callableInvocation;

  if (shape === 'direct') {
    callableInvocation = 'foreignRecursiveRing()';
  } else if (shape === 'call') {
    callableInvocation = 'foreignRecursiveRing.call(null)';
  } else if (shape === 'apply') {
    callableInvocation = 'foreignRecursiveRing.apply(null, [])';
  }

  for (const realm of realms) {
    if (callableInvocation !== undefined) {
      evaluateScript(
        realm,
        `
          function recursiveRing() {
            return ${callableInvocation};
          }
        `,
      );
    } else if (shape === 'accessor') {
      evaluateScript(
        realm,
        `
          var recursiveTarget = {};
          Object.defineProperty(recursiveTarget, "value", {
            get: function () {
              return foreignRecursiveTarget.value;
            }
          });
        `,
      );
    } else {
      evaluateScript(
        realm,
        `
          var recursiveTarget = {
            valueOf: function () {
              return +foreignRecursiveTarget;
            }
          };
        `,
      );
    }

    evaluateScript(
      realm,
      `
        function finiteRing(depth) {
          return depth > 0 ? foreignFiniteRing(depth - 1) : "done";
        }
      `,
    );
  }

  for (let index = 0; index < realms.length; index += 1) {
    const nextRealm = realms[(index + 1) % realms.length];

    if (callableInvocation !== undefined) {
      defineGlobal(
        realms[index],
        'foreignRecursiveRing',
        nextRealm.globalObject.get('recursiveRing'),
      );
    } else {
      defineGlobal(
        realms[index],
        'foreignRecursiveTarget',
        nextRealm.globalObject.get('recursiveTarget'),
      );
    }

    defineGlobal(
      realms[index],
      'foreignFiniteRing',
      nextRealm.globalObject.get('finiteRing'),
    );
  }

  const expression =
    callableInvocation !== undefined
      ? 'recursiveRing()'
      : shape === 'accessor'
        ? 'recursiveTarget.value'
        : '+recursiveTarget';
  const completion = evaluateScript(
    realms[0],
    `
      try {
        ${expression};
        "not thrown";
      } catch (error) {
        error;
      }
    `,
  );

  assertRealmRangeError(completion, realms);
  assertGeneratorAccountingCleared(realms);

  for (let index = 0; index < realms.length; index += 1) {
    assertSame(evaluateScript(realms[index], 'finiteRing(16);').value, 'done');
  }
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {'same-realm' | 'shared-agent' | 'different-agents'} topology
 * @param {boolean} abrupt
 * @returns {void}
 */
function assertGeneratorChainDetachesBetweenResumes(topology, abrupt) {
  const sharedAgent = topology === 'shared-agent' ? createAgent() : undefined;
  const callerRealm = createRealm({
    ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
    maxStackDepth: 400,
  });
  const ownerRealm =
    topology === 'same-realm'
      ? callerRealm
      : createRealm({
          ...(sharedAgent === undefined ? {} : { agent: sharedAgent }),
          maxStackDepth: 130,
        });
  const realms = [...new Set([callerRealm, ownerRealm])];
  const expectedMaxDepth = topology === 'same-realm' ? 400 : 130;
  /** @type {any[]} */
  const activeResumeRoots = [];
  /** @type {Array<null | {
   *   linked: boolean,
   *   resumes: number,
   *   references: number,
   *   depth: number,
   *   maxDepth: number,
   * }>} */
  const postResumeSnapshots = [];
  const inspectDuringResume = ownerRealm.createNativeFunction({
    name: 'inspectDuringResume',
    length: 0,
    call() {
      const roots = realms.map((realm) => generatorHostChainRoot(realm.agent));

      if (
        roots[0] === null ||
        roots.some((root) => root !== roots[0]) ||
        roots[0].maxDepth !== expectedMaxDepth
      ) {
        throw new Error(
          `${topology} resume did not re-adopt every participant`,
        );
      }

      activeResumeRoots.push(roots[0]);
    },
  });
  const inspectAfterResume = callerRealm.createNativeFunction({
    name: 'inspectAfterResume',
    length: 0,
    call() {
      const roots = realms.map((realm) => generatorHostChainRoot(realm.agent));
      const root = roots.find((candidate) => candidate !== null) ?? null;

      postResumeSnapshots.push(
        root === null
          ? null
          : {
              linked: roots.every((candidate) => candidate === root),
              resumes: root.resumes,
              references: root.references,
              depth: root.depth,
              maxDepth: root.maxDepth,
            },
      );
    },
  });

  defineGlobal(ownerRealm, 'inspectDuringResume', inspectDuringResume);
  evaluateScript(
    ownerRealm,
    `
      var lifecycleIterator = (function* () {
        inspectDuringResume();
        yield "yielded";
        inspectDuringResume();
        ${abrupt ? 'throw new Error("abrupt");' : 'return "complete";'}
      }());
    `,
  );
  defineGlobal(
    callerRealm,
    'lifecycleIterator',
    ownerRealm.globalObject.get('lifecycleIterator'),
  );
  defineGlobal(callerRealm, 'inspectAfterResume', inspectAfterResume);

  const completion = evaluateScript(
    callerRealm,
    `
      function ordinaryAfterResume(depth) {
        return depth > 0 ? ordinaryAfterResume(depth - 1) : "done";
      }
      function outerGeneratorCaller(depth) {
        if (depth > 0) {
          return outerGeneratorCaller(depth - 1);
        }

        var first = lifecycleIterator.next();
        inspectAfterResume();
        var afterYield;
        try {
          afterYield = ordinaryAfterResume(30);
        } catch (error) {
          afterYield = error.name;
        }

        var terminal;
        try {
          var second = lifecycleIterator.next();
          terminal = second.value + "|" + second.done;
        } catch (error) {
          terminal = error.message;
        }
        inspectAfterResume();

        var afterTerminal;
        try {
          afterTerminal = ordinaryAfterResume(30);
        } catch (error) {
          afterTerminal = error.name;
        }

        return [
          first.value,
          first.done,
          afterYield,
          terminal,
          afterTerminal
        ].join("|");
      }
      outerGeneratorCaller(7);
    `,
  );

  for (const snapshot of postResumeSnapshots) {
    if (snapshot !== null) {
      assertSame(snapshot.linked, true);
      assertSame(snapshot.resumes, 0);
      assertSame(snapshot.references, 0);
      assertSame(snapshot.depth > 0, true);
      assertSame(snapshot.maxDepth, expectedMaxDepth);
    }
  }

  assertSame(completion.type, 'normal');
  assertSame(
    completion.value,
    abrupt
      ? 'yielded|false|done|abrupt|done'
      : 'yielded|false|done|complete|true|done',
    `${topology} ${abrupt ? 'abrupt' : 'complete'} resume must release its temporary chain before ordinary caller work`,
  );
  assertSame(
    JSON.stringify(postResumeSnapshots),
    '[null,null]',
    `${topology} generator chains must detach while outer frames remain active`,
  );
  assertSame(activeResumeRoots.length, 2);
  assertSame(
    activeResumeRoots[0] === activeResumeRoots[1],
    false,
    `${topology} later resume must re-adopt outer frames into a fresh chain`,
  );
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {boolean} borrowed
 * @param {boolean} [throughCall=false]
 * @returns {void}
 */
function assertGeneratorMethodParticipantsLinked(
  borrowed,
  throughCall = false,
) {
  const callerRealm = createRealm({ maxStackDepth: 90 });
  const ownerRealm = createRealm({ maxStackDepth: 200 });
  const methodRealm = borrowed
    ? createRealm({ maxStackDepth: 120 })
    : ownerRealm;
  const realms = [...new Set([callerRealm, ownerRealm, methodRealm])];
  const inspectChain = ownerRealm.createNativeFunction({
    name: 'inspectChain',
    length: 0,
    call() {
      const roots = realms.map((realm) => generatorHostChainRoot(realm.agent));

      if (
        roots[0] === null ||
        roots.some((root) => root !== roots[0]) ||
        roots[0].maxDepth !== 90
      ) {
        throw new Error('generator method participants were not linked');
      }
    },
  });

  defineGlobal(ownerRealm, 'inspectChain', inspectChain);
  evaluateScript(
    ownerRealm,
    `
      var linkedGenerator = (function* () {
        inspectChain();
        yield "first";
        inspectChain();
        return "done";
      }());
    `,
  );
  const generator = /** @type {EngineObject} */ (
    ownerRealm.globalObject.get('linkedGenerator')
  );

  if (borrowed) {
    const borrowedNext = evaluateScript(
      methodRealm,
      '(function* () {})().next',
    ).value;

    if (throughCall) {
      defineGlobal(callerRealm, 'borrowedNext', borrowedNext);
    } else {
      assertSame(generator.set('next', borrowedNext, generator), true);
    }
  }

  defineGlobal(callerRealm, 'linkedGenerator', generator);
  const resumeExpression = throughCall
    ? 'borrowedNext.call(linkedGenerator)'
    : 'linkedGenerator.next()';
  const first = evaluateScript(
    callerRealm,
    `var linkedFirst = ${resumeExpression}; linkedFirst.value;`,
  );

  assertSame(first.type, 'normal');
  assertSame(first.value, 'first');
  assertGeneratorAccountingCleared(realms);

  const last = evaluateScript(
    callerRealm,
    `var linkedLast = ${resumeExpression}; linkedLast.value;`,
  );

  assertSame(last.type, 'normal');
  assertSame(last.value, 'done');
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {'assignment' | 'computed-key' | 'destructuring'} form
 * @param {boolean} superTarget
 * @returns {void}
 */
function assertCachedComputedTargetRelinked(form, superTarget) {
  const realmA = createRealm({ maxStackDepth: 140 });
  const realmB = createRealm({ maxStackDepth: 110 });
  const realmC = createRealm({ maxStackDepth: 70 });
  const realms = [realmA, realmB, realmC];
  let keyCoercions = 0;
  let setCalls = 0;

  const assertLinked = (
    /** @type {string} */ stage,
    /** @type {number} */ expectedMaxDepth,
  ) => {
    const roots = realms.map((realm) => generatorHostChainRoot(realm.agent));
    const participating =
      stage.startsWith('put') && form === 'assignment'
        ? roots.slice(0, 2)
        : roots;

    if (
      participating[0] === null ||
      participating.some((root) => root !== participating[0]) ||
      participating[0].maxDepth !== expectedMaxDepth
    ) {
      throw new Error(`${stage} did not rejoin the cached target chain`);
    }
  };
  const inspectKey = realmC.createNativeFunction({
    name: 'inspectKey',
    length: 0,
    call() {
      keyCoercions += 1;
      assertLinked('key', 70);
      return 'slot';
    },
  });
  const inspectPut = realmB.createNativeFunction({
    name: 'inspectPut',
    length: 0,
    call() {
      assertLinked('put body', form === 'assignment' ? 110 : 70);
    },
  });
  const overflow =
    /** @type {import('../src/runtime/function-object.js').EngineFunction} */ (
      evaluateScript(
        realmB,
        'function overflow() { return overflow(); } overflow;',
      ).value
    );

  class InspectingSetObject extends EngineObject {
    /**
     * @param {string | symbol} name
     * @param {unknown} value
     * @param {unknown} receiver
     * @returns {boolean}
     */
    set(name, value, receiver) {
      setCalls += 1;
      assertLinked('put', form === 'assignment' ? 140 : 70);
      const callerRealm = this.agent?.activeExecutionRealm ?? undefined;
      inspectPut.callFunction(undefined, [], callerRealm);
      overflow.callFunction(undefined, [], callerRealm);
      return super.set(name, value, receiver);
    }
  }

  const foreignBase = new InspectingSetObject(
    realmB.intrinsics.objectPrototype,
  );

  defineGlobal(realmC, 'inspectKey', inspectKey);
  evaluateScript(
    realmC,
    `
      var foreignKey = {};
      foreignKey[Symbol.toPrimitive] = function () {
        return inspectKey();
      };
    `,
  );
  defineGlobal(realmA, 'foreignBase', foreignBase);
  defineGlobal(realmA, 'foreignKey', realmC.globalObject.get('foreignKey'));

  const base = superTarget ? 'super' : 'foreignBase';
  const target = `${base}[foreignKey]`;
  const operation = {
    assignment: `${target} = yield "pause";`,
    'computed-key': `${base}[yield "pause"] = 41;`,
    destructuring: `[${target} = yield "pause"] = [undefined];`,
  }[form];
  const body = `
    try {
      ${operation}
      return "not thrown";
    } catch (error) {
      return error;
    }
  `;

  if (superTarget) {
    evaluateScript(
      realmA,
      `
        var cachedTargetHolder = {
          *method() {
            ${body}
          }
        };
        var cachedTargetIterator = cachedTargetHolder.method();
      `,
    );
    const holder = /** @type {EngineObject} */ (
      realmA.globalObject.get('cachedTargetHolder')
    );
    assertSame(holder.setPrototypeOf(foreignBase), true);
  } else {
    evaluateScript(
      realmA,
      `
        function* cachedTargetGenerator() {
          ${body}
        }
        var cachedTargetIterator = cachedTargetGenerator();
      `,
    );
  }

  const first = evaluateScript(realmA, 'cachedTargetIterator.next().value;');

  assertSame(first.type, 'normal');
  assertSame(first.value, 'pause');
  assertSame(keyCoercions, form === 'assignment' ? 1 : 0);
  assertSame(setCalls, 0);
  assertGeneratorAccountingCleared(realms);

  const second = evaluateScript(
    realmA,
    `cachedTargetIterator.next(${form === 'computed-key' ? 'foreignKey' : '41'}).value;`,
  );

  assertRealmRangeError(second, realms);
  assertSame(
    /** @type {EngineObject} */ (second.value).getPrototypeOf(),
    realmB.intrinsics.rangeErrorPrototype,
  );
  assertSame(keyCoercions, 1);
  assertSame(setCalls, 1);
  assertGeneratorAccountingCleared(realms);

  for (let index = 0; index < realms.length; index += 1) {
    assertFiniteGeneratorResume(
      realms[index],
      `cached-${form}-${superTarget ? 'super' : 'ordinary'}-${index}`,
    );
  }
  assertGeneratorAccountingCleared(realms);
}

/**
 * @param {'iterator' | 'next' | 'done' | 'value'} property
 * @returns {void}
 */
function assertIteratorProtocolGetterLinked(property) {
  const realmA = createRealm();
  const realmB = createRealm();
  const realmC = createRealm();
  const inspectChain = realmC.createNativeFunction({
    name: 'inspectChain',
    length: 0,
    call() {
      const rootA = generatorHostChainRoot(realmA.agent);
      const rootC = generatorHostChainRoot(realmC.agent);

      if (rootA === null || rootA !== rootC) {
        throw new Error(`${property} getter entered a distinct host chain`);
      }
    },
  });
  const result = new EngineObject(realmB.intrinsics.objectPrototype);
  const iterator = new EngineObject(realmB.intrinsics.objectPrototype);
  const iterable = new EngineObject(realmB.intrinsics.objectPrototype);
  const next = realmB.createNativeFunction({
    name: 'next',
    length: 0,
    call() {
      return result;
    },
  });
  const iteratorMethod = realmB.createNativeFunction({
    name: '[Symbol.iterator]',
    length: 0,
    call() {
      return iterator;
    },
  });
  const methodGetter = realmC.createNativeFunction({
    name: `get ${property}`,
    length: 0,
    call() {
      inspectChain.callFunction(undefined, [], realmC);
      return property === 'iterator' ? iteratorMethod : next;
    },
  });
  const resultGetter = realmC.createNativeFunction({
    name: `get ${property}`,
    length: 0,
    call() {
      inspectChain.callFunction(undefined, [], realmC);
      return property === 'done' ? true : 'getter-value';
    },
  });

  iterable.defineOwnProperty(realmB.agent.wellKnownSymbols.iterator, {
    ...(property === 'iterator'
      ? { get: methodGetter }
      : { value: iteratorMethod, writable: true }),
    enumerable: false,
    configurable: true,
  });
  iterator.defineOwnProperty('next', {
    ...(property === 'next'
      ? { get: methodGetter }
      : { value: next, writable: true }),
    enumerable: false,
    configurable: true,
  });
  result.defineOwnProperty('done', {
    ...(property === 'done'
      ? { get: resultGetter }
      : { value: true, writable: true }),
    enumerable: true,
    configurable: true,
  });
  result.defineOwnProperty('value', {
    ...(property === 'value'
      ? { get: resultGetter }
      : { value: 'value', writable: true }),
    enumerable: true,
    configurable: true,
  });
  defineGlobal(realmA, 'foreignIterable', iterable);

  const completion = evaluateScript(
    realmA,
    `
      function* delegateGetter() {
        return yield* foreignIterable;
      }
      delegateGetter().next().value;
    `,
  );

  assertSame(completion.type, 'normal');
  assertSame(completion.value, property === 'value' ? 'getter-value' : 'value');
  assertGeneratorAccountingCleared([realmA, realmB, realmC]);
}

/**
 * @param {number | undefined} maxDepthA
 * @param {number | undefined} maxDepthB
 * @param {boolean} [sharedAgent=true]
 * @returns {{
 *   realmA: import('../src/runtime/realm.js').Realm,
 *   realmB: import('../src/runtime/realm.js').Realm,
 * }}
 */
function createMutuallyDelegatingRealms(
  maxDepthA,
  maxDepthB,
  sharedAgent = true,
) {
  const agent = sharedAgent ? createAgent() : undefined;
  const realmA = createRealm({
    ...(agent === undefined ? {} : { agent }),
    ...(maxDepthA === undefined ? {} : { maxStackDepth: maxDepthA }),
  });
  const realmB = createRealm({
    ...(agent === undefined ? {} : { agent }),
    ...(maxDepthB === undefined ? {} : { maxStackDepth: maxDepthB }),
  });

  evaluateScript(realmA, 'function* fromA() { yield* fromB(); }');
  evaluateScript(realmB, 'function* fromB() { yield* fromA(); }');
  defineGlobal(realmA, 'fromB', realmB.globalObject.get('fromB'));
  defineGlobal(realmB, 'fromA', realmA.globalObject.get('fromA'));

  return { realmA, realmB };
}

/** A budget small enough to overflow instantly, large enough for real work. */
const SMALL = { maxStackDepth: 400 };

const tests = [
  {
    name: 'unbounded direct recursion is a catchable guest RangeError',
    run() {
      assertSame(
        run(
          'try { (function f() { return f(); })(); "not thrown" }' +
            ' catch (e) { e.name + "|" + (e instanceof RangeError) + "|" + e.message }',
          SMALL,
        ),
        'RangeError|true|Maximum call stack size exceeded',
      );
    },
  },
  {
    name: 'an uncaught recursion overflow leaves the engine as a throw completion',
    run() {
      const realm = createRealm(SMALL);
      const completion = evaluateScript(
        realm,
        '(function f() { return f(); })()',
      );

      assertSame(completion.type, 'throw');
      assertSame(completion.value instanceof EngineObject, true);
      assertSame(
        /** @type {EngineObject} */ (completion.value).get('name'),
        'RangeError',
      );
    },
  },
  {
    name: 'the overflow error is realm-local, not a host error object',
    run() {
      const realm = createRealm(SMALL);
      const completion = evaluateScript(
        realm,
        '(function f() { return f(); })()',
      );
      const error = /** @type {EngineObject} */ (completion.value);

      assertSame(
        error.getPrototypeOf(),
        realm.intrinsics.rangeErrorPrototype,
        'the error must inherit from this realm\u2019s %RangeError.prototype%',
      );
      assertSame(
        run(
          'try { (function f() { return f(); })() }' +
            ' catch (e) { e.constructor === RangeError' +
            ' && Object.getPrototypeOf(e) === RangeError.prototype }',
          SMALL,
        ),
        true,
      );
    },
  },
  {
    name: 'recursion through a constructor call is catchable',
    run() {
      assertSame(
        run(
          'function F() { new F(); }' +
            ' try { new F(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'mutual recursion is catchable',
    run() {
      assertSame(
        run(
          'function a() { return b(); } function b() { return a(); }' +
            ' try { a(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through direct eval is catchable',
    run() {
      assertSame(
        run(
          'function f() { return eval("f()"); }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through a nested eval chain is catchable',
    run() {
      assertSame(
        run(
          'function f(depth) { return eval("f(depth + 1)"); }' +
            ' try { f(0); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through a dynamic Function is catchable',
    run() {
      assertSame(
        run(
          'var g = Function("return g();");' +
            ' try { g(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion driven through a built-in callback is catchable',
    run() {
      assertSame(
        run(
          'function f() { return [1].map(f)[0]; }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through an accessor is catchable',
    run() {
      assertSame(
        run(
          'var o = {};' +
            ' Object.defineProperty(o, "x", { get: function () { return o.x; } });' +
            ' try { o.x; "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'recursion through a valueOf coercion is catchable',
    run() {
      assertSame(
        run(
          'var o = { valueOf: function () { return o + 1; } };' +
            ' try { o + 1; "not thrown" } catch (e) { e.name }',
          SMALL,
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'an inner catch handles the overflow and its frame keeps running',
    run() {
      assertSame(
        run(
          'function deep() { return deep(); }' +
            ' function label() { return "recovered"; }' +
            ' function f() { try { deep(); } catch (e) { return e.name + ":" + label(); } }' +
            ' try { f() } catch (e) { "escaped:" + e.name }',
          SMALL,
        ),
        'RangeError:recovered',
      );
    },
  },
  {
    name: 'finally blocks run while the overflow unwinds',
    run() {
      // Every activation that entered its `try` must run its `finally` exactly
      // once on the way out: the overflow is an ordinary guest throw, not a
      // shortcut past pending cleanup.
      assertSame(
        run(
          'var entered = 0; var unwound = 0;' +
            ' function f() { try { entered = entered + 1; f(); }' +
            '   finally { unwound = unwound + 1; } }' +
            ' try { f(); } catch (e) {}' +
            ' entered === unwound && entered > 10',
          SMALL,
        ),
        true,
      );
    },
  },
  {
    name: 'depth accounting is restored after an overflow is caught',
    run() {
      assertSame(
        run(
          'function deep() { return deep(); }' +
            ' function countdown(i) { return i > 0 ? countdown(i - 1) : "done"; }' +
            ' try { deep(); } catch (e) {}' +
            ' try { deep(); } catch (e) {}' +
            ' countdown(30)',
          SMALL,
        ),
        'done',
      );
    },
  },
  {
    name: 'depth accounting is restored across evaluateScript calls in one realm',
    run() {
      const realm = createRealm(SMALL);

      assertSame(
        evaluateScript(realm, '(function f() { return f(); })()').type,
        'throw',
      );
      assertSame(
        evaluateScript(
          realm,
          'function countdown(i) { return i > 0 ? countdown(i - 1) : "done"; } countdown(30)',
        ).value,
        'done',
      );
    },
  },
  {
    name: 'the reachable depth is deterministic for a given limit',
    run() {
      // The same program under the same budget must always stop at the same
      // depth, whatever host it runs on. That determinism is the whole point
      // of owning the boundary rather than inheriting the host's stack.
      const source =
        'var depth = 0; function f() { depth = depth + 1; return f(); }' +
        ' try { f(); } catch (e) {} depth';

      const first = /** @type {number} */ (run(source, { maxStackDepth: 300 }));
      const second = run(source, { maxStackDepth: 300 });

      assertSame(typeof first, 'number');
      assertSame(first > 0, true, 'the budget must admit some recursion');
      assertSame(second, first);
    },
  },
  {
    name: 'a larger limit admits a strictly deeper recursion',
    run() {
      const source =
        'var depth = 0; function f() { depth = depth + 1; return f(); }' +
        ' try { f(); } catch (e) {} depth';

      const small = /** @type {number} */ (run(source, { maxStackDepth: 300 }));
      const large = /** @type {number} */ (run(source, { maxStackDepth: 900 }));

      assertSame(
        large > small,
        true,
        `expected a deeper recursion under a larger budget, got ${small} then ${large}`,
      );
    },
  },
  {
    name: 'the budget is per realm, so one realm\u2019s overflow does not shrink another\u2019s',
    run() {
      const source =
        'var depth = 0; function f() { depth = depth + 1; return f(); }' +
        ' try { f(); } catch (e) {} depth';

      const reference = /** @type {number} */ (
        evaluateScript(createRealm(SMALL), source).value
      );

      const exhausted = createRealm(SMALL);
      assertSame(
        evaluateScript(exhausted, '(function f() { return f(); })()').type,
        'throw',
      );

      const neighbour = createRealm(SMALL);
      assertSame(
        /** @type {number} */ (evaluateScript(neighbour, source).value),
        reference,
        'a neighbouring realm must still get its whole budget',
      );
    },
  },
  {
    name: 'the default limit admits recursion depths ordinary programs use',
    run() {
      assertSame(
        run(
          'function countdown(i) { return i > 0 ? countdown(i - 1) : "done"; }' +
            ' countdown(100)',
        ),
        'done',
      );
    },
  },
  {
    name: 'the default limit contains recursion on every host without a host overflow',
    run() {
      // No `maxStackDepth`: this is the contract that the shipped default is
      // below what Node, Chromium, and `jsc` can survive, for the recursion
      // shapes that spend host frames most generously per activation. Each of
      // these escapes as an uncatchable host `RangeError` if the default is
      // ever raised past a host's real budget.
      const shapes = [
        'function f() { return [1].map(function (x) { return f(x); })[0]; }',
        'function f() { var o = { valueOf: function () { return f(); } }; return o + 1; }',
        'function f() { return eval("f()"); }',
        'function f() { try { return f(); } finally { } }',
        'function f() { return [2, 1].sort(function () { return f(); })[0]; }',
      ];

      for (const shape of shapes) {
        assertSame(
          run(`${shape} try { f(); "not thrown" } catch (e) { e.name }`),
          'RangeError',
          shape,
        );
      }
    },
  },
  {
    name: 'the default limit makes recursive yield delegation guest-catchable',
    run() {
      assertSame(
        run(`
          function* recursive() {
            yield* recursive();
          }
          try {
            recursive().next();
            "not thrown";
          } catch (error) {
            [
              error.name,
              error instanceof RangeError,
              error.message
            ].join("|");
          }
        `),
        'RangeError|true|Maximum call stack size exceeded',
      );
    },
  },
  {
    name: 'the default limit contains generator-backed for-of recursion',
    run() {
      assertSame(
        run(`
          function* recursive() {
            for (var value of recursive()) {
              yield value;
            }
          }
          try {
            recursive().next();
            "not thrown";
          } catch (error) {
            [
              error.name,
              error instanceof RangeError,
              error.message
            ].join("|");
          }
        `),
        'RangeError|true|Maximum call stack size exceeded',
      );
    },
  },
  {
    name: 'the default limit contains mutual yield delegation across shared-Agent Realms',
    run() {
      const { realmA, realmB } = createMutuallyDelegatingRealms(
        undefined,
        undefined,
      );
      const completion = evaluateScript(
        realmA,
        `
          try {
            fromA().next();
            "not thrown";
          } catch (error) {
            error;
          }
        `,
      );
      const error = /** @type {EngineObject} */ (completion.value);

      assertSame(completion.type, 'normal');
      assertSame(error instanceof EngineObject, true);
      assertSame(error.get('name'), 'RangeError');
      assertSame(error.get('message'), 'Maximum call stack size exceeded');
      assertSame(
        error.getPrototypeOf() === realmA.intrinsics.rangeErrorPrototype ||
          error.getPrototypeOf() === realmB.intrinsics.rangeErrorPrototype,
        true,
      );
      assertSame(realmA.stackGuard.depth, 0);
      assertSame(realmB.stackGuard.depth, 0);
    },
  },
  {
    name: 'the default limit contains mutual yield delegation across Agents',
    run() {
      const { realmA, realmB } = createMutuallyDelegatingRealms(
        undefined,
        undefined,
        false,
      );
      const completion = evaluateScript(
        realmA,
        'try { fromA().next(); "not thrown"; } catch (error) { error; }',
      );
      const error = /** @type {EngineObject} */ (completion.value);

      assertSame(completion.type, 'normal');
      assertSame(error instanceof EngineObject, true);
      assertSame(error.get('name'), 'RangeError');
      assertSame(error.get('message'), 'Maximum call stack size exceeded');
      assertSame(
        error.getPrototypeOf() === realmA.intrinsics.rangeErrorPrototype ||
          error.getPrototypeOf() === realmB.intrinsics.rangeErrorPrototype,
        true,
      );
      assertSame(realmA.stackGuard.depth, 0);
      assertSame(realmB.stackGuard.depth, 0);
    },
  },
  {
    name: 'deep ordinary cross-Agent calls seed the generator host chain',
    run() {
      const realms = [
        createRealm(),
        createRealm(),
        createRealm(),
        createRealm(),
      ];

      for (const realm of realms) {
        evaluateScript(
          realm,
          `
            function callRing(depth) {
              return depth > 0
                ? foreignCallRing(depth - 1)
                : recursiveGenerator().next();
            }
            function finiteCallRing(depth) {
              return depth > 0
                ? foreignFiniteCallRing(depth - 1)
                : "done";
            }
            function* recursiveGenerator() {
              yield* foreignRecursiveGenerator();
            }
          `,
        );
      }

      for (let index = 0; index < realms.length; index += 1) {
        const nextRealm = realms[(index + 1) % realms.length];

        defineGlobal(
          realms[index],
          'foreignCallRing',
          nextRealm.globalObject.get('callRing'),
        );
        defineGlobal(
          realms[index],
          'foreignFiniteCallRing',
          nextRealm.globalObject.get('finiteCallRing'),
        );
        defineGlobal(
          realms[index],
          'foreignRecursiveGenerator',
          nextRealm.globalObject.get('recursiveGenerator'),
        );
      }

      assertSame(
        evaluateScript(realms[0], 'finiteCallRing(100);').value,
        'done',
      );
      assertGeneratorAccountingCleared(realms);

      const completion = evaluateScript(
        realms[0],
        `
          try {
            callRing(375);
            "not thrown";
          } catch (error) {
            error;
          }
        `,
      );

      assertRealmRangeError(completion, realms);
      assertGeneratorAccountingCleared(realms);

      for (let index = 0; index < realms.length; index += 1) {
        assertFiniteGeneratorResume(realms[index], `ordinary-ring-${index}`);
      }
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'the default aggregate cross-Agent call budget contains ordinary recursion',
    run() {
      assertOrdinaryCrossAgentUnionContainsRecursion(undefined);
    },
  },
  {
    name: 'the aggregate call budget contains cross-Realm recursion on one Agent',
    run() {
      assertOrdinaryCrossAgentUnionContainsRecursion(undefined, true);
    },
  },
  {
    name: 'the strictest custom aggregate cross-Agent call budget contains ordinary recursion',
    run() {
      assertOrdinaryCrossAgentUnionContainsRecursion([700, 900, 800, 1000]);
    },
  },
  ...['direct', 'call', 'apply', 'accessor', 'coercion'].map((shape) => ({
    name: `aggregate cross-Agent accounting contains ordinary ${shape} recursion`,
    run() {
      assertOrdinaryCrossAgentShapeContainsRecursion(
        /** @type {'direct' | 'call' | 'apply' | 'accessor' | 'coercion'} */ (
          shape
        ),
      );
    },
  })),
  {
    name: 'direct ordinary cross-Agent recursion stays outside generator budgets',
    run() {
      assertOrdinaryForeignRecursionRemainsUnbudgeted('direct');
    },
  },
  {
    name: 'call-wrapped ordinary cross-Agent recursion stays outside generator budgets',
    run() {
      assertOrdinaryForeignRecursionRemainsUnbudgeted('call');
    },
  },
  {
    name: 'apply-wrapped ordinary cross-Agent recursion stays outside generator budgets',
    run() {
      assertOrdinaryForeignRecursionRemainsUnbudgeted('apply');
    },
  },
  {
    name: 'bound ordinary cross-Agent recursion stays outside generator budgets',
    run() {
      assertOrdinaryForeignRecursionRemainsUnbudgeted('bind');
    },
  },
  ...[true, false].flatMap((shareAgent) =>
    ['next', 'return', 'throw'].flatMap((method) =>
      ['object', 'primitive'].map((receiverKind) => ({
        name: `${shareAgent ? 'shared-Agent' : 'cross-Agent'} active generator ${method} preflights an invalid ${receiverKind} receiver`,
        run() {
          assertInvalidForeignGeneratorReceiverPreflights(
            shareAgent,
            /** @type {'next' | 'return' | 'throw'} */ (method),
            /** @type {'object' | 'primitive'} */ (receiverKind),
          );
        },
      })),
    ),
  ),
  ...[true, false].flatMap((shareAgent) =>
    ['next', 'return', 'throw'].map((method) => ({
      name: `${shareAgent ? 'shared-Agent' : 'cross-Agent'} active generator ${method} retains valid receiver accounting`,
      run() {
        assertValidForeignGeneratorReceiverStillActivates(
          shareAgent,
          /** @type {'next' | 'return' | 'throw'} */ (method),
        );
      },
    })),
  ),
  ...[true, false].flatMap((shareAgent) =>
    ['next', 'return', 'throw'].map((method) => ({
      name: `${shareAgent ? 'shared-Agent' : 'cross-Agent'} deep reentrant generator ${method} preflights executing state`,
      run() {
        assertExecutingForeignGeneratorReceiverPreflights(
          shareAgent,
          /** @type {'next' | 'return' | 'throw'} */ (method),
        );
      },
    })),
  ),
  {
    name: 'generator chains detach and re-adopt inside one outer caller',
    run() {
      for (const topology of [
        'different-agents',
        'shared-agent',
        'same-realm',
      ]) {
        for (const abrupt of [false, true]) {
          assertGeneratorChainDetachesBetweenResumes(
            /** @type {'same-realm' | 'shared-agent' | 'different-agents'} */ (
              topology
            ),
            abrupt,
          );
        }
      }
    },
  },
  {
    name: 'cross-Realm generator recursion preserves each Realm stack budget',
    run() {
      for (const [maxDepthA, maxDepthB] of [
        [80, 240],
        [240, 80],
      ]) {
        const { realmA, realmB } = createMutuallyDelegatingRealms(
          /** @type {number} */ (maxDepthA),
          /** @type {number} */ (maxDepthB),
        );
        const completion = evaluateScript(
          realmA,
          'try { fromA().next(); } catch (error) { error; }',
        );
        const error = /** @type {EngineObject} */ (completion.value);

        assertSame(completion.type, 'normal');
        assertSame(error instanceof EngineObject, true);
        assertSame(error.get('name'), 'RangeError');
        assertSame(
          error.getPrototypeOf() === realmA.intrinsics.rangeErrorPrototype ||
            error.getPrototypeOf() === realmB.intrinsics.rangeErrorPrototype,
          true,
        );
        assertSame(realmA.stackGuard.depth, 0);
        assertSame(realmB.stackGuard.depth, 0);
      }
    },
  },
  {
    name: 'initial and resumed foreign generator methods link the caller Realm',
    run() {
      assertGeneratorMethodParticipantsLinked(false);
    },
  },
  {
    name: 'initial and resumed borrowed generator methods link every Realm',
    run() {
      assertGeneratorMethodParticipantsLinked(true);
    },
  },
  {
    name: 'borrowed generator methods called through call retain the original Realm',
    run() {
      assertGeneratorMethodParticipantsLinked(true, true);
    },
  },
  {
    name: 'direct foreign generator next recursion shares one host chain',
    run() {
      assertForeignGeneratorRecursionContained(false);
    },
  },
  {
    name: 'borrowed cross-Agent generator next recursion shares one host chain',
    run() {
      assertForeignGeneratorRecursionContained(true);
    },
  },
  {
    name: 'generator recursion through call shares one cross-Agent host chain',
    run() {
      assertGeneratorWrapperRecursionContained('call');
    },
  },
  {
    name: 'generator recursion through apply shares one cross-Agent host chain',
    run() {
      assertGeneratorWrapperRecursionContained('apply');
    },
  },
  {
    name: 'a custom iterable links the third-Agent generator it returns',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('third-Agent iterator was not linked');
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      evaluateScript(realmA, 'function* fromA() { yield* foreignIterable; }');
      defineGlobal(realmC, 'fromA', realmA.globalObject.get('fromA'));
      evaluateScript(
        realmC,
        `
          function* fromC() {
            inspectChain();
            fromA().next();
          }
          var iteratorPool = [];
          for (var index = 0; index < 2000; index = index + 1) {
            iteratorPool[index] = fromC();
          }
        `,
      );
      defineGlobal(
        realmB,
        'iteratorPool',
        realmC.globalObject.get('iteratorPool'),
      );
      evaluateScript(
        realmB,
        `
          var iteratorIndex = 0;
          var foreignIterable = {};
          foreignIterable[Symbol.iterator] = function () {
            var iterator = iteratorPool[iteratorIndex];
            iteratorIndex = iteratorIndex + 1;
            return iterator;
          };
        `,
      );
      defineGlobal(
        realmA,
        'foreignIterable',
        realmB.globalObject.get('foreignIterable'),
      );

      const completion = evaluateScript(
        realmA,
        'try { fromA().next(); "not thrown"; } catch (error) { error; }',
      );

      assertRealmRangeError(completion, [realmA, realmB, realmC]);
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
      assertFiniteGeneratorResume(realmA, 'third-A');
      assertFiniteGeneratorResume(realmB, 'third-B');
      assertFiniteGeneratorResume(realmC, 'third-C');
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'delegated return and throw relink a suspended third-Agent iterator',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('suspended third-Agent iterator was not relinked');
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      evaluateScript(
        realmC,
        `
          var returnIterator = (function* () {
            try {
              yield "return-start";
            } finally {
              inspectChain();
            }
          }());
          var throwIterator = (function* () {
            try {
              yield "throw-start";
            } catch (error) {
              inspectChain();
              return "caught-" + error;
            }
          }());
          var generatorReturn = returnIterator.return;
          var generatorThrow = throwIterator.throw;
          Object.defineProperty(returnIterator, "return", {
            get: function () {
              inspectChain();
              return generatorReturn;
            }
          });
          Object.defineProperty(throwIterator, "throw", {
            get: function () {
              inspectChain();
              return generatorThrow;
            }
          });
        `,
      );
      defineGlobal(
        realmB,
        'returnIterator',
        realmC.globalObject.get('returnIterator'),
      );
      defineGlobal(
        realmB,
        'throwIterator',
        realmC.globalObject.get('throwIterator'),
      );
      evaluateScript(
        realmB,
        `
          var returnIterable = {};
          returnIterable[Symbol.iterator] = function () {
            return returnIterator;
          };
          var throwIterable = {};
          throwIterable[Symbol.iterator] = function () {
            return throwIterator;
          };
        `,
      );
      defineGlobal(
        realmA,
        'returnIterable',
        realmB.globalObject.get('returnIterable'),
      );
      defineGlobal(
        realmA,
        'throwIterable',
        realmB.globalObject.get('throwIterable'),
      );

      const completion = evaluateScript(
        realmA,
        `
          function* delegate(iterable) {
            return yield* iterable;
          }
          var returned = delegate(returnIterable);
          var returnStart = returned.next();
          var returnLast = returned.return("stop");
          var thrown = delegate(throwIterable);
          var throwStart = thrown.next();
          var throwLast = thrown.throw("boom");
          [
            returnStart.value,
            returnStart.done,
            returnLast.value,
            returnLast.done,
            throwStart.value,
            throwStart.done,
            throwLast.value,
            throwLast.done
          ].join("|");
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(
        completion.value,
        'return-start|false|stop|true|throw-start|false|caught-boom|true',
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
      assertFiniteGeneratorResume(realmA, 'methods-A');
      assertFiniteGeneratorResume(realmB, 'methods-B');
      assertFiniteGeneratorResume(realmC, 'methods-C');
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'iterator result getters run on the complete cross-Agent host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const realmD = createRealm();
      const inspectChain = realmD.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootD = generatorHostChainRoot(realmD.agent);

          if (rootA === null || rootA !== rootD) {
            throw new Error('foreign iterator result was not linked');
          }
        },
      });

      defineGlobal(realmD, 'inspectChain', inspectChain);
      evaluateScript(
        realmD,
        `
          var foreignResult = { value: "foreign-result" };
          Object.defineProperty(foreignResult, "done", {
            get: function () {
              inspectChain();
              return false;
            }
          });
        `,
      );
      defineGlobal(
        realmC,
        'foreignResult',
        realmD.globalObject.get('foreignResult'),
      );
      evaluateScript(
        realmC,
        `
          var called = false;
          var foreignIterator = {
            next: function () {
              if (!called) {
                called = true;
                return foreignResult;
              }
              return { value: undefined, done: true };
            }
          };
        `,
      );
      defineGlobal(
        realmB,
        'foreignIterator',
        realmC.globalObject.get('foreignIterator'),
      );
      evaluateScript(
        realmB,
        `
          var foreignIterable = {};
          foreignIterable[Symbol.iterator] = function () {
            return foreignIterator;
          };
        `,
      );
      defineGlobal(
        realmA,
        'foreignIterable',
        realmB.globalObject.get('foreignIterable'),
      );

      const completion = evaluateScript(
        realmA,
        `
          function* delegate() {
            yield* foreignIterable;
          }
          delegate().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'foreign-result');
      assertGeneratorAccountingCleared([realmA, realmB, realmC, realmD]);
    },
  },
  {
    name: 'the iterator method getter joins the active generator host chain',
    run() {
      assertIteratorProtocolGetterLinked('iterator');
    },
  },
  {
    name: 'the iterator next getter joins the active generator host chain',
    run() {
      assertIteratorProtocolGetterLinked('next');
    },
  },
  {
    name: 'the iterator done getter joins the active generator host chain',
    run() {
      assertIteratorProtocolGetterLinked('done');
    },
  },
  {
    name: 'the iterator value getter joins the active generator host chain',
    run() {
      assertIteratorProtocolGetterLinked('value');
    },
  },
  {
    name: 'foreign accessors inherit the executing generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const inspectChain = realmB.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootB = generatorHostChainRoot(realmB.agent);

          if (rootA === null || rootA !== rootB) {
            throw new Error('foreign accessor entered a distinct host chain');
          }
        },
      });

      defineGlobal(realmB, 'inspectChain', inspectChain);
      evaluateScript(
        realmB,
        `
          var foreignObject = {};
          Object.defineProperty(foreignObject, "value", {
            get: function () {
              inspectChain();
              return 42;
            }
          });
        `,
      );
      defineGlobal(
        realmA,
        'foreignObject',
        realmB.globalObject.get('foreignObject'),
      );

      const completion = evaluateScript(
        realmA,
        `
          function* readForeignAccessor() {
            return foreignObject.value;
          }
          readForeignAccessor().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 42);
      assertGeneratorAccountingCleared([realmA, realmB]);
    },
  },
  {
    name: 'foreign coercions inherit the executing generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('foreign coercion entered a distinct host chain');
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      evaluateScript(
        realmC,
        `
          function foreignCoercion() {
            inspectChain();
            return 41;
          }
        `,
      );
      defineGlobal(
        realmB,
        'foreignCoercion',
        realmC.globalObject.get('foreignCoercion'),
      );
      evaluateScript(
        realmB,
        `
          var foreignObject = {};
          foreignObject[Symbol.toPrimitive] = foreignCoercion;
        `,
      );
      defineGlobal(
        realmA,
        'foreignObject',
        realmB.globalObject.get('foreignObject'),
      );

      const completion = evaluateScript(
        realmA,
        `
          function* coerceForeignObject() {
            return foreignObject + 1;
          }
          coerceForeignObject().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 42);
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'cross-Agent ToPrimitive calls charge the executing Realm before starting a generator',
    run() {
      for (const kind of ['exotic', 'ordinary']) {
        const callerRealm = createRealm({ maxStackDepth: 80 });
        const objectRealm = createRealm({ maxStackDepth: 5000 });
        const methodRealm = createRealm({ maxStackDepth: 5000 });
        const realms = [callerRealm, objectRealm, methodRealm];
        const method = createDeepGeneratorStarter(
          methodRealm,
          `${kind}Coercion`,
        );
        const object = new EngineObject(objectRealm.intrinsics.objectPrototype);

        object.defineOwnProperty(
          kind === 'exotic'
            ? objectRealm.agent.wellKnownSymbols.toPrimitive
            : 'valueOf',
          {
            value: method,
            writable: true,
            enumerable: true,
            configurable: true,
          },
        );
        defineGlobal(callerRealm, 'foreignCoercion', method);
        defineGlobal(callerRealm, 'foreignObject', object);

        assertSame(
          evaluateScript(
            callerRealm,
            'try { foreignCoercion(); "not thrown"; } catch (error) { error.name; }',
          ).value,
          'RangeError',
          `${kind} direct-call control`,
        );
        assertGeneratorAccountingCleared(realms);
        assertSame(
          evaluateScript(
            callerRealm,
            'try { +foreignObject; "not thrown"; } catch (error) { error.name; }',
          ).value,
          'RangeError',
          `${kind} unary conversion`,
        );
        assertGeneratorAccountingCleared(realms);
      }
    },
  },
  {
    name: 'cross-Agent Date defaultValue charges the executing Realm before starting a generator',
    run() {
      const callerRealm = createRealm({ maxStackDepth: 80 });
      const objectRealm = createRealm({ maxStackDepth: 5000 });
      const methodRealm = createRealm({ maxStackDepth: 5000 });
      const realms = [callerRealm, objectRealm, methodRealm];
      const method = createDeepGeneratorStarter(methodRealm, 'dateValueOf');
      const date = /** @type {EngineObject} */ (
        evaluateScript(objectRealm, 'new Date(0)').value
      );

      date.defineOwnProperty('valueOf', {
        value: method,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(callerRealm, 'foreignValueOf', method);
      defineGlobal(callerRealm, 'foreignDate', date);

      assertSame(
        evaluateScript(
          callerRealm,
          'try { foreignValueOf(); "not thrown"; } catch (error) { error.name; }',
        ).value,
        'RangeError',
        'direct-call control',
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(
        evaluateScript(
          callerRealm,
          'try { +foreignDate; "not thrown"; } catch (error) { error.name; }',
        ).value,
        'RangeError',
        'Date defaultValue conversion',
      );
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'cross-Agent Array map getters charge the executing Realm before starting a generator',
    run() {
      const callerRealm = createRealm({ maxStackDepth: 80 });
      const objectRealm = createRealm({ maxStackDepth: 5000 });
      const accessorRealm = createRealm({ maxStackDepth: 5000 });
      const realms = [callerRealm, objectRealm, accessorRealm];
      const getter = createDeepGeneratorStarter(accessorRealm, 'indexedGet');
      const object = new EngineObject(objectRealm.intrinsics.objectPrototype);

      object.defineOwnProperty('length', {
        value: 1,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      object.defineOwnProperty('0', {
        get: getter,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(callerRealm, 'foreignArrayLike', object);

      assertSame(
        evaluateScript(
          callerRealm,
          'try { foreignArrayLike[0]; "not thrown"; } catch (error) { error.name; }',
        ).value,
        'RangeError',
        'direct-read control',
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(
        evaluateScript(
          callerRealm,
          `
            try {
              Array.prototype.map.call(foreignArrayLike, function (value) {
                return value;
              });
              "not thrown";
            } catch (error) {
              error.name;
            }
          `,
        ).value,
        'RangeError',
        'Array.prototype.map getter',
      );
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'cross-Agent Array mutator setters charge the executing Realm before starting a generator',
    run() {
      const callerRealm = createRealm({ maxStackDepth: 80 });
      const objectRealm = createRealm({ maxStackDepth: 5000 });
      const accessorRealm = createRealm({ maxStackDepth: 5000 });
      const realms = [callerRealm, objectRealm, accessorRealm];
      const setter = createDeepGeneratorStarter(accessorRealm, 'indexedSet');
      const object = new EngineObject(objectRealm.intrinsics.objectPrototype);

      object.defineOwnProperty('length', {
        value: 0,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      object.defineOwnProperty('0', {
        set: setter,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(callerRealm, 'foreignArrayLike', object);

      assertSame(
        evaluateScript(
          callerRealm,
          'try { foreignArrayLike[0] = 1; "not thrown"; } catch (error) { error.name; }',
        ).value,
        'RangeError',
        'direct-write control',
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(
        evaluateScript(
          callerRealm,
          'try { Array.prototype.push.call(foreignArrayLike, 1); "not thrown"; } catch (error) { error.name; }',
        ).value,
        'RangeError',
        'Array.prototype.push setter',
      );
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'cross-Agent Promise resolution then getters charge the executing Realm before starting a generator',
    run() {
      const callerRealm = createRealm({ maxStackDepth: 80 });
      const objectRealm = createRealm({ maxStackDepth: 5000 });
      const accessorRealm = createRealm({ maxStackDepth: 5000 });
      const realms = [callerRealm, objectRealm, accessorRealm];
      const getter = createDeepGeneratorStarter(accessorRealm, 'thenGet');
      const thenable = new EngineObject(objectRealm.intrinsics.objectPrototype);

      thenable.defineOwnProperty('then', {
        get: getter,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(callerRealm, 'foreignThenable', thenable);

      assertSame(
        evaluateScript(
          callerRealm,
          'try { foreignThenable.then; "not thrown"; } catch (error) { error.name; }',
        ).value,
        'RangeError',
        'direct-read control',
      );
      assertGeneratorAccountingCleared(realms);

      const promise =
        /** @type {import('../src/runtime/promise.js').PromiseObject} */ (
          evaluateScript(callerRealm, 'Promise.resolve(foreignThenable)').value
        );

      assertSame(promise.promiseState, 'rejected');
      assertSame(
        /** @type {EngineObject} */ (promise.promiseResult).get('name'),
        'RangeError',
      );
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'foreign call results inherit the executing generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error(
              'foreign call result entered a distinct host chain',
            );
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      evaluateScript(
        realmC,
        `
          var foreignObject = {};
          foreignObject[Symbol.toPrimitive] = function () {
            inspectChain();
            return 41;
          };
        `,
      );
      defineGlobal(
        realmB,
        'foreignObject',
        realmC.globalObject.get('foreignObject'),
      );
      evaluateScript(
        realmB,
        'function foreignFactory() { return foreignObject; }',
      );
      defineGlobal(
        realmA,
        'foreignFactory',
        realmB.globalObject.get('foreignFactory'),
      );

      const completion = evaluateScript(
        realmA,
        `
          function* coerceForeignCallResult() {
            return foreignFactory() + 1;
          }
          coerceForeignCallResult().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 42);
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'native foreign call results inherit the generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('native result entered a distinct host chain');
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      const foreignObject = /** @type {EngineObject} */ (
        evaluateScript(
          realmC,
          `
            var object = {};
            object[Symbol.toPrimitive] = function () {
              inspectChain();
              return 41;
            };
            object;
          `,
        ).value
      );
      const nativeFactory = realmB.createNativeFunction({
        name: 'nativeFactory',
        length: 0,
        call() {
          return foreignObject;
        },
      });

      defineGlobal(realmA, 'nativeFactory', nativeFactory);
      const completion = evaluateScript(
        realmA,
        `
          function* coerceNativeCallResult() {
            return nativeFactory() + 1;
          }
          coerceNativeCallResult().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 42);
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'apply array-like getters inherit the generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const lengthGetter = realmC.createNativeFunction({
        name: 'get length',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('apply getter entered a distinct host chain');
          }
          return 0;
        },
      });
      const argumentArray = new EngineObject(realmB.intrinsics.objectPrototype);

      argumentArray.defineOwnProperty('length', {
        get: lengthGetter,
        enumerable: false,
        configurable: true,
      });
      defineGlobal(realmA, 'foreignArguments', argumentArray);
      const completion = evaluateScript(
        realmA,
        `
          function target() { return 7; }
          function* applyForeignArguments() {
            return target.apply(null, foreignArguments);
          }
          applyForeignArguments().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 7);
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'bind metadata getters inherit the generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const target = /** @type {EngineObject} */ (
        evaluateScript(realmB, '(function target() { return 7; })').value
      );

      for (const [name, value] of [
        ['length', 0],
        ['name', 'target'],
      ]) {
        target.defineOwnProperty(String(name), {
          get: realmC.createNativeFunction({
            name: `get ${String(name)}`,
            length: 0,
            call() {
              const rootA = generatorHostChainRoot(realmA.agent);
              const rootC = generatorHostChainRoot(realmC.agent);

              if (rootA === null || rootA !== rootC) {
                throw new Error('bind getter entered a distinct host chain');
              }
              return value;
            },
          }),
          enumerable: false,
          configurable: true,
        });
      }

      defineGlobal(realmA, 'foreignTarget', target);
      const completion = evaluateScript(
        realmA,
        `
          function* bindForeignTarget() {
            return foreignTarget.bind(null)();
          }
          bindForeignTarget().next().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 7);
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'object resume values join a resumed generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('resume value entered a distinct host chain');
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      evaluateScript(
        realmC,
        `
          var resumeValue = {};
          resumeValue[Symbol.toPrimitive] = function () {
            inspectChain();
            return 41;
          };
        `,
      );
      evaluateScript(
        realmB,
        `
          var resumedGenerator = (function* () {
            return (yield "pause") + 1;
          }());
        `,
      );
      defineGlobal(
        realmA,
        'resumedGenerator',
        realmB.globalObject.get('resumedGenerator'),
      );
      defineGlobal(
        realmA,
        'resumeValue',
        realmC.globalObject.get('resumeValue'),
      );

      assertSame(
        evaluateScript(realmA, 'resumedGenerator.next().value;').value,
        'pause',
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
      assertSame(
        evaluateScript(realmA, 'resumedGenerator.next(resumeValue).value;')
          .value,
        42,
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'cached foreign operands rejoin after generator suspension',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('cached operand entered a distinct host chain');
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      evaluateScript(
        realmC,
        `
          var cachedOperand = {};
          cachedOperand[Symbol.toPrimitive] = function () {
            inspectChain();
            return 41;
          };
        `,
      );
      defineGlobal(
        realmA,
        'cachedOperand',
        realmC.globalObject.get('cachedOperand'),
      );
      evaluateScript(
        realmA,
        `
          function* cachedOperandGenerator() {
            return cachedOperand + (yield "pause");
          }
          var suspendedOperand = cachedOperandGenerator();
        `,
      );

      assertSame(
        evaluateScript(realmA, 'suspendedOperand.next().value;').value,
        'pause',
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
      assertSame(
        evaluateScript(realmA, 'suspendedOperand.next(1).value;').value,
        42,
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'cached computed assignment targets rejoin before PutValue',
    run() {
      assertCachedComputedTargetRelinked('assignment', false);
      assertCachedComputedTargetRelinked('assignment', true);
    },
  },
  {
    name: 'suspended computed keys rejoin their cached assignment bases',
    run() {
      assertCachedComputedTargetRelinked('computed-key', false);
      assertCachedComputedTargetRelinked('computed-key', true);
    },
  },
  {
    name: 'cached computed destructuring targets rejoin before ToPropertyKey',
    run() {
      assertCachedComputedTargetRelinked('destructuring', false);
      assertCachedComputedTargetRelinked('destructuring', true);
    },
  },
  {
    name: 'primitive property values rejoin after generator suspension',
    run() {
      const realmA = createRealm();
      const realmC = createRealm();
      const inspectChain = realmC.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error(
              'primitive property value entered a distinct host chain',
            );
          }
        },
      });

      defineGlobal(realmC, 'inspectChain', inspectChain);
      const foreignValue = /** @type {EngineObject} */ (
        evaluateScript(
          realmC,
          `
            var object = {
              valueOf: function () {
                inspectChain();
                return 41;
              }
            };
            object;
          `,
        ).value
      );

      realmA.intrinsics.stringPrototype.defineOwnProperty('foreign', {
        value: foreignValue,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      evaluateScript(
        realmA,
        `
          function* primitivePropertyGenerator() {
            return +("x"[yield "pause"]);
          }
          var suspendedPrimitiveProperty = primitivePropertyGenerator();
        `,
      );

      assertSame(
        evaluateScript(realmA, 'suspendedPrimitiveProperty.next().value;')
          .value,
        'pause',
      );
      assertGeneratorAccountingCleared([realmA, realmC]);
      assertSame(
        evaluateScript(
          realmA,
          'suspendedPrimitiveProperty.next("foreign").value;',
        ).value,
        41,
      );
      assertGeneratorAccountingCleared([realmA, realmC]);
    },
  },
  {
    name: 'suspended with getters rejoin the generator host chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const getter = realmC.createNativeFunction({
        name: 'get value',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('with getter entered a distinct host chain');
          }
          return 9;
        },
      });
      const scope = new EngineObject(realmB.intrinsics.objectPrototype);

      scope.defineOwnProperty('value', {
        get: getter,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(realmA, 'foreignScope', scope);
      evaluateScript(
        realmA,
        `
          function* withGenerator() {
            with (foreignScope) {
              yield "pause";
              return value;
            }
          }
          var suspendedWith = withGenerator();
        `,
      );

      assertSame(
        evaluateScript(realmA, 'suspendedWith.next().value;').value,
        'pause',
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
      assertSame(
        evaluateScript(realmA, 'suspendedWith.next().value;').value,
        9,
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'suspended with identifier writes rejoin the foreign setter chain',
    run() {
      const realmA = createRealm({ maxStackDepth: 120 });
      const realmB = createRealm({ maxStackDepth: 70 });
      const realmC = createRealm({ maxStackDepth: 90 });
      const realms = [realmA, realmB, realmC];
      let setterCalls = 0;
      let setterLinked = false;
      const setter = realmC.createNativeFunction({
        name: 'set value',
        length: 1,
        call() {
          setterCalls += 1;
          const roots = realms.map((realm) =>
            generatorHostChainRoot(realm.agent),
          );

          setterLinked =
            roots[0] !== null &&
            roots.every((root) => root === roots[0]) &&
            roots[0].maxDepth === 90;
        },
      });
      const scope = new EngineObject(realmB.intrinsics.objectPrototype);

      scope.defineOwnProperty('value', {
        set: setter,
        enumerable: true,
        configurable: true,
      });
      defineGlobal(realmA, 'foreignScope', scope);
      evaluateScript(
        realmA,
        `
          function* withSetterGenerator() {
            with (foreignScope) {
              yield "pause";
              value = 9;
            }
            return "done";
          }
          var suspendedWithSetter = withSetterGenerator();
        `,
      );

      assertSame(
        evaluateScript(realmA, 'suspendedWithSetter.next().value;').value,
        'pause',
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(
        evaluateScript(realmA, 'suspendedWithSetter.next().value;').value,
        'done',
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(setterCalls, 1);
      assertSame(
        setterLinked,
        true,
        'with setter must share the resumed generator chain',
      );
    },
  },
  {
    name: 'cached runtime super reads relink targets after generator suspension',
    run() {
      const realmA = createRealm({ maxStackDepth: 120 });
      const realmB = createRealm({ maxStackDepth: 80 });
      const realmC = createRealm({ maxStackDepth: 100 });
      const realmD = createRealm({ maxStackDepth: 70 });
      const realms = [realmA, realmB, realmC, realmD];
      let lookupCalls = 0;
      let lookupLinked = false;
      let getterCalls = 0;
      let getterLinked = false;

      class InspectingSuperBase extends EngineObject {
        /**
         * @param {string | symbol} name
         * @param {unknown} receiver
         * @returns {unknown}
         */
        get(name, receiver) {
          lookupCalls += 1;
          const roots = [realmA, realmB, realmD].map((realm) =>
            generatorHostChainRoot(realm.agent),
          );

          lookupLinked =
            roots[0] !== null &&
            roots.every((root) => root === roots[0]) &&
            roots[0].maxDepth === 120;
          return super.get(name, receiver);
        }
      }

      const getter = realmC.createNativeFunction({
        name: 'get value',
        length: 0,
        call() {
          getterCalls += 1;
          const roots = realms.map((realm) =>
            generatorHostChainRoot(realm.agent),
          );

          getterLinked =
            roots[0] !== null &&
            roots.every((root) => root === roots[0]) &&
            roots[0].maxDepth === 100;
          return 7;
        },
      });
      const superBase = new InspectingSuperBase(
        realmB.intrinsics.objectPrototype,
      );
      const receiver = new EngineObject(realmD.intrinsics.objectPrototype);

      superBase.defineOwnProperty('value', {
        get: getter,
        enumerable: true,
        configurable: true,
      });

      const cachedReference = new Reference(
        new SuperReferenceBase(superBase, receiver),
        'value',
        false,
        receiver,
      );
      const readCachedSuper = realmA.createNativeFunction({
        name: 'readCachedSuper',
        length: 0,
        call(_thisValue, _args, _functionObject, callerRealm) {
          return getValue(cachedReference, callerRealm ?? realmA);
        },
      });

      defineGlobal(realmA, 'readCachedSuper', readCachedSuper);
      evaluateScript(
        realmA,
        `
          function* cachedSuperReadGenerator() {
            yield "pause";
            return readCachedSuper();
          }
          var suspendedSuperRead = cachedSuperReadGenerator();
        `,
      );

      assertSame(
        evaluateScript(realmA, 'suspendedSuperRead.next().value;').value,
        'pause',
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(
        evaluateScript(realmA, 'suspendedSuperRead.next().value;').value,
        7,
      );
      assertGeneratorAccountingCleared(realms);
      assertSame(lookupCalls, 1);
      assertSame(getterCalls, 1);
      assertSame(
        lookupLinked,
        true,
        'super base and receiver must link before descriptor lookup',
      );
      assertSame(
        getterLinked,
        true,
        'super getter must share the cached reference chain',
      );
    },
  },
  {
    name: 'generator super getters inherit the executing Realm chain',
    run() {
      const realmA = createRealm();
      const realmB = createRealm();
      const realmC = createRealm();
      const getter = realmC.createNativeFunction({
        name: 'get value',
        length: 0,
        call() {
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootC = generatorHostChainRoot(realmC.agent);

          if (rootA === null || rootA !== rootC) {
            throw new Error('super getter entered a distinct host chain');
          }
          return 7;
        },
      });
      const superPrototype = new EngineObject(
        realmB.intrinsics.objectPrototype,
      );

      superPrototype.defineOwnProperty('value', {
        get: getter,
        enumerable: true,
        configurable: true,
      });
      evaluateScript(
        realmA,
        'var generatorHolder = { *method() { return super.value; } };',
      );
      const holder = /** @type {EngineObject} */ (
        realmA.globalObject.get('generatorHolder')
      );

      assertSame(holder.setPrototypeOf(superPrototype), true);
      assertSame(
        evaluateScript(realmA, 'generatorHolder.method().next().value;').value,
        7,
      );
      assertGeneratorAccountingCleared([realmA, realmB, realmC]);
    },
  },
  {
    name: 'bound generator method wrappers join the initial host chain',
    run() {
      const realmA = createRealm({ maxStackDepth: 90 });
      const realmB = createRealm({ maxStackDepth: 200 });
      const realmC = createRealm({ maxStackDepth: 120 });
      const realmD = createRealm({ maxStackDepth: 70 });
      const realms = [realmA, realmB, realmC, realmD];
      const inspectChain = realmB.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const roots = realms.map((realm) =>
            generatorHostChainRoot(realm.agent),
          );

          if (
            roots[0] === null ||
            roots.some((root) => root !== roots[0]) ||
            roots[0].maxDepth !== 70
          ) {
            throw new Error('bound generator wrapper was not linked');
          }
        },
      });

      defineGlobal(realmB, 'inspectChain', inspectChain);
      evaluateScript(
        realmB,
        `
          var boundTarget = (function* () {
            inspectChain();
            return "done";
          }());
        `,
      );
      defineGlobal(
        realmA,
        'foreignGenerator',
        realmB.globalObject.get('boundTarget'),
      );
      defineGlobal(
        realmA,
        'foreignNext',
        evaluateScript(realmC, '(function* () {})().next').value,
      );
      defineGlobal(
        realmA,
        'foreignBind',
        evaluateScript(realmD, '(function () {}).bind').value,
      );

      const completion = evaluateScript(
        realmA,
        `
          var boundNext = foreignBind.call(foreignNext, foreignGenerator);
          boundNext().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'done');
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'bound call wrappers join the initial generator host chain',
    run() {
      const realmA = createRealm({ maxStackDepth: 90 });
      const realmB = createRealm({ maxStackDepth: 200 });
      const realmC = createRealm({ maxStackDepth: 120 });
      const realmD = createRealm({ maxStackDepth: 70 });
      const realms = [realmA, realmB, realmC, realmD];
      const inspectChain = realmB.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const roots = realms.map((realm) =>
            generatorHostChainRoot(realm.agent),
          );

          if (
            roots[0] === null ||
            roots.some((root) => root !== roots[0]) ||
            roots[0].maxDepth !== 70
          ) {
            throw new Error('bound call wrapper was not linked');
          }
        },
      });

      defineGlobal(realmB, 'inspectChain', inspectChain);
      evaluateScript(
        realmB,
        `
          var callBoundTarget = (function* () {
            inspectChain();
            return "done";
          }());
        `,
      );
      defineGlobal(
        realmA,
        'foreignGenerator',
        realmB.globalObject.get('callBoundTarget'),
      );
      defineGlobal(
        realmA,
        'foreignNext',
        evaluateScript(realmB, '(function* () {})().next').value,
      );
      defineGlobal(
        realmA,
        'foreignCall',
        evaluateScript(realmC, '(function () {}).call').value,
      );
      defineGlobal(
        realmA,
        'foreignBind',
        evaluateScript(realmD, '(function () {}).bind').value,
      );

      const completion = evaluateScript(
        realmA,
        `
          var boundCall = foreignBind.call(
            foreignCall,
            foreignNext,
            foreignGenerator
          );
          boundCall().value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'done');
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'nested call and apply wrappers join the initial generator chain',
    run() {
      const realmA = createRealm({ maxStackDepth: 90 });
      const realmB = createRealm({ maxStackDepth: 200 });
      const realmC = createRealm({ maxStackDepth: 120 });
      const realmD = createRealm({ maxStackDepth: 70 });
      const realms = [realmA, realmB, realmC, realmD];
      const inspectChain = realmB.createNativeFunction({
        name: 'inspectChain',
        length: 0,
        call() {
          const roots = realms.map((realm) =>
            generatorHostChainRoot(realm.agent),
          );

          if (
            roots[0] === null ||
            roots.some((root) => root !== roots[0]) ||
            roots[0].maxDepth !== 70
          ) {
            throw new Error('nested call/apply wrappers were not linked');
          }
        },
      });

      defineGlobal(realmB, 'inspectChain', inspectChain);
      evaluateScript(
        realmB,
        `
          var nestedWrapperTarget = (function* () {
            inspectChain();
            return "done";
          }());
        `,
      );
      defineGlobal(
        realmA,
        'foreignGenerator',
        realmB.globalObject.get('nestedWrapperTarget'),
      );
      defineGlobal(
        realmA,
        'foreignNext',
        evaluateScript(realmB, '(function* () {})().next').value,
      );
      defineGlobal(
        realmA,
        'foreignCall',
        evaluateScript(realmC, '(function () {}).call').value,
      );
      defineGlobal(
        realmA,
        'foreignApply',
        evaluateScript(realmD, '(function () {}).apply').value,
      );

      const completion = evaluateScript(
        realmA,
        `
          foreignApply.call(
            foreignCall,
            foreignNext,
            [foreignGenerator]
          ).value;
        `,
      );

      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'done');
      assertGeneratorAccountingCleared(realms);
    },
  },
  {
    name: 'independently active Agent chains merge before mutual delegation',
    run() {
      for (const [maxDepthA, maxDepthB] of [
        [80, 240],
        [240, 80],
      ]) {
        const { realmA, realmB } = createMutuallyDelegatingRealms(
          /** @type {number} */ (maxDepthA),
          /** @type {number} */ (maxDepthB),
          false,
        );

        realmA.agent.enterGeneratorHostChain(maxDepthA);
        realmB.agent.enterGeneratorHostChain(maxDepthB);

        try {
          const completion = evaluateScript(
            realmA,
            'try { fromA().next(); "not thrown"; } catch (error) { error; }',
          );
          const rootA = generatorHostChainRoot(realmA.agent);
          const rootB = generatorHostChainRoot(realmB.agent);

          assertRealmRangeError(completion, [realmA, realmB]);
          assertSame(rootA !== null, true);
          assertSame(rootA, rootB);
          assertSame(rootA.resumes, 2);
          assertSame(rootA.references, 0);
          assertSame(rootA.depth, 0);
          assertSame(rootA.maxDepth, Math.min(maxDepthA, maxDepthB));
        } finally {
          realmB.agent.exitGeneratorHostChain();
          realmA.agent.exitGeneratorHostChain();
        }

        assertGeneratorAccountingCleared([realmA, realmB]);
        assertFiniteGeneratorResume(realmA, `collision-A-${maxDepthA}`);
        assertFiniteGeneratorResume(realmB, `collision-B-${maxDepthB}`);
        assertGeneratorAccountingCleared([realmA, realmB]);
      }
    },
  },
  {
    name: 'an over-budget chain merge remains unwindable after link throws',
    run() {
      const agentA = createAgent();
      const agentB = createAgent();
      const resumeA = agentA.enterGeneratorHostChain(5);
      const resumeB = agentB.enterGeneratorHostChain(5);
      const framesA = [];
      const framesB = [];

      for (let index = 0; index < 3; index += 1) {
        framesA.push(agentA.enterGeneratorHostFrame(5));
        framesB.push(agentB.enterGeneratorHostFrame(5));
      }

      try {
        const error = /** @type {GuestErrorSignal} */ (
          assertThrows(
            () => agentA.linkGeneratorHostChain(agentB),
            GuestErrorSignal,
          )
        );
        const root = generatorHostChainRoot(agentA);

        assertSame(error.typeName, 'RangeError');
        assertSame(root, generatorHostChainRoot(agentB));
        assertSame(root.resumes, 2);
        assertSame(root.references, 0);
        assertSame(root.depth, 6);
        assertSame(root.maxDepth, 5);
      } finally {
        while (framesB.length > 0) {
          agentB.exitGeneratorHostFrame(
            /** @type {import('../src/runtime/agent.js').GeneratorHostChain} */ (
              framesB.pop()
            ),
          );
        }
        while (framesA.length > 0) {
          agentA.exitGeneratorHostFrame(
            /** @type {import('../src/runtime/agent.js').GeneratorHostChain} */ (
              framesA.pop()
            ),
          );
        }
        agentB.exitGeneratorHostChain(resumeB);
        agentA.exitGeneratorHostChain(resumeA);
      }

      assertSame(agentA._generatorHostChain, null);
      assertSame(agentB._generatorHostChain, null);
    },
  },
  {
    name: 'merged Agent chains unwind on yield completion and abrupt delegation',
    run() {
      const realmA = createRealm({ maxStackDepth: 100 });
      const realmB = createRealm({ maxStackDepth: 160 });

      evaluateScript(
        realmA,
        `
          function* yieldingOuter() {
            yield* yieldingInner();
            return "complete";
          }
          function* throwingOuter() {
            yield* throwingInner();
          }
        `,
      );
      evaluateScript(
        realmB,
        `
          function* yieldingInner() { yield "yielded"; }
          function* throwingInner() { throw new Error("abrupt"); }
        `,
      );
      defineGlobal(
        realmA,
        'yieldingInner',
        realmB.globalObject.get('yieldingInner'),
      );
      defineGlobal(
        realmA,
        'throwingInner',
        realmB.globalObject.get('throwingInner'),
      );

      realmA.agent.enterGeneratorHostChain(100);
      realmB.agent.enterGeneratorHostChain(160);

      try {
        const yielded = evaluateScript(
          realmA,
          `
            var linkedIterator = yieldingOuter();
            var linkedYield = linkedIterator.next();
            [linkedYield.value, linkedYield.done].join("|");
          `,
        );
        const root = generatorHostChainRoot(realmA.agent);

        assertSame(yielded.type, 'normal');
        assertSame(yielded.value, 'yielded|false');
        assertSame(root, generatorHostChainRoot(realmB.agent));
        assertSame(root.resumes, 2);
        assertSame(root.references, 0);
        assertSame(root.depth, 0);
      } finally {
        realmB.agent.exitGeneratorHostChain();
        realmA.agent.exitGeneratorHostChain();
      }

      assertGeneratorAccountingCleared([realmA, realmB]);
      const completed = evaluateScript(
        realmA,
        `
          var linkedComplete = linkedIterator.next();
          [linkedComplete.value, linkedComplete.done].join("|");
        `,
      );
      assertSame(completed.type, 'normal');
      assertSame(completed.value, 'complete|true');
      assertGeneratorAccountingCleared([realmA, realmB]);

      realmA.agent.enterGeneratorHostChain(100);
      realmB.agent.enterGeneratorHostChain(160);

      try {
        const abrupt = evaluateScript(
          realmA,
          `
            try {
              throwingOuter().next();
              "not thrown";
            } catch (error) {
              error.message;
            }
          `,
        );
        const root = generatorHostChainRoot(realmA.agent);

        assertSame(abrupt.type, 'normal');
        assertSame(abrupt.value, 'abrupt');
        assertSame(root, generatorHostChainRoot(realmB.agent));
        assertSame(root.resumes, 2);
        assertSame(root.references, 0);
        assertSame(root.depth, 0);
      } finally {
        realmB.agent.exitGeneratorHostChain();
        realmA.agent.exitGeneratorHostChain();
      }

      assertGeneratorAccountingCleared([realmA, realmB]);
    },
  },
  {
    name: 'finite cross-Realm yield delegation preserves shared and separate Agent behavior',
    run() {
      const sharedAgent = createAgent();
      const sharedCaller = createRealm({ agent: sharedAgent });
      const sharedOwner = createRealm({ agent: sharedAgent });
      const isolatedCaller = createRealm();
      const isolatedOwner = createRealm();

      evaluateScript(
        sharedOwner,
        'function* sharedValues() { yield "shared"; }',
      );
      defineGlobal(
        sharedCaller,
        'foreignValues',
        sharedOwner.globalObject.get('sharedValues'),
      );
      assertSame(
        evaluateScript(
          sharedCaller,
          'function* values() { yield* foreignValues(); } values().next().value;',
        ).value,
        'shared',
      );

      evaluateScript(
        isolatedOwner,
        'function* isolatedValues() { yield "isolated"; }',
      );
      defineGlobal(
        isolatedCaller,
        'foreignValues',
        isolatedOwner.globalObject.get('isolatedValues'),
      );
      assertSame(
        evaluateScript(
          isolatedCaller,
          'function* values() { yield* foreignValues(); } values().next().value;',
        ).value,
        'isolated',
      );
    },
  },
  {
    name: 'recursion through nested data is contained, not left to the host stack',
    run() {
      // `String(a)` on a self-nesting array recurses through
      // Array.prototype.toString/join, one built-in activation per level. It
      // is the shape that spends the most host stack per unit of budget, so it
      // is what sets the default; on the raw host stack it overflowed
      // uncatchably.
      assertSame(
        run(
          'var a = []; var c = a;' +
            ' for (var i = 0; i < 1000; i++) { var x = []; c[0] = x; c = x; }' +
            ' try { String(a); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'a recursive body of nested expressions is contained on every host',
    run() {
      // A call costs more host stack the deeper it sits in an expression,
      // because the evaluator walks the expression tree recursively. These
      // shapes each escaped as an uncatchable host `RangeError` under a budget
      // that counted only activations.
      let nested = 'f(n - 1)';

      for (let level = 20; level >= 1; level -= 1) {
        nested = `(${level} + ${nested})`;
      }

      assertSame(
        run(
          `function f(n) { return n === 0 ? 0 : ${nested}; }` +
            ' try { f(100000); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'call nested twenty levels deep in an expression',
      );
      assertSame(
        run(
          'function f() { return !!!!!!!!!!f(); }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'call under a chain of unary operators',
      );
      assertSame(
        run(
          'function f() { return [[[[[f()]]]]][0][0][0][0][0]; }' +
            ' try { f(); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'call inside nested array literals',
      );
    },
  },
  {
    name: 'deeply nested statements around a recursive call are contained',
    run() {
      const open = '{ if (true) '.repeat(20);
      const close = '}'.repeat(20);

      assertSame(
        run(
          `function f() ${open} return f(); ${close}` +
            ' try { f(); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'nesting alone charges the budget, with no expression in sight',
    run() {
      // `{ if (true) ` also evaluates a test expression each time round, so it
      // cannot tell the statement guard apart from the expression one. Bare
      // blocks evaluate nothing at all: if only expressions were counted, the
      // wrapped body would reach exactly the same depth as the plain one.
      const depth = (/** @type {string} */ body) =>
        /** @type {number} */ (
          run(
            'var depth = 0;' +
              ` function f() { depth = depth + 1; ${body} }` +
              ' try { f(); } catch (e) {} depth',
            SMALL,
          )
        );

      const plain = depth('return f();');
      const wrapped = depth(`${'{'.repeat(20)} return f(); ${'}'.repeat(20)}`);

      assertSame(
        wrapped < plain,
        true,
        `expected bare blocks to cost budget, got ${plain} plain then ${wrapped} wrapped`,
      );
    },
  },
  {
    name: 'JSON.stringify on deeply nested runtime data is contained',
    run() {
      assertSame(
        run(
          'var a = []; var c = a;' +
            ' for (var i = 0; i < 20000; i++) { var x = []; c[0] = x; c = x; }' +
            ' try { JSON.stringify(a); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: 'JSON.parse on deeply nested runtime text is contained',
    run() {
      assertSame(
        run(
          'var s = ""; for (var i = 0; i < 20000; i++) { s += "["; }' +
            ' s += "1"; for (var j = 0; j < 20000; j++) { s += "]"; }' +
            ' try { JSON.parse(s); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
      );
    },
  },
  {
    name: '50,000-link Get HasProperty and Set stay iterative and dispatch a middle exotic once',
    run() {
      const root = new EngineObject();
      root.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      let ordinaryTop = root;
      for (let index = 0; index < 50000; index += 1) {
        ordinaryTop = new EngineObject(ordinaryTop);
      }

      assertSame(ordinaryTop.get('value', ordinaryTop), 1);
      assertSame(ordinaryTop.hasProperty('value'), true);
      assertSame(ordinaryTop.set('value', 2, ordinaryTop), true);
      assertSame(ordinaryTop.get('value', ordinaryTop), 2);
      assertSame(
        root.setPrototypeOf(ordinaryTop),
        false,
        'a 50,000-link prototype cycle is rejected without recursion',
      );

      let getCalls = 0;
      let hasPropertyCalls = 0;
      let setCalls = 0;
      class RecordingMiddle extends EngineObject {
        /**
         * @param {string | symbol} key
         * @param {unknown} receiver
         * @returns {unknown}
         */
        get(key, receiver) {
          getCalls += 1;
          return super.get(key, receiver);
        }

        /**
         * @param {string | symbol} key
         * @returns {boolean}
         */
        hasProperty(key) {
          hasPropertyCalls += 1;
          return super.hasProperty(key);
        }

        /**
         * @param {string | symbol} key
         * @param {unknown} value
         * @param {unknown} receiver
         * @returns {boolean}
         */
        set(key, value, receiver) {
          setCalls += 1;
          return super.set(key, value, receiver);
        }
      }

      const exoticRoot = new EngineObject();
      exoticRoot.defineOwnProperty('value', {
        value: 3,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      let exoticBase = exoticRoot;
      for (let index = 0; index < 25000; index += 1) {
        exoticBase = new EngineObject(exoticBase);
      }
      const middle = new RecordingMiddle(exoticBase);
      let exoticTop = middle;
      for (let index = 0; index < 25000; index += 1) {
        exoticTop = new EngineObject(exoticTop);
      }

      assertSame(exoticTop.get('value', exoticTop), 3);
      assertSame(getCalls, 1);
      assertSame(exoticTop.hasProperty('value'), true);
      assertSame(hasPropertyCalls, 1);
      assertSame(exoticTop.set('value', 4, exoticTop), true);
      assertSame(setCalls, 1);
      assertSame(exoticTop.get('value', exoticTop), 4);
    },
  },
  {
    name: '50,000-link Enumerate stays iterative and dispatches a middle exotic once',
    run() {
      const realm = createRealm();
      const root = new EngineObject(realm.intrinsics.objectPrototype);
      root.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      let ownPropertyKeysCalls = 0;
      let getOwnPropertyCalls = 0;
      let getPrototypeOfCalls = 0;
      class RecordingMiddle extends EngineObject {
        ownPropertyKeys() {
          ownPropertyKeysCalls += 1;
          return super.ownPropertyKeys();
        }

        /**
         * @param {import('../src/runtime/descriptors.js').PropertyKey} key
         */
        getOwnProperty(key) {
          getOwnPropertyCalls += 1;
          return super.getOwnProperty(key);
        }

        getPrototypeOf() {
          getPrototypeOfCalls += 1;
          return super.getPrototypeOf();
        }
      }

      let lower = root;
      for (let index = 0; index < 25000; index += 1) {
        lower = new EngineObject(lower);
      }
      const middle = new RecordingMiddle(lower);
      let top = middle;
      for (let index = 0; index < 24999; index += 1) {
        top = new EngineObject(top);
      }

      const iterator = realm.agent.withActiveExecutionRealm(realm, () =>
        top.enumerate(),
      );
      const next =
        /** @type {import('../src/runtime/descriptors.js').CallableLike} */ (
          iterator.get('next', iterator)
        );
      const first = /** @type {EngineObject} */ (
        next.callFunction(iterator, [], realm)
      );

      assertSame(first.get('value', first), 'value');
      assertSame(first.get('done', first), false);
      assertSame(ownPropertyKeysCalls, 1);
      assertSame(getOwnPropertyCalls, 1);
      assertSame(getPrototypeOfCalls, 2);

      const done = /** @type {EngineObject} */ (
        next.callFunction(iterator, [], realm)
      );
      assertSame(done.get('done', done), true);
    },
  },
  {
    name: 'synchronous for-in consumes a 50,000-link Enumerate iterator with one exotic middle iteratively',
    run() {
      const realm = createRealm();
      const root = new EngineObject(realm.intrinsics.objectPrototype);
      root.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      let ownPropertyKeysCalls = 0;
      let getOwnPropertyCalls = 0;
      let getPrototypeOfCalls = 0;
      class RecordingMiddle extends EngineObject {
        ownPropertyKeys() {
          ownPropertyKeysCalls += 1;
          return super.ownPropertyKeys();
        }

        /**
         * @param {import('../src/runtime/descriptors.js').PropertyKey} key
         */
        getOwnProperty(key) {
          getOwnPropertyCalls += 1;
          return super.getOwnProperty(key);
        }

        getPrototypeOf() {
          getPrototypeOfCalls += 1;
          return super.getPrototypeOf();
        }
      }

      let lower = root;
      for (let index = 0; index < 25000; index += 1) {
        lower = new EngineObject(lower);
      }
      const middle = new RecordingMiddle(lower);
      let source = middle;
      for (let index = 0; index < 24999; index += 1) {
        source = new EngineObject(source);
      }
      defineGlobal(realm, 'source', source);

      const completion = evaluateScript(
        realm,
        'var key; for (key in source) { break; } key;',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'value');
      assertSame(ownPropertyKeysCalls, 1);
      assertSame(getOwnPropertyCalls, 1);
      assertSame(getPrototypeOfCalls, 2);
    },
  },
  {
    name: 'generator for-in consumes a 50,000-link Enumerate iterator with one exotic middle iteratively',
    run() {
      const realm = createRealm();
      const root = new EngineObject(realm.intrinsics.objectPrototype);
      root.defineOwnProperty('value', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      let ownPropertyKeysCalls = 0;
      let getOwnPropertyCalls = 0;
      let getPrototypeOfCalls = 0;
      class RecordingMiddle extends EngineObject {
        ownPropertyKeys() {
          ownPropertyKeysCalls += 1;
          return super.ownPropertyKeys();
        }

        /**
         * @param {import('../src/runtime/descriptors.js').PropertyKey} key
         */
        getOwnProperty(key) {
          getOwnPropertyCalls += 1;
          return super.getOwnProperty(key);
        }

        getPrototypeOf() {
          getPrototypeOfCalls += 1;
          return super.getPrototypeOf();
        }
      }

      let lower = root;
      for (let index = 0; index < 25000; index += 1) {
        lower = new EngineObject(lower);
      }
      const middle = new RecordingMiddle(lower);
      let source = middle;
      for (let index = 0; index < 24999; index += 1) {
        source = new EngineObject(source);
      }
      defineGlobal(realm, 'source', source);

      const completion = evaluateScript(
        realm,
        'function* values() { for (var key in source) { yield key; } } ' +
          'var iterator = values(); var first = iterator.next(); var closed = iterator.return(); ' +
          '[first.value, first.done, closed.done].join("|");',
      );
      assertSame(completion.type, 'normal');
      assertSame(completion.value, 'value|false|true');
      assertSame(ownPropertyKeysCalls, 1);
      assertSame(getOwnPropertyCalls, 1);
      assertSame(getPrototypeOfCalls, 2);
    },
  },
  {
    name: 'a prototype chain built at runtime is walked without host recursion',
    run() {
      // Property lookup follows the prototype chain, and guest code can make
      // that chain as long as it likes at runtime. Walking it recursively put
      // a host frame on the stack per link, so a long enough chain reached a
      // host overflow through an ordinary property read. The walk is iterative
      // instead: chain length is not recursion and does not spend the budget.
      assertSame(
        run(
          'var o = {}; for (var i = 0; i < 50000; i++) { o = Object.create(o); }' +
            ' o.missing === undefined && ("missing" in o) === false && ' +
            '(o.created = 1) === 1 && o.created === 1',
        ),
        true,
      );
    },
  },
  {
    name: 'a bound-function chain built at runtime is unwrapped without host recursion',
    run() {
      // `instanceof` on a bound function delegates to its target's
      // [[HasInstance]] (ES5.1 15.3.4.5.3), and guest code can bind a function
      // to itself as many times as it likes at runtime. Delegating recursively
      // spent a host frame per link; the chain is unwrapped iteratively.
      assertSame(
        run(
          'function F() {} var g = F;' +
            ' for (var i = 0; i < 20000; i++) { g = g.bind(null); }' +
            ' var instance = new F(); instance instanceof g',
        ),
        true,
      );
    },
  },
  {
    name: 'deeply nested source reached through eval is contained as a guest error',
    run() {
      // Source nesting is the one recursion the guard cannot count, because it
      // is spent before evaluation begins — in the parser, and in the
      // declaration-instantiation walk. Guest code can only reach those
      // through `eval` and `Function`, which already run inside the budget, so
      // what a guest sees is a catchable error either way. Which error it is
      // depends on how much host stack the host has left, so this pins the
      // containment rather than the name.
      const source =
        'var s = "var x = 1;";' +
        ' for (var i = 0; i < 4000; i++) { s = "{" + s + "}"; }' +
        ' try { eval(s); "not thrown" } catch (e) { e instanceof Error }';

      assertSame(run(source), true, 'eval');
      assertSame(
        run(source.replace('eval(s)', 'Function(s)()')),
        true,
        'Function',
      );
    },
  },
  {
    name: 'a deeply nested RegExp pattern is contained, not left to the host stack',
    run() {
      // The pattern validator is recursive descent over the *pattern string*,
      // which is guest data: nesting it deeply spent host frames with nothing
      // counting them, and escaped as an uncatchable host RangeError from
      // every entry point into the parser.
      const build =
        'var p = new Array(20001).join("(") + "a" + new Array(20001).join(")");';

      assertSame(
        run(
          `${build} try { new RegExp(p); "not thrown" } catch (e) { e.name }`,
        ),
        'RangeError',
        'new RegExp',
      );
      assertSame(
        run(`${build} try { RegExp(p); "not thrown" } catch (e) { e.name }`),
        'RangeError',
        'RegExp as a function',
      );
      assertSame(
        run(
          `${build} try { "a".replace(new RegExp(p), "x"); "not thrown" }` +
            ' catch (e) { e.name }',
        ),
        'RangeError',
        'String.prototype.replace',
      );
      assertSame(
        run(
          'var p = new Array(20001).join("(?:") + "a" + new Array(20001).join(")");' +
            ' try { new RegExp(p); "not thrown" } catch (e) { e.name }',
        ),
        'RangeError',
        'non-capturing groups',
      );
    },
  },
  {
    name: 'a deeply nested regular expression *literal* is contained too',
    run() {
      // A literal's pattern never reaches our validator: Acorn checks it while
      // tokenizing. Acorn converts its own parse recursion into a SyntaxError,
      // but the very first token is read by `nextToken()` *outside* that
      // conversion, so a leading regex literal escaped as a host RangeError.
      const build =
        'var p = new Array(20001).join("(") + "a" + new Array(20001).join(")");';

      assertSame(
        run(
          `${build} try { eval("/" + p + "/"); "not thrown" } catch (e) { e.name }`,
        ),
        'SyntaxError',
        'eval of a leading regex literal',
      );
      assertSame(
        run(
          `${build} try { Function("return /" + p + "/"); "not thrown" }` +
            ' catch (e) { e.name }',
        ),
        'SyntaxError',
        'dynamic Function whose body holds one',
      );

      // The same source given straight to the embedder is a parse failure, and
      // parse failures leave `evaluateScript` as host errors by design. It must
      // still be the *syntax* error, not a stack overflow leaking through.
      const pattern = `${'('.repeat(20000)}a${')'.repeat(20000)}`;
      let hostError;
      try {
        evaluateScript(createRealm(), `/${pattern}/`);
      } catch (error) {
        hostError = error;
      }
      assertSame(
        hostError instanceof SyntaxError,
        true,
        'a top-level script reports a syntax error, not a host RangeError',
      );
    },
  },
  {
    name: 'hoisting walks a program iteratively, at any depth the parser admits',
    run() {
      // Parsing and hoisting both happen before the budget can count anything.
      // The parser reports running out of stack as a failure to parse, but the
      // hoisting walks that follow it must not run out at all: a program the
      // parser has already accepted would otherwise overflow on the way to
      // being evaluated, and the embedder would get a host RangeError for a
      // script that is perfectly well formed.
      //
      // The depth at which the parser gives up moves with how warm the host
      // has made it, so the source form cannot pin this. Handing the engine a
      // program directly does: `evaluateScript` forwards parser options, so a
      // `parse` hook returning a synthetic AST reaches the hoisting walks with
      // the parser out of the way.
      const nest = (/** @type {number} */ depth) => {
        /** @type {any} */
        let statement = {
          type: 'VariableDeclaration',
          kind: 'var',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: { type: 'Identifier', name: 'q' },
              init: null,
            },
          ],
        };

        for (let level = 0; level < depth; level += 1) {
          statement = {
            type: 'IfStatement',
            test: { type: 'Literal', value: 1 },
            consequent: statement,
            alternate: null,
          };
        }

        return {
          type: 'Program',
          sourceType: 'script',
          body: [statement],
        };
      };

      // Two orders of magnitude past any host's stack, so this cannot pass by
      // the host happening to have room.
      const program = nest(1000000);
      const realm = createRealm();

      assertSame(
        evaluateScript(realm, '', { parse: () => program }).type,
        'throw',
        'a program this deep exhausts the budget while being evaluated',
      );
      assertSame(
        // `this.q === undefined` would hold whether or not hoisting ran, since
        // reading a missing property yields `undefined` too. `in` is what
        // distinguishes a hoisted binding from an absent one.
        evaluateScript(realm, '"q" in this').value,
        true,
        'and hoisting still reached the declaration it was walking towards',
      );
    },
  },
  {
    name: 'hoisting walks a program with a very wide statement list too',
    run() {
      // Depth is not the only way a walk can outgrow the host. Handing an
      // array to a variadic call spreads it as *arguments*, and V8 caps those
      // at around 120,000 — an argument-count limit, not a stack-depth one,
      // which a depth-only contract cannot see. Getting the walk off the host
      // stack has to mean getting it off host limits generally, or the failure
      // has merely moved from deep programs to wide ones.
      const wide = (/** @type {number} */ width) => {
        /** @type {any[]} */
        const body = [];

        for (let index = 0; index < width; index += 1) {
          body.push({
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: `q${index}` },
                init: null,
              },
            ],
          });
        }

        return {
          type: 'Program',
          sourceType: 'script',
          body: [{ type: 'BlockStatement', body }],
        };
      };

      // Twice V8's argument cap, so this cannot pass by sitting under it.
      const realm = createRealm();
      evaluateScript(realm, '', { parse: () => wide(250000) });

      assertSame(
        evaluateScript(realm, '"q249999" in this').value,
        true,
        'every declaration in the list was still hoisted',
      );

      // And the same width reached the way guest code reaches it.
      assertSame(
        run(
          'var s = "{"; for (var i = 0; i < 200000; i++) { s += "var v" + i + ";"; }' +
            ' s += "}"; try { eval(s); "hoisted" } catch (e) { "guest " + e.name }',
        ),
        'hoisted',
        'through a guest eval',
      );
    },
  },
  {
    name: 'a deeply nested body reached at depth stays catchable, however it was compiled',
    run() {
      // The two recursions compose: guest calls spend host stack, and so does
      // the nesting inside the body those calls arrive at. Either alone is
      // contained; the contract is that reaching a deep body *from* a deep
      // call is contained too, and equally through each way a body can be
      // compiled — parsed with the program, or built at depth by `eval` and
      // `Function`, which hoist their own source at the depth they run at.
      //
      // Sized against the budget rather than against the host. Reaching for a
      // shape big enough to exhaust a *host* made the outcome the host's to
      // decide: on `jsc` the shape survived unaided, and under `eval` the
      // parser rejected the body before evaluation, so the case passed with
      // no boundary at all. Kept under `SMALL`, the budget is the only thing
      // that can stop this, on every host — with the guard removed all three
      // shapes simply return.
      const nest = 200;
      const body = '{'.repeat(nest) + ' var q = 1; ' + '}'.repeat(nest);
      const ladder =
        'function f(n) { if (n <= 0) { return g(); } return f(n - 1); }';

      const shapes = {
        parsed: `function g() { ${body} return 1; } ${ladder}`,
        eval: `var src = ${JSON.stringify(body)};
          function g() { return eval('(function () {' + src + ' return 1; })()'); } ${ladder}`,
        Function: `var src = ${JSON.stringify(body)};
          function g() { return Function(src + ' return 1;')(); } ${ladder}`,
      };

      for (const [how, prelude] of Object.entries(shapes)) {
        // A host `RangeError` would escape `run` rather than reach this
        // `catch`, and fail the case as the uncatchable defect it is.
        assertSame(
          run(
            `${prelude} var out = "not thrown";
             try { f(100); out = "returned"; }
             catch (e) {
               out = (e instanceof RangeError) ? "guest " + e.name
                 : "unexpected " + e.name;
             }
             out;`,
            SMALL,
          ),
          'guest RangeError',
          `${how}: the budget stopped it, and the guest caught it`,
        );
      }
    },
  },
  {
    name: 'a regular expression literal too deep to validate fails to parse, on any host',
    run() {
      // The engine re-validates every literal pattern against the ES5.1
      // grammar as a parse-time early error, with its own recursive descent
      // over guest text. That walk runs after Acorn has already accepted the
      // literal, so whichever of the two validators exhausts first is a race
      // between two host-dependent thresholds — and when the engine's loses,
      // the embedder inherits a raw host `RangeError` for a script that is
      // merely too deep. Depth reached while parsing is a failure to parse,
      // wherever in parsing it is reached.
      const shapes = {
        groups: (/** @type {number} */ n) =>
          '('.repeat(n) + 'a' + ')'.repeat(n),
        alternation: (/** @type {number} */ n) =>
          '(a|'.repeat(n) + 'b' + ')'.repeat(n),
        starred: (/** @type {number} */ n) =>
          '(?:'.repeat(n) + 'a' + ')*'.repeat(n),
        lookahead: (/** @type {number} */ n) =>
          '(?='.repeat(n) + 'a' + ')'.repeat(n),
      };

      for (const [how, pattern] of Object.entries(shapes)) {
        for (const depth of [1000, 2000, 3000, 5000, 8000]) {
          const literal = `/${pattern(depth)}/`;

          // Straight to the embedder: a failure to parse, never a `RangeError`.
          try {
            evaluateScript(createRealm(), `var r = ${literal};`);
          } catch (error) {
            if (!(error instanceof SyntaxError)) {
              throw new Error(
                `${how} at ${depth}: expected a SyntaxError, got ` +
                  `${error instanceof Error ? error.name : String(error)}`,
              );
            }
          }

          // And through `eval`, where it has to be the guest's to catch. Which
          // error it is depends on which limit the depth meets first — the
          // validator's stack while parsing, or the budget while the literal
          // is evaluated — and both are the guest's to handle. A host escape
          // would not reach this `catch` at all; it would leave `run`.
          const outcome = run(
            `try { eval(${JSON.stringify(`var r = ${literal};`)}); "parsed" }` +
              ' catch (e) { (e instanceof SyntaxError || e instanceof RangeError)' +
              ' ? "guest " + e.name : "unexpected " + e.name }',
          );

          if (
            !['parsed', 'guest SyntaxError', 'guest RangeError'].includes(
              String(outcome),
            )
          ) {
            throw new Error(
              `${how} at ${depth}: through eval, got ${String(outcome)}`,
            );
          }
        }
      }
    },
  },
  {
    name: 'a host defect inside a native body still escapes as a host error',
    run() {
      const realm = createRealm(SMALL);
      const boom = realm.createNativeFunction({
        name: 'boom',
        length: 0,
        call() {
          throw new TypeError('engine defect');
        },
      });
      realm.globalObject.defineOwnProperty('boom', {
        value: boom,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const error = assertThrows(
        () => evaluateScript(realm, 'try { boom(); } catch (e) { e.name }'),
        TypeError,
      );

      assertSame(error.message, 'engine defect');
    },
  },
  {
    name: 'a host RangeError that is not a recursion overflow is not relabeled',
    run() {
      const realm = createRealm(SMALL);
      const boom = realm.createNativeFunction({
        name: 'boom',
        length: 0,
        call() {
          throw new RangeError('engine defect');
        },
      });
      realm.globalObject.defineOwnProperty('boom', {
        value: boom,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const error = assertThrows(
        () => evaluateScript(realm, 'try { boom(); } catch (e) { e.name }'),
        RangeError,
      );

      assertSame(error.message, 'engine defect');
    },
  },
  {
    name: 'guest RangeErrors raised by built-ins are unaffected',
    run() {
      assertSame(
        run('try { (1).toFixed(21) } catch (e) { e.name + ":" + e.message }'),
        'RangeError:toFixed() digits must be between 0 and 20',
      );
    },
  },
];

export default tests;
