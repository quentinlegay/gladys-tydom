// -----------------------------------------------------------------------------
// Catalog of the Tydom devices announced by tydom2mqtt.
//
// Keeps the entities built from the discovery messages, and answers the three
// questions the bridge asks:
//   - which Gladys devices exist?           -> buildDevices()
//   - which features does a state feed?     -> featuresForStateTopic()
//   - how do I send this Gladys command?    -> findFeature().toCommand()
//
// A Gladys device is a Tydom endpoint: the main entity (shutter, light…) plus
// the sensors tydom2mqtt attaches to the same Home Assistant device.
// -----------------------------------------------------------------------------

import { buildEntity, parseDiscoveryTopic } from './mapping.js';

const DEVICE_TYPE = 'endpoint';

export class Catalog {
  constructor(gladys) {
    this.gladys = gladys;
    /** @type {Map<string, ReturnType<typeof buildEntity>>} discovery topic -> entity */
    this.entities = new Map();
    /** @type {Map<string, string>} discovery topic -> raw payload, to skip repeats */
    this.rawConfigs = new Map();
  }

  /**
   * Apply one discovery message. An empty payload removes the entity.
   * @returns {{ changed: boolean, entity: object | null }} `changed` is true
   *   when the set of Gladys devices/features may have changed.
   */
  applyDiscovery(topic, payload) {
    const parsed = parseDiscoveryTopic(topic);
    if (!parsed) return { changed: false, entity: null };

    const raw = String(payload);
    if (this.rawConfigs.get(topic) === raw) {
      // tydom2mqtt republishes the same config on every update.
      return { changed: false, entity: this.entities.get(topic) ?? null };
    }
    this.rawConfigs.set(topic, raw);

    let entity = null;
    if (raw.trim() !== '') {
      try {
        entity = buildEntity(parsed.component, parsed.objectId, JSON.parse(raw));
      } catch {
        entity = null; // not JSON: ignore it
      }
    }
    const existed = this.entities.has(topic);
    if (entity) {
      this.entities.set(topic, entity);
    } else {
      this.entities.delete(topic);
    }
    return { changed: Boolean(entity) || existed, entity };
  }

  externalIds(deviceKey) {
    return this.gladys.externalIds(DEVICE_TYPE, deviceKey);
  }

  /** Gladys discovery payload: one device per Tydom endpoint. */
  buildDevices() {
    const byKey = new Map();
    for (const entity of this.entities.values()) {
      const group = byKey.get(entity.deviceKey) ?? { name: null, fallbackName: null, features: [] };
      if (entity.isMain) group.name ??= entity.deviceName;
      group.fallbackName ??= entity.deviceName;
      group.features.push(...entity.features);
      byKey.set(entity.deviceKey, group);
    }

    return [...byKey.entries()]
      .map(([deviceKey, group]) => {
        const ids = this.externalIds(deviceKey);
        return {
          name: group.name ?? group.fallbackName,
          external_id: ids.device,
          features: group.features
            .map((f) => ({ ...f.feature, external_id: ids.feature(f.key) }))
            .sort((a, b) => a.external_id.localeCompare(b.external_id)),
          params: [{ name: 'tydom_id', value: deviceKey }],
        };
      })
      .sort((a, b) => a.external_id.localeCompare(b.external_id));
  }

  /** Features whose state is published on `topic`, with their external id. */
  featuresForStateTopic(topic) {
    const matches = [];
    for (const entity of this.entities.values()) {
      for (const f of entity.features) {
        if (f.stateTopic === topic) {
          matches.push({ ...f, externalId: this.externalIds(entity.deviceKey).feature(f.key) });
        }
      }
    }
    return matches;
  }

  /** Find a feature from its Gladys external id. */
  findFeature(externalId) {
    for (const entity of this.entities.values()) {
      const ids = this.externalIds(entity.deviceKey);
      const found = entity.features.find((f) => ids.feature(f.key) === externalId);
      if (found) return { ...found, externalId };
    }
    return null;
  }

  /** State topics of an entity, to replay the states already received. */
  stateTopicsOf(entity) {
    return [...new Set(entity.features.map((f) => f.stateTopic).filter(Boolean))];
  }

  clear() {
    this.entities.clear();
    this.rawConfigs.clear();
  }
}
