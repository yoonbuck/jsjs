import { createRealm, evaluateScript } from '../../src/index.js';

/**
 * Creates the portable Test262 engine bridge used by every host adapter.
 *
 * @returns {import('./runner.js').Test262Engine}
 */
export function createJsjsTest262Engine() {
  return Object.freeze({
    createRealm,
    evaluateScript,
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
