// -----------------------------------------------------------------------------
// Runtime device catalog.
//
// Unlike the template's static blueprints (one hard-coded demo device per
// file), a Tydom box carries a variable, user-specific set of endpoints
// discovered at runtime from GET /configs/file, then kept in sync from
// GET /devices/data and the unsolicited PUT /devices/data pushes Tydom
// broadcasts on every change. This module is the single source of truth for
// "what devices exist and what is their last known state" — pure in-memory
// logic, no network, so it is fully unit-testable (see test/registry.test.js).
//
// One registry instance per running integration (see src/tydom/service.js).
// -----------------------------------------------------------------------------

import {
  COVER_USAGES,
  LIGHT_USAGES,
  OPENING_SENSOR_USAGES,
  TEMPERATURE_SENSOR_USAGES,
  COVER_KEYWORDS,
  LIGHT_KEYWORDS,
  OPENING_SENSOR_KEYWORDS,
  TEMPERATURE_SENSOR_KEYWORDS,
} from './const.js';

const KEYWORDS_BY_KIND = {
  cover: COVER_KEYWORDS,
  light: LIGHT_KEYWORDS,
  opening: OPENING_SENSOR_KEYWORDS,
  temperature: TEMPERATURE_SENSOR_KEYWORDS,
};

/**
 * Map a Tydom `last_usage` (from /configs/file) to the device kind this
 * integration knows how to build, or `undefined` for an unsupported endpoint
 * (heating, alarm, energy metering...): it stays invisible to Gladys rather
 * than being published half-broken.
 * @param {string} lastUsage
 */
export function kindForUsage(lastUsage) {
  if (COVER_USAGES.has(lastUsage)) return 'cover';
  if (LIGHT_USAGES.has(lastUsage)) return 'light';
  if (OPENING_SENSOR_USAGES.has(lastUsage)) return 'opening';
  if (TEMPERATURE_SENSOR_USAGES.has(lastUsage)) return 'temperature';
  return undefined;
}

export function uniqueId(endpointId, deviceId) {
  return `${endpointId}_${deviceId}`;
}

export class TydomRegistry {
  #catalog = new Map(); // uniqueId -> { uniqueId, deviceId, endpointId, name, lastUsage, kind }
  #state = new Map(); // uniqueId -> { [elementName]: value }

  /**
   * Apply the response of GET /configs/file: the endpoint catalog. Safe to
   * call again on every reconnection — entries are upserted, never
   * duplicated, and previously known state is preserved.
   * @param {{ endpoints?: Array<object> }} parsed
   * @returns {boolean} whether the catalog changed (new/removed entries).
   */
  applyConfig(parsed) {
    const endpoints = Array.isArray(parsed?.endpoints) ? parsed.endpoints : [];
    const seen = new Set();
    let changed = false;

    for (const endpoint of endpoints) {
      const kind = kindForUsage(endpoint.last_usage);
      if (!kind) {
        continue;
      }
      const id = uniqueId(endpoint.id_endpoint, endpoint.id_device);
      seen.add(id);
      const existing = this.#catalog.get(id);
      const entry = {
        uniqueId: id,
        deviceId: endpoint.id_device,
        endpointId: endpoint.id_endpoint,
        name: endpoint.name || id,
        lastUsage: endpoint.last_usage,
        kind,
      };
      if (!existing || existing.name !== entry.name || existing.kind !== entry.kind) {
        changed = true;
      }
      this.#catalog.set(id, entry);
      if (!this.#state.has(id)) {
        this.#state.set(id, {});
      }
    }

    // Endpoints that disappeared from a fresh catalog (box reconfigured):
    // drop them so a stale device does not linger forever.
    for (const id of this.#catalog.keys()) {
      if (!seen.has(id)) {
        this.#catalog.delete(id);
        this.#state.delete(id);
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Apply one `/devices/data`-shaped payload: either the response of a GET,
   * or an unsolicited PUT push. Both carry the same shape — an array (or a
   * single object) of `{ id: deviceId, endpoints: [{ id, error, data }] }`.
   * @param {unknown} parsed
   * @returns {Array<{ entry: object, values: object, changed: string[] }>} one
   *   entry per known endpoint whose tracked keywords actually changed.
   */
  applyDevicesData(parsed) {
    const devices = Array.isArray(parsed) ? parsed : [parsed];
    const updates = [];

    for (const device of devices) {
      if (!device || device.id === undefined) {
        continue;
      }
      const endpoints = Array.isArray(device.endpoints) ? device.endpoints : [device];
      for (const endpoint of endpoints) {
        const update = this.#applyEndpoint(endpoint, device.id);
        if (update) {
          updates.push(update);
        }
      }
    }

    return updates;
  }

  #applyEndpoint(endpoint, deviceId) {
    if (
      !endpoint ||
      endpoint.error !== 0 ||
      !Array.isArray(endpoint.data) ||
      endpoint.id === undefined
    ) {
      return undefined;
    }
    const id = uniqueId(endpoint.id, deviceId);
    const entry = this.#catalog.get(id);
    if (!entry) {
      // Unknown or unsupported endpoint (e.g. a heating zone): ignore, this
      // integration never published it to Gladys in the first place.
      return undefined;
    }
    const keywords = KEYWORDS_BY_KIND[entry.kind];
    const values = this.#state.get(id) ?? {};
    const changed = [];

    for (const element of endpoint.data) {
      if (element.validity !== 'upToDate' || !keywords.has(element.name)) {
        continue;
      }
      if (values[element.name] !== element.value) {
        changed.push(element.name);
      }
      values[element.name] = element.value;
    }

    this.#state.set(id, values);
    return changed.length > 0 ? { entry, values, changed } : undefined;
  }

  /** All known, supported endpoints, in catalog order. */
  list() {
    return Array.from(this.#catalog.values());
  }

  /** The catalog entry for one endpoint, or undefined. */
  get(id) {
    return this.#catalog.get(id);
  }

  /** Last known raw Tydom values (element name -> value) for one endpoint. */
  getState(id) {
    return this.#state.get(id) ?? {};
  }
}
