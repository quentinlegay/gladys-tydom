// -----------------------------------------------------------------------------
// Entry point of the Tydom integration for Gladys.
//
//   Tydom gateway <──> tydom2mqtt (sub-container) <──> MQTT broker <──> this
//
// This file only wires the SDK to:
//   - src/container.js : starts tydom2mqtt with the user configuration;
//   - src/tydom/       : reads tydom2mqtt's MQTT discovery and states, sends
//                        the Gladys commands back.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { missingConfig, normalizeConfig } from './src/config.js';
import { applyContainer } from './src/container.js';
import { TydomBridge } from './src/tydom/bridge.js';

const gladys = new GladysIntegration();
const bridge = new TydomBridge(gladys);

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the Tydom devices');
  // Ask tydom2mqtt for a fresh export too: new devices show up a few seconds
  // later through the 'devices' event below.
  await bridge.requestResync().catch((err) => logger.warn(`Resync not sent: ${err.message}`));
  await gladys.publishDiscoveredDevices(bridge.buildDevices());
});

bridge.on('devices', (devices) => {
  logger.info(`${devices.length} Tydom device(s) announced by tydom2mqtt`);
  gladys
    .publishDiscoveredDevices(devices)
    .catch((err) => logger.error('publishDiscoveredDevices failed', err));
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await bridge.setValue(feature.external_id, value);
});

// --- Manifest action: "Resynchronize Tydom devices" --------------------------
gladys.onAction('resync', async () => {
  if (!bridge.connected) {
    return {
      en: 'The MQTT broker is not connected: check the configuration.',
      fr: "Le broker MQTT n'est pas connecté : vérifiez la configuration.",
    };
  }
  await bridge.requestResync();
  return {
    en: 'Resynchronization requested: devices will update in a few seconds.',
    fr: 'Resynchronisation demandée : les appareils seront mis à jour dans quelques secondes.',
  };
});

// --- Connection status, shown in the Configuration screen --------------------
bridge.on('connected', () => {
  gladys.setConnectionStatus(true).catch(() => {});
});
bridge.on('disconnected', (reason) => {
  gladys
    .setConnectionStatus(false, {
      en: `MQTT broker unreachable (${reason}).`,
      fr: `Broker MQTT injoignable (${reason}).`,
    })
    .catch(() => {});
});

// --- (Re)apply the configuration ---------------------------------------------
async function applyConfig() {
  const missing = missingConfig(config);
  if (missing) {
    logger.warn(`Incomplete configuration: ${missing.en}`);
    bridge.stop();
    await gladys.setConnectionStatus(false, missing);
    return;
  }
  try {
    await applyContainer(gladys, config);
  } catch (err) {
    logger.error('Failed to start tydom2mqtt', err);
    await gladys.setConnectionStatus(false, {
      en: 'tydom2mqtt could not be started, check the integration logs.',
      fr: "tydom2mqtt n'a pas pu être démarré, consultez les logs de l'intégration.",
    });
    return;
  }
  bridge.start(config);
}

gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await applyConfig();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK logs the WebSocket lifecycle itself (under the `gladys-sdk` name).
let initialized = false;
gladys.on('connected', async () => {
  // Reconnection to Gladys: tydom2mqtt and the broker connection are still up.
  if (initialized) return;
  try {
    config = normalizeConfig(await gladys.getConfig());
    await applyConfig();
    initialized = true;
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

// --- Graceful shutdown -------------------------------------------------------
// tydom2mqtt is left running: the supervisor owns the sub-container lifecycle,
// and it keeps the Tydom states flowing to the broker during a restart.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  bridge.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Tydom integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
