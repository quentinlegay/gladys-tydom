import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  COVER_STATE,
  buildEntity,
  parseDiscoveryTopic,
  parseNumber,
} from '../src/tydom/mapping.js';
import {
  COVER_ID,
  climateConfig,
  coverBatteryConfig,
  coverConfig,
  coverJobsConfig,
  gateConfig,
  lightConfig,
} from './fixtures/discovery.js';

function entityOf({ topic, payload }) {
  const { component, objectId } = parseDiscoveryTopic(topic);
  return buildEntity(component, objectId, payload);
}

function featureOf(entity, suffix) {
  return entity.features.find((f) => f.key === `${entity.component}-${entity.objectId}-${suffix}`);
}

test('parseDiscoveryTopic only accepts tydom discovery topics', () => {
  assert.deepEqual(parseDiscoveryTopic(coverConfig.topic), {
    component: 'cover',
    objectId: COVER_ID,
  });
  assert.equal(parseDiscoveryTopic('homeassistant/cover/zigbee/abc/config'), null);
  assert.equal(parseDiscoveryTopic(`cover/tydom/${COVER_ID}/current_position`), null);
});

test('parseNumber ignores Python None and garbage', () => {
  assert.equal(parseNumber('42'), 42);
  assert.equal(parseNumber('19.5'), 19.5);
  assert.equal(parseNumber('None'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});

test('a shutter gets a state and a position feature', () => {
  const entity = entityOf(coverConfig);
  assert.equal(entity.deviceKey, COVER_ID);
  assert.equal(entity.deviceName, 'Volet salon');

  const state = featureOf(entity, 'state');
  assert.equal(state.feature.category, DEVICE_FEATURE_CATEGORIES.SHUTTER);
  assert.equal(state.feature.type, DEVICE_FEATURE_TYPES.SHUTTER.STATE);
  assert.deepEqual(state.toCommand(COVER_STATE.OPEN), {
    topic: coverConfig.payload.command_topic,
    payload: 'UP',
  });
  assert.deepEqual(state.toCommand(COVER_STATE.CLOSE).payload, 'DOWN');
  assert.deepEqual(state.toCommand(COVER_STATE.STOP).payload, 'STOP');
  assert.throws(() => state.toCommand(5));

  const position = featureOf(entity, 'position');
  assert.equal(position.feature.type, DEVICE_FEATURE_TYPES.SHUTTER.POSITION);
  assert.equal(position.stateTopic, coverConfig.payload.position_topic);
  assert.equal(position.parse('37'), 37);
  assert.deepEqual(position.toCommand(150), {
    topic: coverConfig.payload.set_position_topic,
    payload: '100',
  });
});

test('a light maps on/off and brightness like Home Assistant does', () => {
  const entity = entityOf(lightConfig);
  const binary = featureOf(entity, 'binary');
  const brightness = featureOf(entity, 'brightness');

  assert.equal(binary.parse('0'), 0);
  assert.equal(binary.parse('60'), 1);
  // "on" is a full-brightness order, "off" goes to the levelCmd topic.
  assert.deepEqual(binary.toCommand(1), {
    topic: lightConfig.payload.brightness_command_topic,
    payload: '100',
  });
  assert.deepEqual(binary.toCommand(0), {
    topic: lightConfig.payload.command_topic,
    payload: 'OFF',
  });

  assert.equal(brightness.parse('60'), 60);
  assert.deepEqual(brightness.toCommand(42), {
    topic: lightConfig.payload.brightness_command_topic,
    payload: '42',
  });
});

test('a gate is a switch sending TOGGLE', () => {
  const binary = featureOf(entityOf(gateConfig), 'binary');
  assert.equal(binary.feature.category, DEVICE_FEATURE_CATEGORIES.SWITCH);
  assert.equal(binary.toCommand(1).payload, 'TOGGLE');
  assert.equal(binary.toCommand(0).payload, 'TOGGLE');
});

test('a thermostat exposes its setpoint and its temperature', () => {
  const entity = entityOf(climateConfig);
  const target = featureOf(entity, 'target-temperature');
  assert.equal(target.feature.category, DEVICE_FEATURE_CATEGORIES.THERMOSTAT);
  assert.deepEqual(target.toCommand(19.5), {
    topic: climateConfig.payload.temperature_command_topic,
    payload: '19.5',
  });
  const temperature = featureOf(entity, 'temperature');
  assert.equal(temperature.feature.read_only, true);
  assert.equal(temperature.stateTopic, climateConfig.payload.current_temperature_topic);
});

test('useful sensors are kept and attached to their parent device', () => {
  const battery = entityOf(coverBatteryConfig);
  assert.equal(battery.deviceKey, COVER_ID);
  assert.equal(battery.isMain, false);
  assert.equal(battery.features[0].feature.category, DEVICE_FEATURE_CATEGORIES.BATTERY);
});

test('technical attributes and unknown components are ignored', () => {
  assert.equal(entityOf(coverJobsConfig), null);
  assert.equal(buildEntity('alarm_control_panel', 'x', { state_topic: 'a' }), null);
  assert.equal(buildEntity('cover', 'x', null), null);
});
