import {
  createModuleLoader,
  createRealm,
  evaluateScript,
  ModuleLoaderError,
  parseScript,
} from '../../src/index.js';
import { GuestErrorSignal, ThrowSignal } from '../../src/runtime/completion.js';
import { EngineObject } from '../../src/runtime/object.js';

/**
 * @param {EngineObject} target
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function defineHostProperty(target, name, value) {
  target.defineOwnProperty(name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @param {import('../../src/runtime/realm.js').Realm} realm
 * @returns {EngineObject}
 */
function installHostBindings(realm) {
  const host = new EngineObject(realm.intrinsics.objectPrototype);

  defineHostProperty(host, 'global', realm.globalObject);
  defineHostProperty(
    host,
    'createRealm',
    realm.createNativeFunction({
      name: 'createRealm',
      length: 0,
      call() {
        const child = createRealm({ agent: realm.agent });
        return installHostBindings(child);
      },
    }),
  );
  defineHostProperty(
    host,
    'evalScript',
    realm.createNativeFunction({
      name: 'evalScript',
      length: 1,
      call(_thisValue, args) {
        const source = args[0];

        if (typeof source !== 'string') {
          throw new GuestErrorSignal(
            'TypeError',
            '$262.evalScript source must be a string',
          );
        }

        const completion = runEvalScript(realm, source);
        if (completion.type === 'throw') {
          throw new ThrowSignal(completion.value);
        }
        return completion.value;
      },
    }),
  );

  realm.globalObject.defineOwnProperty('$262', {
    value: host,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return host;
}

/**
 * @param {import('../../src/runtime/realm.js').Realm} realm
 * @param {string} source
 * @returns {{ type: 'normal' | 'throw', value: unknown }}
 */
function runEvalScript(realm, source) {
  try {
    parseScript(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GuestErrorSignal('SyntaxError', error.message);
    }

    throw error;
  }

  return evaluateScript(realm, source);
}

/**
 * Creates the portable Test262 engine bridge used by every host adapter.
 *
 * @returns {import('./runner.js').Test262Engine}
 */
export function createJsjsTest262Engine() {
  return Object.freeze({
    createRealm,
    installHostBindings,
    evaluateScript,
    async evaluateModule(realm, source, identifier, host) {
      const loader = createModuleLoader(realm, {
        resolve(specifier, referrer) {
          if (referrer === null && specifier === identifier) {
            return identifier;
          }

          return host.resolve(specifier, referrer);
        },
        load(moduleIdentifier) {
          return moduleIdentifier === identifier
            ? source
            : host.load(moduleIdentifier);
        },
      });

      try {
        await loader.loadAndEvaluate(identifier);
        return { phase: null };
      } catch (error) {
        if (!(error instanceof ModuleLoaderError)) {
          throw error;
        }

        if (error.phase === 'parse') {
          if (error.identifier !== identifier) {
            const message =
              error.cause instanceof Error
                ? error.cause.message
                : 'Module dependency parse failed';
            return {
              phase: 'resolution',
              value: realm.createGuestError('SyntaxError', message),
            };
          }
          return {
            phase: 'parse',
            error: /** @type {Error} */ (error.cause),
          };
        }
        if (error.phase === 'link') {
          return { phase: 'resolution', value: error.cause };
        }
        if (error.phase === 'evaluate') {
          return { phase: 'runtime', value: error.value };
        }

        throw error;
      }
    },
    installDone(realm, onDone) {
      const done = realm.createNativeFunction({
        name: '$DONE',
        length: 1,
        call(
          /** @type {unknown} */ _thisValue,
          /** @type {readonly unknown[]} */ args,
        ) {
          onDone(args[0]);
          return undefined;
        },
      });
      realm.globalObject.defineOwnProperty('$DONE', {
        value: done,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    },
    runJobs(realm) {
      return realm.agent.runJobs();
    },
  });
}
