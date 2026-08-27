import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openingSensor, isOpenRaw } from '../src/devices/openingSensor.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const entry = { uniqueId: '12_3', name: 'Porte-fenêtre salon' };

test('isOpenRaw normalizes the various literals Tydom is seen sending', () => {
  assert.equal(isOpenRaw('OPEN'), true);
  assert.equal(isOpenRaw('open'), true);
  assert.equal(isOpenRaw(true), true);
  assert.equal(isOpenRaw('true'), true);
  assert.equal(isOpenRaw('1'), true);
  assert.equal(isOpenRaw('CLOSED'), false);
  assert.equal(isOpenRaw(false), false);
  assert.equal(isOpenRaw('false'), false);
  assert.equal(isOpenRaw(undefined), false);
});

test('the device is read-only', () => {
  const device = openingSensor.buildDevice(gladys, entry);
  assert.equal(device.features[0].read_only, true);
});

// Gladys' OPENING_SENSOR_STATE convention (server/utils/constants.js): OPEN=0, CLOSE=1.
test('publishUpdate maps OPEN to 0 and CLOSED to 1', () => {
  assert.deepEqual(
    openingSensor.publishUpdate(gladys, entry, ['openState'], { openState: 'OPEN' }),
    [{ featureExternalId: 'opening:12_3:open', value: 0 }],
  );
  assert.deepEqual(
    openingSensor.publishUpdate(gladys, entry, ['openState'], { openState: 'CLOSED' }),
    [{ featureExternalId: 'opening:12_3:open', value: 1 }],
  );
});

test('publishUpdate is a no-op when openState did not change', () => {
  assert.deepEqual(openingSensor.publishUpdate(gladys, entry, [], { openState: 'OPEN' }), []);
});
