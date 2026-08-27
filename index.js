// -----------------------------------------------------------------------------
// Entry point of the Tydom external integration for Gladys Assistant.
//
// Unlike the demo template this integration is based on, the device list is
// NOT static: it is discovered at runtime from the user's own Tydom box (see
// src/tydom/registry.js) and can grow/shrink as the box reports its
// `/configs/file` catalog. This file wires:
//   1. the Gladys SDK connection (auth, reconnection: handled for you);
//   2. the Tydom service (src/tydom/service.js: the box connection, the
//      device registry, reconnection with backoff, periodic refresh);
//   3. the device dispatch (src/devices/index.js) translating between the
//      two.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { TydomService } from './src/tydom/service.js';
import {
  buildDiscoveredDevices,
  dispatchSetValue,
  publishStateChange,
} from './src/devices/index.js';

const gladys = new GladysIntegration();
const service = new TydomService();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();
// Fingerprint of the config the Tydom service is currently running with, so
// a self-inflicted config change (persisting a Delta-Dore-resolved password,
// see onPasswordResolved below) does not trigger a needless reconnect loop.
let runningFingerprint = null;

function connectionFingerprint(c) {
  return JSON.stringify({
    mac: c.tydom_mac,
    password: c.tydom_password,
    login: c.deltadore_login,
    deltaPassword: c.deltadore_password,
    host: c.tydom_host,
    preferLocal: c.GLADYS_PREFER_LOCAL,
    pollFrequency: c.poll_frequency,
  });
}

async function restartTydomService() {
  const fingerprint = connectionFingerprint(config);
  if (fingerprint === runningFingerprint) {
    return;
  }
  runningFingerprint = fingerprint;
  await service.start(config, {
    onPasswordResolved: async (password) => {
      // Persist the password the Delta Dore account flow resolved so the
      // integration never has to replay the account login on every restart.
      await gladys.setConfig({ tydom_password: password }).catch((err) => {
        logger.warn('Could not persist the resolved Tydom password:', err.message);
      });
    },
  });
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> asking Tydom to refresh, then publishing what is known');
  await service
    .refresh()
    .catch((err) => logger.warn('Refresh on scan request failed:', err.message));
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, service.registry));
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await dispatchSetValue(gladys, service, service.registry, device, feature, value);
});

// --- Polling: Gladys asks to refresh a device ---------------------------------
// Tydom pushes state changes over the open connection and the service already
// re-syncs everything periodically (poll_frequency): a per-device poll simply
// nudges that same refresh rather than issuing a narrower request.
gladys.onPoll(async () => {
  await service.refresh().catch((err) => logger.debug('onPoll refresh skipped:', err.message));
});

// --- Manifest action: force a rescan + report how many devices were found ----
gladys.onAction('refresh', async () => {
  try {
    await service.refresh();
    const count = service.registry.list().length;
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, service.registry));
    return {
      en: `Refreshed: ${count} device(s) found on the Tydom box.`,
      fr: `Rafraîchi : ${count} appareil(s) trouvé(s) sur la box Tydom.`,
    };
  } catch (err) {
    return {
      en: `Could not refresh: ${err.message}`,
      fr: `Rafraîchissement impossible : ${err.message}`,
    };
  }
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await restartTydomService();
});

// --- Tydom service events -> Gladys -------------------------------------------
service.on('catalogChanged', async () => {
  logger.info(`Tydom catalog changed: ${service.registry.list().length} supported device(s)`);
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, service.registry));
  await publishTransports();
});

service.on('stateChanged', (update) => {
  publishStateChange(gladys, update).catch((err) =>
    logger.error(`Failed to publish state for ${update.entry.uniqueId}:`, err),
  );
});

service.on('connected', async ({ transport }) => {
  logger.info(`Connected to Tydom (${transport})`);
  await gladys.setConnectionStatus(true).catch(() => {});
  await publishTransports();
});

service.on('disconnected', async (info) => {
  logger.warn(
    `Disconnected from Tydom (code=${info?.code}, reason=${info?.reason || '<none>'}), reconnecting...`,
  );
  await publishTransports();
});

service.on('connectionError', async (err) => {
  logger.error('Tydom connection failed:', err.message);
  await gladys
    .setConnectionStatus(false, {
      en: `Cannot connect to the Tydom box: ${err.message}`,
      fr: `Connexion à la box Tydom impossible : ${err.message}`,
    })
    .catch(() => {});
  await publishTransports();
});

async function publishTransports() {
  const entries = service.registry.list().map((entry) => ({
    external_id: gladys.externalIds(entry.kind, entry.uniqueId).device,
    transport: service.transport,
  }));
  if (entries.length > 0) {
    await gladys
      .publishTransports(entries)
      .catch((err) => logger.warn('publishTransports failed:', err.message));
  }
}

// --- Gladys connection lifecycle ----------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, service.registry));
    await restartTydomService();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  // The Gladys-side WebSocket dropped; the Tydom connection itself is left
  // running (it has its own lifecycle and reconnect loop) so devices keep
  // being tracked and states keep queuing up for the next publish once the
  // SDK reconnects.
});

// --- Graceful shutdown ---------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

// --- Startup ---------------------------------------------------------------------
logger.info('Starting the Tydom integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
