// -----------------------------------------------------------------------------
// Device kind: OPENING SENSOR (door/window contacts — read-only).
//
// Tydom reports `openState`; the exact literal (seen as "OPEN"/"CLOSED" on
// some hardware, "true"/"false" as strings on others) is normalized here.
// Published using Gladys' own OPENING_SENSOR_STATE convention
// (server/utils/constants.js): OPEN = 0, CLOSE = 1 — not re-exported by the
// SDK's device-constants.js, so the values are inlined with this note rather
// than imported.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
} from '@gladysassistant/integration-sdk';

const KIND = 'opening';
const logger = createLogger({ name: KIND });

const FEATURE = { OPEN: 'open' };
const OPENING_SENSOR_STATE = { OPEN: 0, CLOSE: 1 };

/** Normalize Tydom's `openState` (seen as "OPEN"/"CLOSED", "true"/"false"...) to a boolean. */
export function isOpenRaw(rawValue) {
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }
  const normalized = String(rawValue ?? '')
    .trim()
    .toUpperCase();
  return (
    normalized === 'OPEN' || normalized === 'TRUE' || normalized === '1' || normalized === 'ON'
  );
}

export const openingSensor = {
  kind: KIND,

  buildDevice(gladys, entry) {
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    return {
      name: entry.name,
      external_id: ids.device,
      features: [
        {
          name: entry.name,
          external_id: ids.feature(FEATURE.OPEN),
          category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          read_only: true,
          has_feedback: true,
          keep_history: true,
        },
      ],
    };
  },

  publishUpdate(gladys, entry, changed, values) {
    if (!changed.includes('openState')) {
      return [];
    }
    const ids = gladys.externalIds(KIND, entry.uniqueId);
    const state = isOpenRaw(values.openState)
      ? OPENING_SENSOR_STATE.OPEN
      : OPENING_SENSOR_STATE.CLOSE;
    logger.debug(
      `${entry.name}: openState=${values.openState} -> ${state === OPENING_SENSOR_STATE.OPEN ? 'OPEN' : 'CLOSED'}`,
    );
    return [{ featureExternalId: ids.feature(FEATURE.OPEN), value: state }];
  },
};
