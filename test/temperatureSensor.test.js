import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temperatureSensor } from '../src/devices/temperatureSensor.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const entry = { uniqueId: '13_4', name: 'Sonde extérieure' };

test('the device is read-only and reports celsius', () => {
  const device = temperatureSensor.buildDevice(gladys, entry);
  assert.equal(device.features[0].read_only, true);
  assert.equal(device.features[0].unit, 'celsius');
});

test('publishUpdate publishes the numeric outTemperature', () => {
  assert.deepEqual(
    temperatureSensor.publishUpdate(gladys, entry, ['outTemperature'], { outTemperature: 12.5 }),
    [{ featureExternalId: 'temperature:13_4:temperature', value: 12.5 }],
  );
});

test('publishUpdate ignores a non-numeric reading instead of publishing NaN', () => {
  assert.deepEqual(
    temperatureSensor.publishUpdate(gladys, entry, ['outTemperature'], { outTemperature: 'None' }),
    [],
  );
});

test('publishUpdate is a no-op when outTemperature did not change', () => {
  assert.deepEqual(
    temperatureSensor.publishUpdate(gladys, entry, [], { outTemperature: 12.5 }),
    [],
  );
});
