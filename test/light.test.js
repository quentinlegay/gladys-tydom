import { test } from 'node:test';
import assert from 'node:assert/strict';
import { light } from '../src/devices/light.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const entry = { uniqueId: '11_2', name: 'Lampe salon' };

function fakeService() {
  const commands = [];
  return {
    commands,
    async commandDevice(uniqueId, name, value) {
      commands.push({ uniqueId, name, value });
    },
  };
}

test('onSetValue ON/OFF drives the Tydom level to 100/0', async () => {
  const service = fakeService();
  const device = light.buildDevice(gladys, entry);
  const [onOff] = device.features;
  await light.onSetValue(gladys, service, entry, onOff, 1);
  await light.onSetValue(gladys, service, entry, onOff, 0);
  assert.deepEqual(
    service.commands.map((c) => c.value),
    [100, 0],
  );
});

test('onSetValue brightness clamps into 0..100 and rounds', async () => {
  const service = fakeService();
  const device = light.buildDevice(gladys, entry);
  const [, brightness] = device.features;
  await light.onSetValue(gladys, service, entry, brightness, 42.6);
  await light.onSetValue(gladys, service, entry, brightness, 150);
  await light.onSetValue(gladys, service, entry, brightness, -5);
  assert.deepEqual(
    service.commands.map((c) => c.value),
    [43, 100, 0],
  );
});

test('publishUpdate derives on/off AND brightness from a single Tydom "level" change', () => {
  const states = light.publishUpdate(gladys, entry, ['level'], { level: 65 });
  assert.deepEqual(states, [
    { featureExternalId: 'light:11_2:on-off', value: 1 },
    { featureExternalId: 'light:11_2:brightness', value: 65 },
  ]);
});

test('publishUpdate reports off when level drops to 0', () => {
  const states = light.publishUpdate(gladys, entry, ['level'], { level: 0 });
  assert.deepEqual(states[0], { featureExternalId: 'light:11_2:on-off', value: 0 });
});

test('publishUpdate is a no-op when level did not change', () => {
  assert.deepEqual(light.publishUpdate(gladys, entry, [], { level: 65 }), []);
});
