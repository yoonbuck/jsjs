import {
  createModuleLoader,
  createRealm,
  evaluateScript,
  ModuleLoaderError,
} from '../../src/index.js';

/**
 * Creates the portable Test262 engine bridge used by every host adapter.
 *
 * @returns {import('./runner.js').Test262Engine}
 */
export function createJsjsTest262Engine() {
  return Object.freeze({
    createRealm,
    installHostBindings() {},
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
