/**
 * @param {{ name?: string, source: string, expectedChecksum?: number }} workload
 * @param {FunctionConstructor | ((source: string) => Function)} [compile]
 * @returns {{ cold: () => number, steady: () => number }}
 */
export function createNativeExecutors(workload, compile = Function) {
  const compileFunction = /** @type {(source: string) => Function} */ (compile);
  const steadyFunction = /** @type {() => number} */ (
    compileFunction(`return ${functionSourceFor(workload.source)};`)()
  );

  return Object.freeze({
    cold() {
      return /** @type {number} */ (
        compileFunction(`return ${workload.source};`)()
      );
    },
    steady() {
      return steadyFunction();
    },
  });
}

/**
 * @template {{ globalObject: object }} TRealm
 * @param {{
 *   createRealm: () => TRealm,
 *   evaluateScript: (
 *     realm: TRealm,
 *     source: string,
 *   ) => { type: string, value: unknown },
 * }} engine
 * @param {{ name?: string, source: string, expectedChecksum?: number }} workload
 * @returns {{ cold: () => number, steady: () => number }}
 */
export function createJsjsExecutors(engine, workload) {
  const steadyRealm = engine.createRealm();
  const functionName = '__jsjsBenchmark';
  const setupResult = engine.evaluateScript(
    steadyRealm,
    `function ${functionName}() {${functionBodyFor(workload.source)}}`,
  );

  if (setupResult.type !== 'normal') {
    throw new TypeError('jsjs steady setup must complete normally');
  }

  const guestFunction =
    /** @type {{ callFunction?: unknown } | null} */ (
      readGlobalBinding(steadyRealm.globalObject, functionName)
    );

  if (
    typeof guestFunction !== 'object' ||
    guestFunction === null ||
    typeof guestFunction.callFunction !== 'function'
  ) {
    throw new TypeError('jsjs steady setup must define a callable guest function');
  }

  const callableGuestFunction =
    /** @type {{ callFunction: (thisValue: unknown, args: readonly unknown[]) => number }} */ (
      guestFunction
    );

  return Object.freeze({
    cold() {
      const realm = engine.createRealm();
      const completion = engine.evaluateScript(realm, workload.source);

      if (completion.type !== 'normal') {
        throw new TypeError('jsjs cold executor must complete normally');
      }

      return /** @type {number} */ (completion.value);
    },
    steady() {
      return callableGuestFunction.callFunction(undefined, []);
    },
  });
}

/**
 * @param {string} source
 * @returns {string}
 */
function functionBodyFor(source) {
  const body = bodyForIife(source);

  return body;
}

/**
 * @param {string} source
 * @returns {string}
 */
function functionSourceFor(source) {
  return `function () {${bodyForIife(source)}}`;
}

/**
 * @param {string} source
 * @returns {string}
 */
function bodyForIife(source) {
  const match = /^\(function\s*\(\)\s*\{([\s\S]*)\}\(\)\)$/.exec(source);

  if (match === null) {
    throw new TypeError('Benchmark workload source must be a zero-argument IIFE');
  }

  return match[1];
}

/**
 * @param {object} globalObject
 * @param {string} name
 * @returns {unknown}
 */
function readGlobalBinding(globalObject, name) {
  if (
    typeof globalObject === 'object' &&
    globalObject !== null &&
    'get' in globalObject &&
    typeof globalObject.get === 'function'
  ) {
    return globalObject.get(name);
  }

  return /** @type {Record<string, unknown>} */ (globalObject)[name];
}
