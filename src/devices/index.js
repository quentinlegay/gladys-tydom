// -----------------------------------------------------------------------------
// Device kind registry + dispatch.
//
// Unlike the template's static DEVICE_BLUEPRINTS (one hard-coded demo device
// per file), a Tydom box exposes a variable, user-specific set of endpoints
// discovered at runtime (see src/tydom/registry.js). This module maps each
// discovered endpoint's `kind` to the blueprint that knows how to build its
// Gladys device, dispatch commands to it, and turn a raw Tydom state update
// into the right gladys.publishState calls.
// -----------------------------------------------------------------------------

import { cover } from './cover.js';
import { light } from './light.js';
import { openingSensor } from './openingSensor.js';
import { temperatureSensor } from './temperatureSensor.js';

export const BLUEPRINTS_BY_KIND = {
  [cover.kind]: cover,
  [light.kind]: light,
  [openingSensor.kind]: openingSensor,
  [temperatureSensor.kind]: temperatureSensor,
};

/** Build the discovery payload for Gladys: one device per catalog entry. */
export function buildDiscoveredDevices(gladys, registry) {
  return registry.list().map((entry) => BLUEPRINTS_BY_KIND[entry.kind].buildDevice(gladys, entry));
}

/** Find the catalog entry owning a given device external_id, or undefined. */
export function findEntryByDeviceExternalId(gladys, registry, externalId) {
  return registry
    .list()
    .find((entry) => gladys.externalIds(entry.kind, entry.uniqueId).device === externalId);
}

/** Route a Gladys command to the owning blueprint (throws if the device is unknown). */
export async function dispatchSetValue(gladys, service, registry, device, feature, value) {
  const entry = findEntryByDeviceExternalId(gladys, registry, device.external_id);
  if (!entry) {
    throw new Error(`Unknown device: ${device.external_id}`);
  }
  const blueprint = BLUEPRINTS_BY_KIND[entry.kind];
  await blueprint.onSetValue(gladys, service, entry, feature, value);
}

/**
 * Turn one registry 'stateChanged' update into the publishState calls Gladys
 * needs, and send them.
 * @param {object} gladys
 * @param {{ entry: object, values: object, changed: string[] }} update
 */
export async function publishStateChange(gladys, update) {
  const blueprint = BLUEPRINTS_BY_KIND[update.entry.kind];
  const states = blueprint.publishUpdate(gladys, update.entry, update.changed, update.values);
  for (const { featureExternalId, value } of states) {
    await gladys.publishState(featureExternalId, value);
  }
}
