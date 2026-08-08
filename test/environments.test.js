import { assertSame, assertThrows } from './harness/assert.js';
import { EngineObject } from '../src/runtime/object.js';
import { createRealm } from '../src/runtime/realm.js';
import { getValue, putValue, Reference } from '../src/runtime/reference.js';
import {
  DeclarativeEnvironmentRecord,
  GlobalEnvironmentRecord,
  ObjectEnvironmentRecord,
  getIdentifierReference,
  newDeclarativeEnvironment,
  newObjectEnvironment,
} from '../src/runtime/environment.js';
import { GuestErrorSignal } from '../src/runtime/completion.js';

const tests = [
  {
    name: 'declarative environment records enforce mutable binding rules',
    run() {
      const env = new DeclarativeEnvironmentRecord();

      assertSame(env.hasBinding('count'), false);

      env.createMutableBinding('count');
      assertSame(env.hasBinding('count'), true);
      env.initializeBinding('count', 1);
      assertSame(env.getBindingValue('count', true), 1);

      env.setMutableBinding('count', 2, true);
      assertSame(env.getBindingValue('count', true), 2);

      assertThrows(
        () => env.getBindingValue('missing', true),
        GuestErrorSignal,
      );
      assertThrows(
        () => env.setMutableBinding('missing', 1, true),
        GuestErrorSignal,
      );
    },
  },
  {
    name: 'declarative environment records enforce immutable binding rules',
    run() {
      const env = new DeclarativeEnvironmentRecord();

      env.createImmutableBinding('total');
      assertThrows(() => env.getBindingValue('total', true), GuestErrorSignal);

      env.initializeBinding('total', 10);
      assertSame(env.getBindingValue('total', true), 10);

      assertThrows(
        () => env.setMutableBinding('total', 11, true),
        GuestErrorSignal,
      );
      // Non-strict writes to an immutable binding are silently ignored.
      env.setMutableBinding('total', 12, false);
      assertSame(env.getBindingValue('total', true), 10);

      assertSame(env.deleteBinding('total'), false);
    },
  },
  {
    name: 'declarative bindings support deletable mutable bindings',
    run() {
      const env = new DeclarativeEnvironmentRecord();

      env.createMutableBinding('temp', true);
      env.initializeBinding('temp', 'value');
      assertSame(env.deleteBinding('temp'), true);
      assertSame(env.hasBinding('temp'), false);
    },
  },
  {
    name: 'environment chaining resolves bindings through outer environments',
    run() {
      const outer = newDeclarativeEnvironment(null);
      outer.createMutableBinding('shared');
      outer.initializeBinding('shared', 'from-outer');

      const inner = newDeclarativeEnvironment(outer);
      inner.createMutableBinding('local');
      inner.initializeBinding('local', 'from-inner');

      const localReference = getIdentifierReference(inner, 'local', true);
      assertSame(localReference.base, inner);
      assertSame(getValue(localReference), 'from-inner');

      const sharedReference = getIdentifierReference(inner, 'shared', true);
      assertSame(sharedReference.base, outer);
      assertSame(getValue(sharedReference), 'from-outer');

      putValue(sharedReference, 'updated');
      assertSame(outer.getBindingValue('shared', true), 'updated');
    },
  },
  {
    name: 'unresolved identifiers produce unresolvable references',
    run() {
      const inner = newDeclarativeEnvironment(newDeclarativeEnvironment(null));
      const reference = getIdentifierReference(inner, 'missing', true);

      assertSame(reference.base, undefined);
      assertThrows(() => getValue(reference), GuestErrorSignal);
    },
  },
  {
    name: 'an unresolvable identifier reference carries the global object of the realm its chain is rooted in',
    run() {
      const realm = createRealm();
      const inner = newDeclarativeEnvironment(
        newDeclarativeEnvironment(realm.globalEnvironment),
      );
      const reference = getIdentifierReference(inner, 'missing', false);

      assertSame(reference.base, undefined);
      assertSame(
        /** @type {any} */ (reference).globalObject,
        realm.globalObject,
      );
      assertThrows(() => getValue(reference), GuestErrorSignal);
    },
  },
  {
    name: 'sloppy assignment through an unresolvable identifier reference creates the property on the realm global object',
    run() {
      const realm = createRealm();
      const inner = newDeclarativeEnvironment(realm.globalEnvironment);

      putValue(getIdentifierReference(inner, 'created', false), 5);

      assertSame(realm.globalObject.get('created'), 5);
      assertSame(
        getValue(getIdentifierReference(inner, 'created', false)),
        5,
        'the created property resolves as an ordinary global binding afterwards',
      );
    },
  },
  {
    name: 'strict assignment through an unresolvable identifier reference throws and creates nothing',
    run() {
      const realm = createRealm();
      const inner = newDeclarativeEnvironment(realm.globalEnvironment);

      assertThrows(
        () => putValue(getIdentifierReference(inner, 'strictOnly', true), 5),
        GuestErrorSignal,
      );
      assertSame(realm.globalObject.hasProperty('strictOnly'), false);
    },
  },
  {
    name: 'an environment chain with no global environment has no global object to create a property on',
    run() {
      const detached = newDeclarativeEnvironment(
        newDeclarativeEnvironment(null),
      );
      const reference = getIdentifierReference(detached, 'missing', false);

      assertSame(/** @type {any} */ (reference).globalObject, null);
      assertThrows(() => putValue(reference, 5), GuestErrorSignal);
    },
  },
  {
    name: 'object environment records delegate bindings to an engine object',
    run() {
      const bindingObject = new EngineObject(null);
      const env = new ObjectEnvironmentRecord(bindingObject);

      assertSame(env.hasBinding('x'), false);

      env.createMutableBinding('x', true);
      assertSame(env.hasBinding('x'), true);
      assertSame(bindingObject.hasProperty('x'), true);

      env.setMutableBinding('x', 5, true);
      assertSame(env.getBindingValue('x', true), 5);
      assertSame(bindingObject.get('x'), 5);

      assertThrows(() => env.getBindingValue('y', true), GuestErrorSignal);
      assertSame(env.getBindingValue('y', false), undefined);

      assertSame(env.deleteBinding('x'), true);
      assertSame(env.hasBinding('x'), false);
    },
  },
  {
    name: 'object environment records see inherited properties',
    run() {
      const prototype = new EngineObject(null);
      prototype.defineOwnProperty('inherited', {
        value: 'proto-value',
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const bindingObject = new EngineObject(prototype);
      const env = new ObjectEnvironmentRecord(bindingObject);

      assertSame(env.hasBinding('inherited'), true);
      assertSame(env.getBindingValue('inherited', true), 'proto-value');
    },
  },
  {
    name: 'object environment records reject non EngineObject bases',
    run() {
      assertThrows(
        () => new ObjectEnvironmentRecord(/** @type {any} */ ({})),
        TypeError,
      );
    },
  },
  {
    name: 'newObjectEnvironment wires an outer environment',
    run() {
      const outer = newDeclarativeEnvironment(null);
      const env = newObjectEnvironment(new EngineObject(null), outer);
      assertSame(env.outer, outer);
    },
  },
  {
    name: 'global environment records combine declarative and object semantics',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      env.createGlobalVarBinding('counter', false);
      assertSame(globalObject.hasProperty('counter'), true);
      env.setMutableBinding('counter', 1, true);
      assertSame(env.getBindingValue('counter', true), 1);
      assertSame(globalObject.get('counter'), 1);

      env.createImmutableBinding('MAX');
      env.initializeBinding('MAX', 100);
      assertSame(env.getBindingValue('MAX', true), 100);
      assertThrows(
        () => env.setMutableBinding('MAX', 200, true),
        GuestErrorSignal,
      );

      assertSame(env.getThisBinding(), globalObject);

      assertThrows(
        () => env.getBindingValue('missing', true),
        GuestErrorSignal,
      );
    },
  },
  {
    name: 'global environment records reference the shared global object',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);
      env.createGlobalVarBinding('value', false);
      env.setMutableBinding('value', 'from-global', true);

      const reference = new Reference(env, 'value', true);
      assertSame(getValue(reference), 'from-global');

      globalObject.put('value', 'mutated-directly', true);
      assertSame(env.getBindingValue('value', true), 'mutated-directly');
    },
  },
  {
    name: 'createGlobalVarBinding creates an own non-configurable property for a name inherited from the global prototype',
    run() {
      const globalPrototype = new EngineObject(null);
      globalPrototype.defineOwnProperty('toString', {
        value: 'inherited',
        writable: true,
        enumerable: false,
        configurable: true,
      });

      const globalObject = new EngineObject(globalPrototype);
      const env = new GlobalEnvironmentRecord(globalObject);

      // Sanity check: the property is only inherited, not own, before the
      // var binding is created.
      assertSame(globalObject.getOwnProperty('toString'), undefined);
      assertSame(globalObject.hasProperty('toString'), true);

      // `var toString;` at the top level, i.e. a non-deletable global var
      // binding colliding with an inherited intrinsic name.
      env.createGlobalVarBinding('toString', false);

      const ownDescriptor = globalObject.getOwnProperty('toString');
      if (ownDescriptor === undefined) {
        throw new Error('Expected toString to become an own property');
      }
      assertSame(ownDescriptor.value, undefined);
      assertSame(ownDescriptor.writable, true);
      assertSame(ownDescriptor.configurable, false);

      // Assigning through the binding must not be able to widen
      // configurability of the own property that was already created.
      env.setMutableBinding('toString', 'assigned', true);
      const afterAssignment = globalObject.getOwnProperty('toString');
      if (afterAssignment === undefined) {
        throw new Error('Expected toString to remain an own property');
      }
      assertSame(afterAssignment.value, 'assigned');
      assertSame(afterAssignment.configurable, false);

      // Deleting must fail: the property is non-configurable and the name
      // was declared non-deletable.
      assertSame(env.deleteBinding('toString'), false);
    },
  },
  {
    name: 'createGlobalVarBinding on a non-extensible global without the own property throws a guest TypeError',
    run() {
      const globalObject = new EngineObject(null);
      globalObject.preventExtensions();

      const env = new GlobalEnvironmentRecord(globalObject);

      // ES5.1 10.5: CreateMutableBinding runs [[DefineOwnProperty]] with the
      // Throw flag, so declaring a new global var on a non-extensible global
      // is a guest TypeError rather than a silent no-op.
      assertThrows(
        () => env.createGlobalVarBinding('missingVar', true),
        GuestErrorSignal,
      );

      assertSame(globalObject.getOwnProperty('missingVar'), undefined);
    },
  },
  {
    name: 'createGlobalVarBinding on a non-extensible global still succeeds for an existing own property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      env.createGlobalVarBinding('present', true);
      globalObject.preventExtensions();

      // Re-declaring a name that is already an own property must not throw
      // even though the global can no longer grow.
      env.createGlobalVarBinding('present', true);
      assertSame(env.getBindingValue('present', true), undefined);
    },
  },
  {
    name: 'createGlobalFunctionBinding redefines a configurable colliding property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('f', {
        value: 7,
        writable: false,
        enumerable: true,
        configurable: true,
      });

      env.createGlobalFunctionBinding('f', 'fn', false);

      const descriptor = /** @type {any} */ (globalObject.getOwnProperty('f'));
      assertSame(descriptor.value, 'fn');
      assertSame(descriptor.writable, true);
      assertSame(descriptor.enumerable, true);
      assertSame(descriptor.configurable, false);
    },
  },
  {
    name: 'createGlobalFunctionBinding throws a guest TypeError over a non-configurable, non-writable property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('locked', {
        value: 1,
        writable: false,
        enumerable: false,
        configurable: false,
      });

      assertThrows(
        () => env.createGlobalFunctionBinding('locked', 'fn', false),
        GuestErrorSignal,
      );
    },
  },
  {
    name: 'a non-strict setMutableBinding reference against a non-strict (default) immutable binding leaves a silent no-op',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createImmutableBinding('a');
      env.initializeBinding('a', 1);

      env.setMutableBinding('a', 2, false);
      assertSame(env.getBindingValue('a', false), 1);
    },
  },
  {
    name: 'a strict setMutableBinding reference against a non-strict (default) immutable binding throws a guest TypeError',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createImmutableBinding('b', false);
      env.initializeBinding('b', 1);

      assertThrows(() => env.setMutableBinding('b', 2, true), GuestErrorSignal);
      assertSame(env.getBindingValue('b', false), 1);
    },
  },
  {
    name: 'a non-strict setMutableBinding reference against a strict immutable binding still throws a guest TypeError',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createImmutableBinding('c', true);
      env.initializeBinding('c', 1);

      assertThrows(
        () => env.setMutableBinding('c', 2, false),
        GuestErrorSignal,
      );
      assertSame(env.getBindingValue('c', false), 1);
    },
  },
  {
    name: 'a strict setMutableBinding reference against a strict immutable binding throws a guest TypeError',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createImmutableBinding('d', true);
      env.initializeBinding('d', 1);

      assertThrows(() => env.setMutableBinding('d', 2, true), GuestErrorSignal);
      assertSame(env.getBindingValue('d', false), 1);
    },
  },
  {
    name: 'the guest TypeError raised for assignment to an immutable binding keeps the V8 message text verbatim',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createImmutableBinding('e', true);
      env.initializeBinding('e', 1);

      const error = assertThrows(
        () => env.setMutableBinding('e', 2, true),
        GuestErrorSignal,
      );
      assertSame(/** @type {GuestErrorSignal} */ (error).typeName, 'TypeError');
      assertSame(
        /** @type {GuestErrorSignal} */ (error).guestMessage,
        'Assignment to constant variable.',
      );
    },
  },
  {
    name: 'reading or writing an uninitialized declarative binding throws a guest ReferenceError',
    run() {
      const env = new DeclarativeEnvironmentRecord();
      env.createMutableBinding('tdz');

      const readError = assertThrows(
        () => env.getBindingValue('tdz', true),
        GuestErrorSignal,
      );
      assertSame(
        /** @type {GuestErrorSignal} */ (readError).typeName,
        'ReferenceError',
      );

      const writeError = assertThrows(
        () => env.setMutableBinding('tdz', 1, true),
        GuestErrorSignal,
      );
      assertSame(
        /** @type {GuestErrorSignal} */ (writeError).typeName,
        'ReferenceError',
      );
    },
  },
  {
    name: "GlobalEnvironmentRecord's createImmutableBinding forwards the strict flag to the declarative record",
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      env.createImmutableBinding('PI', true);
      env.initializeBinding('PI', 3.14);

      assertThrows(
        () => env.setMutableBinding('PI', 4, false),
        GuestErrorSignal,
      );
    },
  },
  {
    name: 'hasVarDeclaration and hasLexicalDeclaration report false before declaration and true after, for a name with no own global property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.hasVarDeclaration('v'), false);
      env.createGlobalVarBinding('v', false);
      assertSame(env.hasVarDeclaration('v'), true);

      assertSame(env.hasLexicalDeclaration('l'), false);
      env.createMutableBinding('l', false);
      assertSame(env.hasLexicalDeclaration('l'), true);
    },
  },
  {
    name: 'hasVarDeclaration and hasLexicalDeclaration report false before declaration and true after, when the name already has a configurable own global property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('v', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(env.hasVarDeclaration('v'), false);
      env.createGlobalVarBinding('v', false);
      assertSame(env.hasVarDeclaration('v'), true);

      globalObject.defineOwnProperty('l', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(env.hasLexicalDeclaration('l'), false);
      env.createMutableBinding('l', false);
      assertSame(env.hasLexicalDeclaration('l'), true);
    },
  },
  {
    name: 'hasVarDeclaration and hasLexicalDeclaration report false before declaration and true after, when the name already has a non-configurable writable and enumerable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('v', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasVarDeclaration('v'), false);
      env.createGlobalVarBinding('v', false);
      assertSame(env.hasVarDeclaration('v'), true);

      globalObject.defineOwnProperty('l', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasLexicalDeclaration('l'), false);
      env.createMutableBinding('l', false);
      assertSame(env.hasLexicalDeclaration('l'), true);
    },
  },
  {
    name: 'hasVarDeclaration and hasLexicalDeclaration report false before declaration and true after, when the name already has a non-configurable non-writable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('v', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasVarDeclaration('v'), false);
      env.createGlobalVarBinding('v', false);
      assertSame(env.hasVarDeclaration('v'), true);

      globalObject.defineOwnProperty('l', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasLexicalDeclaration('l'), false);
      env.createMutableBinding('l', false);
      assertSame(env.hasLexicalDeclaration('l'), true);
    },
  },
  {
    name: 'hasVarDeclaration and hasLexicalDeclaration report false before declaration and true after, when the name already has a non-configurable own global accessor property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('v', {
        get: () => 1,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasVarDeclaration('v'), false);
      env.createGlobalVarBinding('v', false);
      assertSame(env.hasVarDeclaration('v'), true);

      globalObject.defineOwnProperty('l', {
        get: () => 1,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasLexicalDeclaration('l'), false);
      env.createMutableBinding('l', false);
      assertSame(env.hasLexicalDeclaration('l'), true);
    },
  },
  {
    name: 'hasVarDeclaration and hasLexicalDeclaration report false before declaration and true after, on a non-extensible global object, given the declared name already has an own property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('v', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      globalObject.defineOwnProperty('l', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      globalObject.preventExtensions();

      assertSame(env.hasVarDeclaration('v'), false);
      env.createGlobalVarBinding('v', false);
      assertSame(env.hasVarDeclaration('v'), true);

      assertSame(env.hasLexicalDeclaration('l'), false);
      env.createMutableBinding('l', false);
      assertSame(env.hasLexicalDeclaration('l'), true);
    },
  },
  {
    name: 'hasRestrictedGlobalProperty is false for a name with no own global property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.hasRestrictedGlobalProperty('absent'), false);
    },
  },
  {
    name: 'hasRestrictedGlobalProperty is false for a configurable own global property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('configurableProp', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(env.hasRestrictedGlobalProperty('configurableProp'), false);
    },
  },
  {
    name: 'hasRestrictedGlobalProperty is true for a non-configurable writable and enumerable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('writableEnumerable', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasRestrictedGlobalProperty('writableEnumerable'), true);
    },
  },
  {
    name: 'hasRestrictedGlobalProperty is true for a non-configurable non-writable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('undefined', {
        value: undefined,
        writable: false,
        enumerable: false,
        configurable: false,
      });
      assertSame(env.hasRestrictedGlobalProperty('undefined'), true);
    },
  },
  {
    name: 'hasRestrictedGlobalProperty is true for a non-configurable own global accessor property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('accessor', {
        get: () => 1,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.hasRestrictedGlobalProperty('accessor'), true);
    },
  },
  {
    name: "hasRestrictedGlobalProperty is unaffected by the global object's extensibility, for both an absent property and an existing non-configurable property",
    run() {
      const globalObject = new EngineObject(null);
      globalObject.defineOwnProperty('locked', {
        value: 1,
        writable: false,
        enumerable: false,
        configurable: false,
      });
      globalObject.preventExtensions();
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.hasRestrictedGlobalProperty('absent'), false);
      assertSame(env.hasRestrictedGlobalProperty('locked'), true);
    },
  },
  {
    name: "hasRestrictedGlobalProperty is false for a name that only exists on the global object's prototype (toString), unlike a non-configurable own property (undefined)",
    run() {
      const globalPrototype = new EngineObject(null);
      globalPrototype.defineOwnProperty('toString', {
        value: 'inherited',
        writable: true,
        enumerable: false,
        configurable: true,
      });
      const globalObject = new EngineObject(globalPrototype);
      globalObject.defineOwnProperty('undefined', {
        value: undefined,
        writable: false,
        enumerable: false,
        configurable: false,
      });
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(globalObject.getOwnProperty('toString'), undefined);
      assertSame(globalObject.hasProperty('toString'), true);
      assertSame(env.hasRestrictedGlobalProperty('toString'), false);
      assertSame(env.hasRestrictedGlobalProperty('undefined'), true);
    },
  },
  {
    name: 'canDeclareGlobalVar is true for a name with no own global property on an extensible global',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.canDeclareGlobalVar('fresh'), true);
    },
  },
  {
    name: 'canDeclareGlobalVar is true when the name already has a configurable own global property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('configurableProp', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      assertSame(env.canDeclareGlobalVar('configurableProp'), true);
    },
  },
  {
    name: 'canDeclareGlobalVar is true when the name already has a non-configurable writable and enumerable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('writableEnumerable', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.canDeclareGlobalVar('writableEnumerable'), true);
    },
  },
  {
    name: 'canDeclareGlobalVar is true when the name already has a non-configurable non-writable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('nonConfigNonWritable', {
        value: 1,
        writable: false,
        enumerable: false,
        configurable: false,
      });
      assertSame(env.canDeclareGlobalVar('nonConfigNonWritable'), true);
    },
  },
  {
    name: 'canDeclareGlobalVar is true when the name already has a non-configurable own global accessor property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('accessor', {
        get: () => 1,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.canDeclareGlobalVar('accessor'), true);
    },
  },
  {
    name: 'canDeclareGlobalVar is false for a name with no own global property on a non-extensible global',
    run() {
      const globalObject = new EngineObject(null);
      globalObject.preventExtensions();
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.canDeclareGlobalVar('stillNoOwnProperty'), false);
    },
  },
  {
    name: 'canDeclareGlobalVar remains true for an existing own property even on a non-extensible global',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);
      env.createGlobalVarBinding('present', true);
      globalObject.preventExtensions();

      assertSame(env.canDeclareGlobalVar('present'), true);
    },
  },
  {
    name: 'canDeclareGlobalFunction is true for a name with no own global property on an extensible global',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.canDeclareGlobalFunction('fresh'), true);
    },
  },
  {
    name: 'canDeclareGlobalFunction is true for a configurable own global property regardless of its other attributes',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('configurableProp', {
        value: 1,
        writable: false,
        enumerable: false,
        configurable: true,
      });
      assertSame(env.canDeclareGlobalFunction('configurableProp'), true);
    },
  },
  {
    name: 'canDeclareGlobalFunction is true for a non-configurable writable and enumerable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('writableEnumerable', {
        value: 1,
        writable: true,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.canDeclareGlobalFunction('writableEnumerable'), true);
    },
  },
  {
    name: 'canDeclareGlobalFunction is false for a non-configurable non-writable own global data property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('nonWritable', {
        value: 1,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.canDeclareGlobalFunction('nonWritable'), false);
    },
  },
  {
    name: 'canDeclareGlobalFunction is false for a non-configurable own global accessor property',
    run() {
      const globalObject = new EngineObject(null);
      const env = new GlobalEnvironmentRecord(globalObject);

      globalObject.defineOwnProperty('accessor', {
        get: () => 1,
        enumerable: true,
        configurable: false,
      });
      assertSame(env.canDeclareGlobalFunction('accessor'), false);
    },
  },
  {
    name: 'canDeclareGlobalFunction is false for a name with no own global property on a non-extensible global',
    run() {
      const globalObject = new EngineObject(null);
      globalObject.preventExtensions();
      const env = new GlobalEnvironmentRecord(globalObject);

      assertSame(env.canDeclareGlobalFunction('stillNoOwnProperty'), false);
    },
  },
];

export default tests;
