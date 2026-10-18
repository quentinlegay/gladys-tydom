import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { TydomBridge } from '../src/tydom/bridge.js';
import { TydomWatchdog } from '../src/tydom/watchdog.js';
import { normalizeConfig } from '../src/config.js';
import { COVER_STATE, RESYNC_TOPIC } from '../src/tydom/mapping.js';
import { coverConfig } from './fixtures/discovery.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(t, { answers = true } = {}) {
  const bridge = new EventEmitter();
  bridge.connected = true;
  const calls = { probes: 0, restarts: 0 };
  const watchdog = new TydomWatchdog({
    bridge,
    probe: async () => {
      calls.probes += 1;
      if (answers) setTimeout(() => bridge.emit('activity'), 1);
    },
    restart: async () => {
      calls.restarts += 1;
    },
    commandTimeoutMs: 10,
    probeTimeoutMs: 20,
    idleTimeoutMs: 60_000,
    restartCooldownMs: 60_000,
  });
  watchdog.start();
  t.after(() => watchdog.stop());
  return { bridge, watchdog, calls };
}

test('a command answered by tydom2mqtt neither probes nor restarts', async (t) => {
  const { bridge, calls } = setup(t);
  bridge.emit('command');
  setTimeout(() => bridge.emit('activity'), 2);
  await wait(50);
  assert.deepEqual(calls, { probes: 0, restarts: 0 });
});

test('a silent command probes tydom2mqtt, which is left alone when it answers', async (t) => {
  const { bridge, calls } = setup(t);
  bridge.emit('command');
  await wait(60);
  assert.deepEqual(calls, { probes: 1, restarts: 0 });
});

test('a stuck tydom2mqtt is restarted, once per cooldown', async (t) => {
  const { bridge, calls } = setup(t, { answers: false });
  bridge.emit('command');
  await wait(60);
  assert.deepEqual(calls, { probes: 1, restarts: 1 });

  bridge.emit('command');
  await wait(60);
  assert.deepEqual(calls, { probes: 2, restarts: 1 }, 'cooldown');
});

test('a long silence probes tydom2mqtt', async (t) => {
  const { bridge, watchdog, calls } = setup(t, { answers: false });
  watchdog.timings.idleTimeoutMs = 40;
  watchdog.activity();
  await wait(75);
  assert.equal(calls.probes, 1);
  assert.equal(calls.restarts, 1);
  watchdog.stop();
  assert.equal(bridge.listenerCount('activity'), 0);
});

test('nothing is probed while the broker is down', async (t) => {
  const { bridge, calls } = setup(t, { answers: false });
  bridge.connected = false;
  bridge.emit('command');
  await wait(60);
  assert.deepEqual(calls, { probes: 0, restarts: 0 });
});

test('the bridge reports live tydom2mqtt messages and commands, not replays or echoes', async () => {
  const client = new EventEmitter();
  client.connected = true;
  client.subscribe = (_t, _o, cb) => cb?.(null);
  client.publish = (_topic, _payload, _opts, cb) => cb?.(null);
  client.end = () => {};
  const bridge = new TydomBridge(createFakeGladys(), { debounceMs: 0, connect: () => client });
  bridge.start(normalizeConfig({ mqtt_host: 'localhost' }));
  client.emit('connect');

  const events = [];
  bridge.on('activity', () => events.push('activity'));
  bridge.on('command', () => events.push('command'));
  const send = (topic, payload, retain) =>
    client.emit('message', topic, Buffer.from(JSON.stringify(payload)), { retain });

  send(coverConfig.topic, coverConfig.payload, true);
  assert.deepEqual(events, [], 'retained replay');

  send(coverConfig.topic, coverConfig.payload, false);
  assert.deepEqual(events, ['activity']);

  await wait(5);
  const [device] = bridge.buildDevices();
  const state = device.features.find((f) => f.type === 'shutter-state' || f.type === 'state');
  await bridge.setValue(state.external_id, COVER_STATE.OPEN);
  send(coverConfig.payload.command_topic, 'UP', false);
  await bridge.requestResync();
  send(RESYNC_TOPIC, 'gladys', false);
  assert.deepEqual(events, ['activity', 'command'], 'own publications are not activity');
  bridge.stop();
});
