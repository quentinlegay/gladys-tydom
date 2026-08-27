import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { cover, toGladysPosition, toTydomPosition } from '../src/devices/cover.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const entry = { uniqueId: '10_1', name: 'Volet salon' };

function fakeService() {
  const commands = [];
  return {
    commands,
    async commandDevice(uniqueId, name, value) {
      commands.push({ uniqueId, name, value });
    },
  };
}

test('toGladysPosition / toTydomPosition invert Tydom "% closed" into Gladys "% open"', () => {
  assert.equal(toGladysPosition(0), 100, 'Tydom 0% closed = Gladys 100% open');
  assert.equal(toGladysPosition(100), 0, 'Tydom 100% closed = Gladys 0% open (shut)');
  assert.equal(toGladysPosition(30), 70);
  assert.equal(toTydomPosition(100), 0);
  assert.equal(toTydomPosition(0), 100);
  assert.equal(toTydomPosition(70), 30);
});

test('toGladysPosition / toTydomPosition round-trip and clamp out-of-range input', () => {
  for (const p of [0, 1, 50, 99, 100]) {
    assert.equal(toTydomPosition(toGladysPosition(p)), p);
  }
  assert.equal(toGladysPosition(-10), 100);
  assert.equal(toGladysPosition(150), 0);
});

test('buildDevice exposes a SHUTTER state command and a SHUTTER position feature', () => {
  const device = cover.buildDevice(gladys, entry);
  assert.equal(device.external_id, 'cover:10_1');
  const [state, position] = device.features;
  assert.equal(state.category, DEVICE_FEATURE_CATEGORIES.SHUTTER);
  assert.equal(state.type, DEVICE_FEATURE_TYPES.SHUTTER.STATE);
  assert.equal(state.has_feedback, false, 'Tydom reports no distinct moving/stopped status');
  assert.equal(position.type, DEVICE_FEATURE_TYPES.SHUTTER.POSITION);
  assert.equal(position.min, 0);
  assert.equal(position.max, 100);
  assert.equal(position.has_feedback, true);
});

test('onSetValue on the position feature sends the INVERTED Tydom position', async () => {
  const service = fakeService();
  const device = cover.buildDevice(gladys, entry);
  await cover.onSetValue(gladys, service, entry, device.features[1], 70); // 70% open
  assert.deepEqual(service.commands, [{ uniqueId: '10_1', name: 'position', value: 30 }]); // 30% closed
});

test('onSetValue on the state feature maps OPEN/CLOSE/STOP to UP/DOWN/STOP', async () => {
  const service = fakeService();
  const device = cover.buildDevice(gladys, entry);
  await cover.onSetValue(gladys, service, entry, device.features[0], 1);
  await cover.onSetValue(gladys, service, entry, device.features[0], -1);
  await cover.onSetValue(gladys, service, entry, device.features[0], 0);
  assert.deepEqual(
    service.commands.map((c) => c.value),
    ['UP', 'DOWN', 'STOP'],
  );
});

test('onSetValue rejects an unknown feature', async () => {
  const service = fakeService();
  await assert.rejects(() => cover.onSetValue(gladys, service, entry, { external_id: 'nope' }, 1));
});

test('publishUpdate publishes the inverted position only when it changed', () => {
  const withChange = cover.publishUpdate(gladys, entry, ['position'], { position: 40 });
  assert.deepEqual(withChange, [{ featureExternalId: 'cover:10_1:position', value: 60 }]);

  const withoutChange = cover.publishUpdate(gladys, entry, [], { position: 40 });
  assert.deepEqual(withoutChange, []);
});
