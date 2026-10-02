import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TydomBridge } from '../src/tydom/bridge.js';
import { normalizeConfig } from '../src/config.js';
import { RESYNC_TOPIC } from '../src/tydom/mapping.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { COVER_ID, coverBatteryConfig, coverConfig, lightConfig } from './fixtures/discovery.js';

// In-memory MQTT client: records publications and lets the test push messages.
function createFakeMqtt() {
  const client = new EventEmitter();
  client.connected = false;
  client.publications = [];
  client.subscribe = (_topics, _opts, cb) => cb?.(null);
  client.publish = (topic, payload, _opts, cb) => {
    client.publications.push({ topic, payload });
    cb?.(null);
  };
  client.end = () => {
    client.connected = false;
  };
  client.receive = (topic, payload) =>
    client.emit(
      'message',
      topic,
      Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    );
  return client;
}

function setup() {
  const gladys = createFakeGladys();
  const client = createFakeMqtt();
  let connectArgs;
  const bridge = new TydomBridge(gladys, {
    debounceMs: 0,
    connect: (...args) => {
      connectArgs = args;
      return client;
    },
  });
  bridge.start(
    normalizeConfig({ mqtt_host: '192.168.1.51', mqtt_user: 'gladys', mqtt_password: 'pwd' }),
  );
  client.connected = true;
  client.emit('connect');
  return { gladys, client, bridge, connectArgs };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

test('connects to the configured broker with the credentials', () => {
  const { connectArgs, bridge } = setup();
  assert.equal(connectArgs[0], 'mqtt://192.168.1.51:1883');
  assert.equal(connectArgs[1].username, 'gladys');
  assert.equal(connectArgs[1].password, 'pwd');
  bridge.stop();
});

test('discovery messages become one Gladys device per Tydom endpoint', async () => {
  const { client, bridge } = setup();
  const announced = new Promise((resolve) => bridge.once('devices', resolve));
  client.receive(coverConfig.topic, coverConfig.payload);
  client.receive(coverBatteryConfig.topic, coverBatteryConfig.payload);
  client.receive(lightConfig.topic, lightConfig.payload);
  const devices = await announced;

  assert.equal(devices.length, 2);
  const cover = devices.find((d) => d.external_id === `endpoint:${COVER_ID}`);
  assert.equal(cover.name, 'Volet salon');
  assert.equal(cover.features.length, 3, 'state + position + battery');
  bridge.stop();
});

test('states are forwarded to Gladys, including those received before the discovery', async () => {
  const { client, gladys, bridge } = setup();
  client.receive(coverConfig.payload.position_topic, '30');
  client.receive(coverConfig.topic, coverConfig.payload);
  await flush();
  client.receive(coverConfig.payload.position_topic, '75');
  await flush();

  const positions = gladys.published.filter((p) => p.featureExternalId.endsWith('-position'));
  assert.deepEqual(
    positions.map((p) => p.state),
    [30, 75],
  );
  bridge.stop();
});

test('Gladys commands are published on the tydom2mqtt command topics', async () => {
  const { client, gladys, bridge } = setup();
  client.receive(coverConfig.topic, coverConfig.payload);
  await flush();
  const [cover] = bridge.buildDevices();
  const state = cover.features.find((f) => f.external_id.endsWith('-state'));
  const position = cover.features.find((f) => f.external_id.endsWith('-position'));

  await bridge.setValue(state.external_id, -1);
  await bridge.setValue(position.external_id, 40);

  assert.deepEqual(client.publications, [
    { topic: coverConfig.payload.command_topic, payload: 'DOWN' },
    { topic: coverConfig.payload.set_position_topic, payload: '40' },
  ]);
  // No state topic for open/close/stop: the order itself is reflected.
  assert.deepEqual(gladys.published.at(-1), { featureExternalId: state.external_id, state: -1 });
  bridge.stop();
});

test('commands fail loudly when they cannot be delivered', async () => {
  const { client, bridge } = setup();
  await assert.rejects(bridge.setValue('endpoint:unknown:feature', 1), /Unknown Tydom feature/);
  client.receive(coverConfig.topic, coverConfig.payload);
  await flush();
  const [cover] = bridge.buildDevices();
  client.connected = false;
  await assert.rejects(bridge.setValue(cover.features[0].external_id, 1), /not connected/);
  bridge.stop();
});

test('an empty discovery payload removes the entity', async () => {
  const { client, bridge } = setup();
  client.receive(coverConfig.topic, coverConfig.payload);
  await flush();
  assert.equal(bridge.buildDevices().length, 1);
  client.receive(coverConfig.topic, '');
  await flush();
  assert.equal(bridge.buildDevices().length, 0);
  bridge.stop();
});

test('requestResync asks tydom2mqtt to republish everything', async () => {
  const { client, bridge } = setup();
  await bridge.requestResync();
  assert.equal(client.publications[0].topic, RESYNC_TOPIC);
  bridge.stop();
});
