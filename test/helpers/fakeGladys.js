// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration relies on:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - publishState                   -> record calls so tests can assert them
//   - getContainers / startContainer / stopContainer -> a fake sub-container
// This lets us test the wiring logic without a running Gladys server.
// -----------------------------------------------------------------------------

export function createFakeGladys({ containerStatus = 'stopped' } = {}) {
  const published = [];
  const containerCalls = [];
  const container = { name: 'tydom2mqtt', status: containerStatus, desired: containerStatus };

  return {
    published,
    containerCalls,
    container,

    externalIds(type, platformId) {
      const device = `${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async getContainers() {
      return [{ ...container, ports: [] }];
    },

    async startContainer(name, options) {
      containerCalls.push({ action: 'start', name, env: options?.env });
      container.status = 'running';
      container.desired = 'running';
      return { success: true };
    },

    async stopContainer(name) {
      containerCalls.push({ action: 'stop', name });
      container.status = 'stopped';
      container.desired = 'stopped';
      return { success: true };
    },
  };
}
