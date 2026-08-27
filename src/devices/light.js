// -----------------------------------------------------------------------------
// Device kind: LIGHT (dimmable circuits — Tydom reports a single `level`
// field, 0-100, for both on/off and dimmable lights: 0 is off, anything above
// is on. Exposed as two Gladys features like the template's own light.js:
// ON_OFF derived from `level > 0`, BRIGHTNESS mirroring `level` directly.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

const KIND = 'light';
const logger = createLogger({ name: KIND });

const FEATURE = { ON_OFF: 'on-off', BRIGHTNESS: 'brightness' };

export const light = {
  kind: KIND,

  buildDevice(gladys, entry) {
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    return {
      name: entry.name,
      external_id: ids.device,
      features: [
        {
          name: `${entry.name} - on/off`,
          external_id: ids.feature(FEATURE.ON_OFF),
          category: DEVICE_FEATURE_CATEGORIES.LIGHT,
          type: DEVICE_FEATURE_TYPES.LIGHT.BINARY,
          read_only: false,
          has_feedback: true,
          keep_history: true,
        },
        {
          name: `${entry.name} - brightness`,
          external_id: ids.feature(FEATURE.BRIGHTNESS),
          category: DEVICE_FEATURE_CATEGORIES.LIGHT,
          type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
          unit: DEVICE_FEATURE_UNITS.PERCENT,
          min: 0,
          max: 100,
          read_only: false,
          has_feedback: true,
          keep_history: true,
        },
      ],
    };
  },

  async onSetValue(gladys, service, entry, feature, value) {
    const ids = gladys.externalIds(KIND, entry.uniqueId);

    if (feature.external_id === ids.feature(FEATURE.ON_OFF)) {
      const level = value === 1 ? 100 : 0;
      logger.info(`${entry.name}: ${value === 1 ? 'ON' : 'OFF'} (level -> ${level})`);
      await service.commandDevice(entry.uniqueId, 'level', level);
      return;
    }

    if (feature.external_id === ids.feature(FEATURE.BRIGHTNESS)) {
      const level = Math.round(Math.max(0, Math.min(100, value)));
      logger.info(`${entry.name}: brightness -> ${level}%`);
      await service.commandDevice(entry.uniqueId, 'level', level);
      return;
    }

    throw new Error(`Unknown feature for light ${entry.uniqueId}: ${feature.external_id}`);
  },

  publishUpdate(gladys, entry, changed, values) {
    if (!changed.includes('level')) {
      return [];
    }
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    const level = Math.max(0, Math.min(100, Number(values.level)));
    return [
      { featureExternalId: ids.feature(FEATURE.ON_OFF), value: level > 0 ? 1 : 0 },
      { featureExternalId: ids.feature(FEATURE.BRIGHTNESS), value: level },
    ];
  },
};
