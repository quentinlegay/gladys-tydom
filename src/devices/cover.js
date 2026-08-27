// -----------------------------------------------------------------------------
// Device kind: COVER (shutters, blinds, awnings — the "Volets" of the ask).
//
// Tydom's own `position` field is the percentage CLOSED (0 = fully open,
// 100 = fully closed — see tydom2mqtt's put_devices_data comment: "For
// shutter, value is the percentage of closing"). Gladys' SHUTTER.POSITION is
// the opposite convention, the percentage OPEN (0 = closed, 100 = open, the
// same one Home Assistant / zigbee2mqtt covers use in Gladys' own mqtt
// service). toGladysPosition/toTydomPosition below invert one into the other
// so this is the ONLY place that conversion happens.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

const KIND = 'cover';
const logger = createLogger({ name: KIND });

const FEATURE = { STATE: 'state', POSITION: 'position' };

// Mirrors Gladys' own COVER_STATE (server/utils/constants.js): STOP=0, OPEN=1, CLOSE=-1.
const COVER_STATE = { STOP: 0, OPEN: 1, CLOSE: -1 };
const POSITION_CMD_BY_STATE = {
  [COVER_STATE.OPEN]: 'UP',
  [COVER_STATE.CLOSE]: 'DOWN',
  [COVER_STATE.STOP]: 'STOP',
};

/** Tydom "percentage closed" -> Gladys "percentage open". Pure, symmetrical. */
export function toGladysPosition(tydomPosition) {
  const clamped = Math.max(0, Math.min(100, Number(tydomPosition)));
  return 100 - clamped;
}

/** Gladys "percentage open" -> Tydom "percentage closed". Pure, symmetrical. */
export function toTydomPosition(gladysPosition) {
  const clamped = Math.max(0, Math.min(100, Number(gladysPosition)));
  return Math.round(100 - clamped);
}

export const cover = {
  kind: KIND,

  buildDevice(gladys, entry) {
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    return {
      name: entry.name,
      external_id: ids.device,
      features: [
        {
          name: `${entry.name} - open/close`,
          external_id: ids.feature(FEATURE.STATE),
          category: DEVICE_FEATURE_CATEGORIES.SHUTTER,
          type: DEVICE_FEATURE_TYPES.SHUTTER.STATE,
          min: COVER_STATE.CLOSE,
          max: COVER_STATE.OPEN,
          read_only: false,
          // Tydom does not report back a "currently opening/closing/stopped"
          // status distinct from `position`: this is a command-only feature.
          has_feedback: false,
          keep_history: false,
        },
        {
          name: `${entry.name} - position`,
          external_id: ids.feature(FEATURE.POSITION),
          category: DEVICE_FEATURE_CATEGORIES.SHUTTER,
          type: DEVICE_FEATURE_TYPES.SHUTTER.POSITION,
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

    if (feature.external_id === ids.feature(FEATURE.STATE)) {
      const cmd = POSITION_CMD_BY_STATE[value];
      if (!cmd) {
        throw new Error(`Unknown cover state command: ${value}`);
      }
      logger.info(`${entry.name}: positionCmd -> ${cmd}`);
      await service.commandDevice(entry.uniqueId, 'positionCmd', cmd);
      return;
    }

    if (feature.external_id === ids.feature(FEATURE.POSITION)) {
      const tydomPosition = toTydomPosition(value);
      logger.info(`${entry.name}: position -> ${value}% open (Tydom ${tydomPosition}% closed)`);
      await service.commandDevice(entry.uniqueId, 'position', tydomPosition);
      return;
    }

    throw new Error(`Unknown feature for cover ${entry.uniqueId}: ${feature.external_id}`);
  },

  publishUpdate(gladys, entry, changed, values) {
    if (!changed.includes('position')) {
      return [];
    }
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    return [
      {
        featureExternalId: ids.feature(FEATURE.POSITION),
        value: toGladysPosition(values.position),
      },
    ];
  },
};
