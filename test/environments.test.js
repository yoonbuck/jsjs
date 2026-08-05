import { assertSame, assertThrows } from './harness/assert.js';
import { EngineObject } from '../src/runtime/object.js';
import { getValue, putValue, Reference } from '../src/runtime/reference.js';
import {
  DeclarativeEnvironmentRecord,
  GlobalEnvironmentRecord,
  ObjectEnvironmentRecord,
  getIdentifierReference,
  newDeclarativeEnvironment,
  newObjectEnvironment,
} from '../src/runtime/environment.js';

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

      assertThrows(() => env.getBindingValue('missing', true), ReferenceError);
      assertThrows(
        () => env.setMutableBinding('missing', 1, true),
        ReferenceError,
      );
    },
  },
  {
    name: 'declarative environment records enforce immutable binding rules',
    run() {
      const env = new DeclarativeEnvironmentRecord();

      env.createImmutableBinding('total');
      assertThrows(() => env.getBindingValue('total', true), ReferenceError);

      env.initializeBinding('total', 10);
      assertSame(env.getBindingValue('total', true), 10);

      assertThrows(() => env.setMutableBinding('total', 11, true), TypeError);
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
      assertThrows(() => getValue(reference), ReferenceError);
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

      assertThrows(() => env.getBindingValue('y', true), ReferenceError);
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
      assertThrows(() => env.setMutableBinding('MAX', 200, true), TypeError);

      assertSame(env.getThisBinding(), globalObject);

      assertThrows(() => env.getBindingValue('missing', true), ReferenceError);
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
];

export default tests;
