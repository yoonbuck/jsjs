/**
 * Host-neutral ownership of the focused Promise, generator, and module release.
 *
 * Records mirror the exact pinned Test262 metadata. Consumers derive path lists
 * from these records and use each suite's local feature allowlist.
 */

export const ASYNC_RUNTIME_RELEASE_MANIFEST_FILE =
  'tools/test262/async-runtime-release-manifest.js';

export const ASYNC_RUNTIME_RELEASE_MANIFEST = Object.freeze({
  generator: releaseSuite(
    ['Symbol.iterator', 'Symbol.toStringTag', 'generators'],
    [
      metadataRecord(
        'test/built-ins/GeneratorFunction/invoked-as-constructor-no-arguments.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorFunction/invoked-as-function-multiple-arguments.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorFunction/prototype/Symbol.toStringTag.js',
        ['generators', 'Symbol.toStringTag'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorPrototype/next/consecutive-yields.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorPrototype/next/from-state-executing.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorPrototype/return/from-state-suspended-start.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorPrototype/return/try-finally-within-try.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorPrototype/throw/from-state-suspended-start.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/built-ins/GeneratorPrototype/throw/try-catch-within-try.js',
        ['generators'],
        [],
      ),
      metadataRecord(
        'test/language/computed-property-names/class/method/generator.js',
        [],
        [],
      ),
      metadataRecord(
        'test/language/computed-property-names/object/method/generator.js',
        [],
        [],
      ),
    ],
  ),
  module: releaseSuite(
    ['Symbol.toStringTag'],
    [
      metadataRecord(
        'test/language/module-code/ambiguous-export-bindings/omitted-from-namespace.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/eval-export-dflt-expr-fn-anon.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/eval-gtbndng-indirect-update.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/eval-gtbndng-local-bndng-let.js',
        [],
        ['module'],
      ),
      metadataRecord('test/language/module-code/eval-this.js', [], ['module']),
      metadataRecord(
        'test/language/module-code/instn-iee-bndng-fun.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/instn-iee-err-dflt-thru-star.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/instn-iee-err-not-found.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/instn-iee-iee-cycle.js',
        [],
        ['module'],
      ),
      metadataRecord(
        'test/language/module-code/namespace/Symbol.toStringTag.js',
        ['Symbol.toStringTag'],
        ['module'],
      ),
    ],
  ),
  promise: releaseSuite(
    ['Symbol.iterator', 'Symbol.species', 'Symbol.toStringTag'],
    [
      metadataRecord(
        'test/built-ins/Promise/Symbol.species/prop-desc.js',
        ['Symbol.species'],
        [],
      ),
      metadataRecord(
        'test/built-ins/Promise/all/capability-resolve-throws-no-close.js',
        ['Symbol.iterator'],
        [],
      ),
      metadataRecord(
        'test/built-ins/Promise/all/capability-resolve-throws-reject.js',
        [],
        ['async'],
      ),
      metadataRecord(
        'test/built-ins/Promise/all/resolve-non-thenable.js',
        [],
        ['async'],
      ),
      metadataRecord('test/built-ins/Promise/constructor.js', [], []),
      metadataRecord(
        'test/built-ins/Promise/prototype/Symbol.toStringTag.js',
        ['Symbol.toStringTag'],
        [],
      ),
      metadataRecord(
        'test/built-ins/Promise/prototype/then/rxn-handler-identity.js',
        [],
        ['async'],
      ),
      metadataRecord(
        'test/built-ins/Promise/prototype/then/rxn-handler-thrower.js',
        [],
        ['async'],
      ),
      metadataRecord(
        'test/built-ins/Promise/race/resolved-sequence.js',
        [],
        ['async'],
      ),
      metadataRecord(
        'test/built-ins/Promise/resolve-thenable-immed.js',
        [],
        ['async'],
      ),
      metadataRecord(
        'test/built-ins/Promise/resolve/resolve-thenable.js',
        [],
        ['async'],
      ),
    ],
  ),
});

/**
 * @param {string[]} supportedFeatures
 * @param {ReturnType<typeof metadataRecord>[]} records
 */
function releaseSuite(supportedFeatures, records) {
  return Object.freeze({
    records: Object.freeze(records),
    supportedFeatures: Object.freeze(supportedFeatures),
  });
}

/**
 * @param {string} path
 * @param {string[]} features
 * @param {string[]} flags
 */
function metadataRecord(path, features, flags) {
  return Object.freeze({
    path,
    features: Object.freeze(features),
    flags: Object.freeze(flags),
  });
}
