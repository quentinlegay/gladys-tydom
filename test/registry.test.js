import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TydomRegistry, kindForUsage, uniqueId } from '../src/tydom/registry.js';

const CONFIG_PAYLOAD = {
  id_catalog: '1.2.3',
  endpoints: [
    { id_endpoint: 10, id_device: 1, name: 'Volet salon', last_usage: 'shutter' },
    { id_endpoint: 11, id_device: 2, name: 'Lampe salon', last_usage: 'light' },
    { id_endpoint: 12, id_device: 3, name: 'Porte-fenêtre salon', last_usage: 'windowFrench' },
    { id_endpoint: 13, id_device: 4, name: 'Sonde extérieure', last_usage: 'sensorThermo' },
    // Unsupported usage (e.g. an alarm panel): must be discovered but never published.
    { id_endpoint: 14, id_device: 5, name: 'Alarme', last_usage: 'alarm' },
  ],
};

test('kindForUsage maps every supported last_usage and rejects the rest', () => {
  assert.equal(kindForUsage('shutter'), 'cover');
  assert.equal(kindForUsage('klineShutter'), 'cover');
  assert.equal(kindForUsage('awning'), 'cover');
  assert.equal(kindForUsage('light'), 'light');
  assert.equal(kindForUsage('others'), 'light');
  assert.equal(kindForUsage('windowFrench'), 'opening');
  assert.equal(kindForUsage('belmDoor'), 'opening');
  assert.equal(kindForUsage('sensorThermo'), 'temperature');
  assert.equal(kindForUsage('sensorSun'), 'temperature');
  assert.equal(kindForUsage('alarm'), undefined);
  assert.equal(kindForUsage('garage_door'), undefined);
  assert.equal(kindForUsage('boiler'), undefined);
});

test('applyConfig only catalogs supported endpoints', () => {
  const registry = new TydomRegistry();
  const changed = registry.applyConfig(CONFIG_PAYLOAD);
  assert.equal(changed, true);
  const entries = registry.list();
  assert.equal(entries.length, 4, 'the alarm endpoint must not be catalogued');
  assert.ok(!entries.some((e) => e.lastUsage === 'alarm'));
});

test('applyConfig is idempotent and re-applying the same catalog reports no change', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const changedAgain = registry.applyConfig(CONFIG_PAYLOAD);
  assert.equal(changedAgain, false);
  assert.equal(registry.list().length, 4);
});

test('applyConfig drops endpoints that disappeared from a fresh catalog', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const shrunk = { id_catalog: '1.2.4', endpoints: CONFIG_PAYLOAD.endpoints.slice(0, 1) };
  const changed = registry.applyConfig(shrunk);
  assert.equal(changed, true);
  assert.equal(registry.list().length, 1);
  assert.equal(registry.get(uniqueId(11, 2)), undefined, 'the removed light must be gone');
});

test('applyDevicesData ignores an endpoint that was never catalogued', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const updates = registry.applyDevicesData([
    {
      id: 5,
      endpoints: [
        { id: 14, error: 0, data: [{ name: 'alarmMode', value: 'ON', validity: 'upToDate' }] },
      ],
    },
  ]);
  assert.deepEqual(updates, []);
});

test('applyDevicesData tracks only the keywords relevant to the endpoint kind', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const updates = registry.applyDevicesData([
    {
      id: 1,
      endpoints: [
        {
          id: 10,
          error: 0,
          data: [
            { name: 'position', value: 30, validity: 'upToDate' },
            { name: 'thermicDefect', value: 'false', validity: 'upToDate' }, // diagnostic field, not tracked
          ],
        },
      ],
    },
  ]);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].changed, ['position']);
  assert.equal(updates[0].values.position, 30);
  assert.equal(updates[0].values.thermicDefect, undefined);
});

test('applyDevicesData ignores stale (not upToDate) values', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const updates = registry.applyDevicesData([
    {
      id: 1,
      endpoints: [{ id: 10, error: 0, data: [{ name: 'position', value: 30, validity: 'stale' }] }],
    },
  ]);
  assert.deepEqual(updates, []);
});

test('applyDevicesData ignores an endpoint reporting an error', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const updates = registry.applyDevicesData([
    {
      id: 1,
      endpoints: [
        { id: 10, error: 1, data: [{ name: 'position', value: 30, validity: 'upToDate' }] },
      ],
    },
  ]);
  assert.deepEqual(updates, []);
});

test('applyDevicesData only reports keys that actually changed value', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  registry.applyDevicesData([
    {
      id: 1,
      endpoints: [
        { id: 10, error: 0, data: [{ name: 'position', value: 30, validity: 'upToDate' }] },
      ],
    },
  ]);
  const secondUpdates = registry.applyDevicesData([
    {
      id: 1,
      endpoints: [
        { id: 10, error: 0, data: [{ name: 'position', value: 30, validity: 'upToDate' }] },
      ],
    },
  ]);
  assert.deepEqual(secondUpdates, [], 're-sending the same value must not report a change');
  assert.equal(registry.getState(uniqueId(10, 1)).position, 30);
});

test('applyDevicesData accepts a single-device object (no wrapping array)', () => {
  const registry = new TydomRegistry();
  registry.applyConfig(CONFIG_PAYLOAD);
  const updates = registry.applyDevicesData({
    id: 2,
    endpoints: [{ id: 11, error: 0, data: [{ name: 'level', value: 80, validity: 'upToDate' }] }],
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].entry.name, 'Lampe salon');
});
