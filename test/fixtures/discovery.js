// Discovery payloads exactly as tydom2mqtt publishes them (see its
// app/sensors/*.py), for a Tydom endpoint "1612345678_1612345678".

export const COVER_ID = '1612345678_1612345678';
export const LIGHT_ID = '1698765432_1698765432';
export const GATE_ID = '1611111111_1611111111';
export const BOILER_ID = '1622222222_1622222222';

export const coverConfig = {
  topic: `homeassistant/cover/tydom/${COVER_ID}/config`,
  payload: {
    name: null,
    unique_id: COVER_ID,
    command_topic: `cover/tydom/${COVER_ID}/set_positionCmd`,
    set_position_topic: `cover/tydom/${COVER_ID}/set_position`,
    position_topic: `cover/tydom/${COVER_ID}/current_position`,
    payload_open: 'UP',
    payload_close: 'DOWN',
    payload_stop: 'STOP',
    retain: 'false',
    device: {
      manufacturer: 'Delta Dore',
      model: 'Volet',
      name: 'Volet salon',
      identifiers: COVER_ID,
    },
    device_class: 'shutter',
    json_attributes_topic: `cover/tydom/${COVER_ID}/attributes`,
  },
};

export const lightConfig = {
  topic: `homeassistant/light/tydom/${LIGHT_ID}/config`,
  payload: {
    name: null,
    brightness_scale: 100,
    unique_id: LIGHT_ID,
    optimistic: true,
    brightness_state_topic: `light/tydom/${LIGHT_ID}/current_level`,
    brightness_command_topic: `light/tydom/${LIGHT_ID}/set_level`,
    command_topic: `light/tydom/${LIGHT_ID}/set_levelCmd`,
    state_topic: `light/tydom/${LIGHT_ID}/current_level`,
    json_attributes_topic: `light/tydom/${LIGHT_ID}/attributes`,
    payload_off: 'OFF',
    payload_on: 'ON',
    on_command_type: 'brightness',
    retain: 'false',
    device: {
      manufacturer: 'Delta Dore',
      model: 'Lumiere',
      name: 'Plafonnier',
      identifiers: LIGHT_ID,
    },
  },
};

export const gateConfig = {
  topic: `homeassistant/switch/tydom/${GATE_ID}/config`,
  payload: {
    name: null,
    unique_id: GATE_ID,
    command_topic: `switch/tydom/${GATE_ID}/set_levelCmdGate`,
    state_topic: `switch/tydom/${GATE_ID}/state`,
    json_attributes_topic: `switch/tydom/${GATE_ID}/attributes`,
    payload_on: 'TOGGLE',
    payload_off: 'TOGGLE',
    retain: 'false',
    device: { manufacturer: 'Delta Dore', model: 'Porte', name: 'Portail', identifiers: GATE_ID },
  },
};

export const climateConfig = {
  topic: `homeassistant/climate/tydom/${BOILER_ID}/config`,
  payload: {
    name: null,
    temperature_command_topic: `climate/tydom/${BOILER_ID}/set_setpoint`,
    temperature_state_topic: `climate/tydom/${BOILER_ID}/setpoint`,
    current_temperature_topic: `climate/tydom/${BOILER_ID}/temperature`,
    modes: ['off', 'heat', 'cool'],
    mode_state_topic: `climate/tydom/${BOILER_ID}/hvacMode`,
    mode_command_topic: `climate/tydom/${BOILER_ID}/set_hvacMode`,
    unique_id: BOILER_ID,
  },
};

// One of the per-attribute sensors attached to the shutter device.
export const coverBatteryConfig = {
  topic: `homeassistant/sensor/tydom/battlevel_tydom_${COVER_ID}/config`,
  payload: {
    name: 'battLevel',
    unique_id: `battLevel_tydom_${COVER_ID}`,
    device: {
      manufacturer: 'Delta Dore',
      identifiers: COVER_ID,
      model: 'Sensor',
      name: 'Volet salon',
    },
    state_topic: `sensor/tydom/battLevel_tydom_${COVER_ID}/state`,
  },
};

// A technical attribute: must be ignored.
export const coverJobsConfig = {
  topic: `homeassistant/sensor/tydom/jobsmp_tydom_${COVER_ID}/config`,
  payload: {
    name: 'jobsMP',
    unique_id: `jobsMP_tydom_${COVER_ID}`,
    device: {
      manufacturer: 'Delta Dore',
      identifiers: COVER_ID,
      model: 'Sensor',
      name: 'Volet salon',
    },
    state_topic: `sensor/tydom/jobsMP_tydom_${COVER_ID}/state`,
  },
};
