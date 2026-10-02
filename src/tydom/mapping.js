// -----------------------------------------------------------------------------
// tydom2mqtt -> Gladys mapping.
//
// tydom2mqtt announces every Tydom entity with a Home Assistant MQTT discovery
// message (retained), on `homeassistant/<component>/tydom/<object_id>/config`.
// The JSON payload carries the state and command topics of the entity, so we
// never hard-code tydom2mqtt topic layouts: we read them from the discovery.
//
// This module is PURE: it turns one discovery message into an "entity" — the
// Gladys features it provides, where their state is read and how a Gladys value
// becomes an MQTT command. Grouping entities into devices is catalog.js's job.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

export const DISCOVERY_TOPIC = 'homeassistant/+/tydom/+/config';
// Every state topic of tydom2mqtt has `tydom` as its second level.
export const STATE_TOPICS = '+/tydom/#';
// tydom2mqtt reloads the whole Tydom configuration and republishes every
// device when it receives a message on a `+/tydom/#` topic containing "update".
export const RESYNC_TOPIC = 'gladys/tydom/update';

// Gladys shutter command values (the `state` feature of a shutter).
export const COVER_STATE = { OPEN: 1, STOP: 0, CLOSE: -1 };

const DISCOVERY_TOPIC_REGEX = /^homeassistant\/([^/]+)\/tydom\/([^/]+)\/config$/;

/**
 * @param {string} topic
 * @returns {{ component: string, objectId: string } | null}
 */
export function parseDiscoveryTopic(topic) {
  const match = DISCOVERY_TOPIC_REGEX.exec(topic);
  return match ? { component: match[1], objectId: match[2] } : null;
}

// --- State parsers: MQTT payload (string) -> Gladys value, null to ignore ---

export function parseNumber(payload) {
  const text = String(payload).trim();
  if (text === '' || text === 'None' || text === 'null') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseLevelAsBinary(payload) {
  const text = String(payload).trim().toUpperCase();
  if (text === 'ON' || text === 'TRUE') return 1;
  if (text === 'OFF' || text === 'FALSE') return 0;
  const value = parseNumber(payload);
  return value === null ? null : value > 0 ? 1 : 0;
}

function parseOnOff(payload) {
  const text = String(payload).trim().toUpperCase();
  if (text === 'ON' || text === 'TRUE' || text === '1') return 1;
  if (text === 'OFF' || text === 'FALSE' || text === '0') return 0;
  return null;
}

function command(topic, payload) {
  return { topic, payload: String(payload) };
}

// --- One builder per Home Assistant component ---------------------------------

function coverFeatures(config) {
  const features = [];
  if (config.command_topic) {
    // Open / close / stop. No state topic: Tydom only reports the position.
    features.push({
      key: 'state',
      feature: {
        name: 'State',
        category: CATEGORIES.SHUTTER,
        type: TYPES.SHUTTER.STATE,
        min: COVER_STATE.CLOSE,
        max: COVER_STATE.OPEN,
        read_only: false,
        has_feedback: false,
        keep_history: false,
      },
      toCommand(value) {
        const payloads = {
          [COVER_STATE.OPEN]: config.payload_open ?? 'UP',
          [COVER_STATE.CLOSE]: config.payload_close ?? 'DOWN',
          [COVER_STATE.STOP]: config.payload_stop ?? 'STOP',
        };
        const payload = payloads[value];
        if (payload === undefined) throw new Error(`Invalid shutter state: ${value}`);
        return command(config.command_topic, payload);
      },
    });
  }
  if (config.position_topic) {
    // Tydom and Gladys agree: 0 = closed, 100 = open.
    features.push({
      key: 'position',
      stateTopic: config.position_topic,
      parse: parseNumber,
      feature: {
        name: 'Position',
        category: CATEGORIES.SHUTTER,
        type: TYPES.SHUTTER.POSITION,
        unit: UNITS.PERCENT,
        min: 0,
        max: 100,
        read_only: !config.set_position_topic,
        has_feedback: true,
        keep_history: true,
      },
      toCommand: config.set_position_topic
        ? (value) => command(config.set_position_topic, Math.round(clamp(value, 0, 100)))
        : undefined,
    });
  }
  return features;
}

function lightFeatures(config) {
  const features = [];
  const scale = Number(config.brightness_scale) || 100;
  if (config.command_topic) {
    features.push({
      key: 'binary',
      stateTopic: config.state_topic,
      parse: parseLevelAsBinary,
      feature: {
        name: 'On/Off',
        category: CATEGORIES.LIGHT,
        type: TYPES.LIGHT.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      toCommand(value) {
        // Same as Home Assistant with `on_command_type: brightness`: "on" is a
        // full-brightness order, "off" goes to the command topic.
        if (value === 1 && config.brightness_command_topic) {
          return command(config.brightness_command_topic, scale);
        }
        return command(
          config.command_topic,
          value === 1 ? (config.payload_on ?? 'ON') : (config.payload_off ?? 'OFF'),
        );
      },
    });
  }
  if (config.brightness_command_topic) {
    features.push({
      key: 'brightness',
      stateTopic: config.brightness_state_topic,
      parse: (payload) => {
        const value = parseNumber(payload);
        return value === null ? null : Math.round((value / scale) * 100);
      },
      feature: {
        name: 'Brightness',
        category: CATEGORIES.LIGHT,
        type: TYPES.LIGHT.BRIGHTNESS,
        unit: UNITS.PERCENT,
        min: 0,
        max: 100,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      toCommand: (value) =>
        command(config.brightness_command_topic, Math.round((clamp(value, 0, 100) / 100) * scale)),
    });
  }
  return features;
}

function switchFeatures(config) {
  if (!config.command_topic) return [];
  // Tydom gates/doors are impulse-driven: both payloads are usually TOGGLE.
  return [
    {
      key: 'binary',
      stateTopic: config.state_topic,
      parse: parseLevelAsBinary,
      feature: {
        name: 'On/Off',
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      toCommand: (value) =>
        command(
          config.command_topic,
          value === 1 ? (config.payload_on ?? 'ON') : (config.payload_off ?? 'OFF'),
        ),
    },
  ];
}

function climateFeatures(config) {
  const features = [];
  if (config.temperature_command_topic) {
    features.push({
      key: 'target-temperature',
      stateTopic: config.temperature_state_topic,
      parse: parseNumber,
      feature: {
        name: 'Target temperature',
        category: CATEGORIES.THERMOSTAT,
        type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: Number(config.min_temp) || 7,
        max: Number(config.max_temp) || 30,
        step: 0.5,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      toCommand: (value) => command(config.temperature_command_topic, value),
    });
  }
  if (config.current_temperature_topic) {
    features.push({
      key: 'temperature',
      stateTopic: config.current_temperature_topic,
      parse: parseNumber,
      feature: {
        name: 'Temperature',
        category: CATEGORIES.TEMPERATURE_SENSOR,
        type: TYPES.SENSOR.DECIMAL,
        unit: UNITS.CELSIUS,
        min: -50,
        max: 100,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    });
  }
  return features;
}

// tydom2mqtt publishes one `sensor` per Tydom attribute (dozens per device,
// most of them technical). Only the measurements Gladys can use are kept.
function sensorKind(config) {
  const name = String(config.name ?? '');
  const unit = config.unit_of_measurement;
  if (config.device_class === 'battery' || /^batt(ery)?Level$/i.test(name)) {
    return { category: CATEGORIES.BATTERY, type: TYPES.BATTERY.INTEGER, unit: UNITS.PERCENT };
  }
  if (unit === '°C' && name !== 'setpoint') {
    return {
      category: CATEGORIES.TEMPERATURE_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.CELSIUS,
    };
  }
  if (unit === '%' && (config.device_class === 'humidity' || /humidity/i.test(name))) {
    return {
      category: CATEGORIES.HUMIDITY_SENSOR,
      type: TYPES.SENSOR.DECIMAL,
      unit: UNITS.PERCENT,
    };
  }
  const energy = {
    W: [TYPES.ENERGY_SENSOR.POWER, UNITS.WATT],
    kW: [TYPES.ENERGY_SENSOR.POWER, UNITS.KILOWATT],
    Wh: [TYPES.ENERGY_SENSOR.ENERGY, UNITS.WATT_HOUR],
    kWh: [TYPES.ENERGY_SENSOR.ENERGY, UNITS.KILOWATT_HOUR],
    A: [TYPES.ENERGY_SENSOR.CURRENT, UNITS.AMPERE],
    V: [TYPES.ENERGY_SENSOR.VOLTAGE, UNITS.VOLT],
  }[unit];
  if (energy) {
    return { category: CATEGORIES.ENERGY_SENSOR, type: energy[0], unit: energy[1] };
  }
  return null;
}

function sensorFeatures(config) {
  const kind = config.state_topic ? sensorKind(config) : null;
  if (!kind) return [];
  return [
    {
      key: 'value',
      stateTopic: config.state_topic,
      parse: parseNumber,
      feature: {
        name: String(config.name ?? 'Sensor'),
        ...kind,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    },
  ];
}

function binarySensorFeatures(config) {
  if (!config.state_topic) return [];
  const name = String(config.name ?? '');
  let kind = null;
  if (/^battDefect$/i.test(name)) {
    kind = { category: CATEGORIES.BATTERY_LOW, type: TYPES.BATTERY_LOW.BINARY };
  } else if (config.device_class === 'motion') {
    kind = { category: CATEGORIES.MOTION_SENSOR, type: TYPES.SENSOR.BINARY };
  }
  if (!kind) return [];
  return [
    {
      key: 'value',
      stateTopic: config.state_topic,
      parse: parseOnOff,
      feature: {
        name,
        ...kind,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    },
  ];
}

const BUILDERS = {
  cover: coverFeatures,
  light: lightFeatures,
  switch: switchFeatures,
  climate: climateFeatures,
  sensor: sensorFeatures,
  binary_sensor: binarySensorFeatures,
};

/**
 * Turn one discovery message into an entity, or `null` when nothing in it is
 * usable by Gladys (unsupported component, technical attribute…).
 * @param {string} component  Home Assistant component (cover, light…)
 * @param {string} objectId   object id of the discovery topic
 * @param {Record<string, any>} config  parsed discovery payload
 */
export function buildEntity(component, objectId, config) {
  const builder = BUILDERS[component];
  if (!builder || !config || typeof config !== 'object') return null;
  const features = builder(config);
  if (features.length === 0) return null;

  const identifiers = config.device?.identifiers;
  const deviceKey = String((Array.isArray(identifiers) ? identifiers[0] : identifiers) ?? objectId);
  // Feature keys must be unique within a device: several entities share one.
  const prefix = `${component}-${objectId}`;
  return {
    component,
    objectId,
    deviceKey,
    deviceName: config.device?.name ?? config.name ?? deviceKey,
    // The main entity (name null in the discovery) names the Gladys device.
    isMain: component !== 'sensor' && component !== 'binary_sensor',
    features: features.map((f) => ({ ...f, key: `${prefix}-${f.key}` })),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}
