import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TydomRegistry } from '../src/tydom/registry.js';
import {
  BLUEPRINTS_BY_KIND,
  buildDiscoveredDevices,
  findEntryByDeviceExternalId,
  dispatchSetValue,
  publishStateChange,
} from '../src/devices/index.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function seededRegistry() {
  const registry = new TydomRegistry();
  registry.applyConfig({
    endpoints: [
      { id_endpoint: 10, id_device: 1, name: 'Volet salon', last_usage: 'shutter' },
      { id_endpoint: 11, id_device: 2, name: 'Lampe salon', last_usage: 'light' },
    ],
  });
  return registry;
}

function fakeService(registry) {
  const commands = [];
  return {
    registry,
    commands,
    async commandDevice(uniqueId, name, value) {
      commands.push({ uniqueId, name, value });
    },
  };
}

test('every registered blueprint exposes the required shape', () => {
  for (const blueprint of Object.values(BLUEPRINTS_BY_KIND)) {
    assert.equal(typeof blueprint.kind, 'string');
    assert.equal(typeof blueprint.buildDevice, 'function');
    assert.equal(typeof blueprint.publishUpdate, 'function');
  }
});

test('buildDiscoveredDevices returns one payload per catalog entry, with unique external_ids', () => {
  const gladys = createFakeGladys();
  const registry = seededRegistry();
  const devices = buildDiscoveredDevices(gladys, registry);
  assert.equal(devices.length, 2);
  const ids = devices.map((d) => d.external_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const device of devices) {
    assert.ok(Array.isArray(device.features) && device.features.length > 0);
  }
});

test('buildDiscoveredDevices reflects an empty catalog before Tydom has answered', () => {
  const gladys = createFakeGladys();
  assert.deepEqual(buildDiscoveredDevices(gladys, new TydomRegistry()), []);
});

test('findEntryByDeviceExternalId routes an external_id back to its catalog entry', () => {
  const gladys = createFakeGladys();
  const registry = seededRegistry();
  const [device] = buildDiscoveredDevices(gladys, registry);
  const entry = findEntryByDeviceExternalId(gladys, registry, device.external_id);
  assert.equal(entry.name, 'Volet salon');
});

test('findEntryByDeviceExternalId returns undefined for an unknown device', () => {
  const gladys = createFakeGladys();
  const registry = seededRegistry();
  assert.equal(findEntryByDeviceExternalId(gladys, registry, 'does-not-exist'), undefined);
});

test('dispatchSetValue routes the command to the owning blueprint', async () => {
  const gladys = createFakeGladys();
  const registry = seededRegistry();
  const service = fakeService(registry);
  const [coverDevice] = buildDiscoveredDevices(gladys, registry);
  const positionFeature = coverDevice.features.find((f) => f.external_id.endsWith(':position'));

  await dispatchSetValue(gladys, service, registry, coverDevice, positionFeature, 70);

  assert.deepEqual(service.commands, [{ uniqueId: '10_1', name: 'position', value: 30 }]);
});

test('dispatchSetValue rejects a command for an unknown device', async () => {
  const gladys = createFakeGladys();
  const registry = seededRegistry();
  const service = fakeService(registry);
  await assert.rejects(() =>
    dispatchSetValue(
      gladys,
      service,
      registry,
      { external_id: 'nope' },
      { external_id: 'nope:x' },
      1,
    ),
  );
});

test('publishStateChange calls gladys.publishState for every feature the update touches', async () => {
  const gladys = createFakeGladys();
  const registry = seededRegistry();
  const [update] = registry.applyDevicesData([
    {
      id: 2,
      endpoints: [{ id: 11, error: 0, data: [{ name: 'level', value: 80, validity: 'upToDate' }] }],
    },
  ]);

  await publishStateChange(gladys, update);

  assert.deepEqual(gladys.published, [
    { featureExternalId: 'light:11_2:on-off', state: 1 },
    { featureExternalId: 'light:11_2:brightness', state: 80 },
  ]);
});
