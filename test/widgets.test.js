import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { TydomBridge } from '../src/tydom/bridge.js';
import { normalizeConfig } from '../src/config.js';
import { COVER_STATE } from '../src/tydom/mapping.js';
import {
  RefreshThrottle,
  WIDGET_KEYS,
  buildBatteriesWidget,
  buildDeviceWidget,
  buildShutterWidget,
  buildShuttersWidget,
  registerWidgets,
} from '../src/widgets.js';
import {
  BOILER_ID,
  COVER_ID,
  LIGHT_ID,
  climateConfig,
  coverBatteryConfig,
  coverConfig,
  lightConfig,
} from './fixtures/discovery.js';

function createFakeMqtt() {
  const client = new EventEmitter();
  client.connected = true;
  client.publications = [];
  client.subscribe = (_topics, _opts, cb) => cb?.(null);
  client.publish = (topic, payload, _opts, cb) => {
    client.publications.push({ topic, payload });
    cb?.(null);
  };
  client.end = () => {};
  client.receive = (topic, payload) =>
    client.emit(
      'message',
      topic,
      Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    );
  return client;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

// A bridge fed with the fixtures, whose devices were all added in Gladys.
async function setup() {
  const discovery = createFakeGladys();
  const client = createFakeMqtt();
  const probe = new TydomBridge(discovery, { debounceMs: 0, connect: () => client });
  probe.start(normalizeConfig({ mqtt_host: 'h' }));
  for (const fixture of [coverConfig, coverBatteryConfig, lightConfig, climateConfig]) {
    client.receive(fixture.topic, fixture.payload);
  }
  await flush();
  const devices = probe.buildDevices().map((d) => ({ ...d, name: `${d.name} (Gladys)` }));
  probe.stop();

  const gladys = createFakeGladys({ devices });
  const bridge = new TydomBridge(gladys, { debounceMs: 0, connect: () => client });
  bridge.start(normalizeConfig({ mqtt_host: 'h' }));
  for (const fixture of [coverConfig, coverBatteryConfig, lightConfig, climateConfig]) {
    client.receive(fixture.topic, fixture.payload);
  }
  await flush();
  const throttle = registerWidgets(gladys, bridge, { intervalMs: 0 });
  await gladys.connect();
  const ids = (id) => gladys.externalIds('endpoint', id);
  return { gladys, client, bridge, throttle, devices, ids };
}

async function content(gladys, key, options) {
  const ack = await gladys.fake.widgetGet(key, options);
  assert.ok(ack.success, JSON.stringify(ack));
  const result = ack.data.content;
  assert.deepEqual(validateWidgetContent(result), [], 'the core renders it exactly as sent');
  return result;
}

test('device widget: live tiles, chart and controls of a shutter', async () => {
  const { gladys, bridge, throttle, ids } = await setup();
  const cover = ids(COVER_ID);
  const result = await content(gladys, WIDGET_KEYS.DEVICE, { settings: { device: cover.device } });

  const types = result.components.map((c) => c.type);
  assert.deepEqual(types, ['gauge', 'value', 'chart', 'button', 'button', 'button']);
  const buttons = result.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.value),
    [COVER_STATE.OPEN, COVER_STATE.STOP, COVER_STATE.CLOSE],
  );
  for (const component of result.components) {
    const refs = component.device_features ?? [component.device_feature];
    for (const ref of refs) assert.ok(ref.startsWith(cover.device), `${ref} is a cover feature`);
  }
  throttle.stop();
  bridge.stop();
});

test('device widget: a deleted device says so instead of failing', async () => {
  const { gladys, bridge, throttle } = await setup();
  const result = await content(gladys, WIDGET_KEYS.DEVICE, { settings: { device: 'gone' } });
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].type, 'text');
  throttle.stop();
  bridge.stop();
});

test('device widget: the setpoint buttons move the thermostat by half a degree', async () => {
  const { gladys, client, bridge, throttle, ids } = await setup();
  const boiler = ids(BOILER_ID);
  client.receive(climateConfig.payload.temperature_state_topic, '19.5');
  await flush();

  const result = await content(gladys, WIDGET_KEYS.DEVICE, { settings: { device: boiler.device } });
  const actions = result.components.filter((c) => c.action).map((c) => c.action);
  assert.deepEqual(
    actions.map((a) => a.key),
    ['setpoint_down', 'setpoint_up'],
  );

  const ack = await gladys.fake.widgetAction(
    WIDGET_KEYS.DEVICE,
    'setpoint_up',
    {},
    {
      settings: { device: boiler.device },
    },
  );
  assert.ok(ack.success, JSON.stringify(ack));
  assert.deepEqual(client.publications.at(-1), {
    topic: climateConfig.payload.temperature_command_topic,
    payload: '20',
  });
  throttle.stop();
  bridge.stop();
});

test('shutter widget: live position, open / stop / close and a position form', async () => {
  const { gladys, client, bridge, throttle, ids } = await setup();
  const cover = ids(COVER_ID);
  client.receive(coverConfig.payload.position_topic, '40');
  await flush();

  const result = await content(gladys, WIDGET_KEYS.SHUTTER, { settings: { device: cover.device } });
  assert.deepEqual(
    result.components.map((c) => c.type),
    ['gauge', 'value', 'chart', 'button', 'button', 'button', 'button'],
  );
  const buttons = result.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.slice(0, 3).map((b) => b.value),
    [COVER_STATE.OPEN, COVER_STATE.STOP, COVER_STATE.CLOSE],
  );
  const form = buttons[3].action;
  assert.equal(form.key, 'set_position');
  assert.deepEqual(
    form.fields.map((f) => [f.key, f.min, f.max, f.default]),
    [['position', 0, 100, 40]],
  );

  const ack = await gladys.fake.widgetAction(
    WIDGET_KEYS.SHUTTER,
    'set_position',
    {},
    { settings: { device: cover.device }, values: { position: 65 } },
  );
  assert.ok(ack.success, JSON.stringify(ack));
  assert.deepEqual(client.publications.at(-1), {
    topic: coverConfig.payload.set_position_topic,
    payload: '65',
  });
  throttle.stop();
  bridge.stop();
});

test('shutter widget: refuses an action without values or on a non-shutter', async () => {
  const { gladys, client, bridge, throttle, ids } = await setup();
  const cover = ids(COVER_ID);
  const before = client.publications.length;
  const noValues = await gladys.fake.widgetAction(
    WIDGET_KEYS.SHUTTER,
    'set_position',
    {},
    { settings: { device: cover.device } },
  );
  assert.equal(noValues.success, false);
  assert.equal(client.publications.length, before);

  const light = ids(LIGHT_ID);
  const result = await content(gladys, WIDGET_KEYS.SHUTTER, { settings: { device: light.device } });
  assert.deepEqual(
    result.components.map((c) => c.type),
    ['text'],
  );
  throttle.stop();
  bridge.stop();
});

test('shutters widget: positions, counters and the "all" buttons', async () => {
  const { gladys, client, bridge, throttle } = await setup();
  client.receive(coverConfig.payload.position_topic, '40');
  await flush();

  const result = await content(gladys, WIDGET_KEYS.SHUTTERS, { language: 'fr' });
  const status = result.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.value]),
    [['Volet salon (Gladys)', '40 %']],
  );
  const opened = result.components.find((c) => c.type === 'value');
  assert.equal(opened.value, 1);

  const ack = await gladys.fake.widgetAction(WIDGET_KEYS.SHUTTERS, 'close', {}, { settings: {} });
  assert.ok(ack.success, JSON.stringify(ack));
  assert.deepEqual(client.publications.at(-1), {
    topic: coverConfig.payload.command_topic,
    payload: 'DOWN',
  });
  throttle.stop();
  bridge.stop();
});

test('shutters widget: a position change nudges a refresh', async () => {
  const { gladys, client, bridge, throttle } = await setup();
  client.receive(coverConfig.payload.position_topic, '70');
  client.receive(lightConfig.payload.state_topic, '50');
  await flush();
  assert.deepEqual(gladys.fake.widgetRefreshes.sort(), [WIDGET_KEYS.SHUTTER, WIDGET_KEYS.SHUTTERS]);
  throttle.stop();
  bridge.stop();
});

test('batteries widget: weakest first, low ones counted', async () => {
  const { gladys, client, bridge, throttle } = await setup();
  client.receive(coverBatteryConfig.payload.state_topic, '10');
  await flush();
  const result = await content(gladys, WIDGET_KEYS.BATTERIES);
  const [toReplace] = result.components;
  assert.equal(toReplace.value, 1);
  assert.equal(toReplace.color, 'danger');
  const status = result.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => i.value),
    ['10 %'],
  );
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGET_KEYS.BATTERIES));
  throttle.stop();
  bridge.stop();
});

// --- Pure builders --------------------------------------------------------------

const battery = (id, level) => ({
  name: id,
  external_id: id,
  features: [{ external_id: `${id}:b`, category: 'battery', type: 'integer', last_value: level }],
});

test('batteries widget: the "only low" setting hides the healthy ones', () => {
  const devices = [battery('a', 90), battery('b', 25), battery('c', 5)];
  const result = buildBatteriesWidget(devices, new Map(), { settings: { only_low: true } });
  assert.deepEqual(validateWidgetContent(result), []);
  const status = result.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((i) => [i.label, i.color]),
    [
      ['c', 'danger'],
      ['b', 'warning'],
    ],
  );

  const healthy = buildBatteriesWidget([battery('a', 90)], new Map(), {
    settings: { only_low: true },
  });
  assert.equal(healthy.components.at(-1).type, 'text');
});

test('the status lists stay within the content budget', () => {
  const devices = Array.from({ length: 14 }, (_, i) => battery(`d${i}`, i));
  const result = buildBatteriesWidget(devices, new Map());
  assert.deepEqual(validateWidgetContent(result), []);
  assert.equal(result.components.find((c) => c.type === 'status').items.length, 10);
});

test('empty states are valid contents', () => {
  for (const result of [
    buildDeviceWidget(undefined),
    buildShutterWidget(undefined),
    buildShuttersWidget([], new Map()),
    buildBatteriesWidget([], new Map()),
  ]) {
    assert.deepEqual(validateWidgetContent(result), []);
    assert.equal(result.components[0].type, 'text');
  }
});

test('refresh throttle: one nudge per interval, the last change never lost', async () => {
  const sent = [];
  const throttle = new RefreshThrottle(
    { requestWidgetRefresh: (k) => sent.push(k) },
    {
      intervalMs: 30,
    },
  );
  throttle.request('shutters');
  throttle.request('shutters');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(sent, ['shutters']);
  throttle.request('shutters');
  throttle.request('shutters');
  assert.deepEqual(sent, ['shutters'], 'held during the quiet period');
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(sent, ['shutters', 'shutters']);
  throttle.stop();
});
