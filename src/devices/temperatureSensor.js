// -----------------------------------------------------------------------------
// Device kind: TEMPERATURE SENSOR (read-only outdoor probe, `outTemperature`).
// Wired to a shutter or dusk controller on some Tydom installs — a bonus on
// top of the "Volets" ask, not the main feature.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

const KIND = 'temperature';
const logger = createLogger({ name: KIND });

const FEATURE = { TEMPERATURE: 'temperature' };

export const temperatureSensor = {
  kind: KIND,

  buildDevice(gladys, entry) {
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    return {
      name: entry.name,
      external_id: ids.device,
      features: [
        {
          name: entry.name,
          external_id: ids.feature(FEATURE.TEMPERATURE),
          category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
          unit: DEVICE_FEATURE_UNITS.CELSIUS,
          min: -50,
          max: 80,
          read_only: true,
          has_feedback: true,
          keep_history: true,
        },
      ],
    };
  },

  publishUpdate(gladys, entry, changed, values) {
    if (!changed.includes('outTemperature')) {
      return [];
    }
    const temperature = Number(values.outTemperature);
    if (Number.isNaN(temperature)) {
      logger.warn(`${entry.name}: non-numeric outTemperature (${values.outTemperature}), ignored`);
      return [];
    }
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    return [{ featureExternalId: ids.feature(FEATURE.TEMPERATURE), value: temperature }];
  },
};
