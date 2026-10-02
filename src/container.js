// -----------------------------------------------------------------------------
// tydom2mqtt sub-container.
//
// The manifest declares a `tydom2mqtt` sub-container with `start: manual`: the
// supervisor creates nothing until we call `startContainer` with the env built
// from the user configuration. The credentials never go through the (public)
// manifest: they are passed at runtime in the `env` of the start request.
//
// This mirrors the docker-compose service of the tydom2mqtt documentation:
//   TYDOM_MAC, TYDOM_PASSWORD, TYDOM_IP, MQTT_HOST, MQTT_USER, MQTT_PASSWORD…
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

export const CONTAINER_NAME = 'tydom2mqtt';

// /data is the only writable location of the integration container. We keep
// there a fingerprint of the env tydom2mqtt was started with, so an
// integration restart does not needlessly restart tydom2mqtt.
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const FINGERPRINT_FILE = path.join(DATA_DIR, 'tydom2mqtt-env.sha256');

const logger = createLogger({ name: 'container' });

/**
 * Build the tydom2mqtt environment from the integration configuration. Empty
 * optional values are left out so tydom2mqtt keeps its own defaults.
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 * @returns {Record<string, string>}
 */
export function buildContainerEnv(config) {
  const env = {
    TYDOM_MAC: config.tydom_mac,
    TYDOM_PASSWORD: config.tydom_password,
    TYDOM_IP: config.tydom_ip,
    TYDOM_POLLING_INTERVAL: String(config.tydom_polling_interval),
    DELTADORE_LOGIN: config.deltadore_login,
    DELTADORE_PASSWORD: config.deltadore_password,
    MQTT_HOST: config.mqtt_host,
    MQTT_PORT: String(config.mqtt_port),
    MQTT_USER: config.mqtt_user,
    MQTT_PASSWORD: config.mqtt_password,
  };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
}

export function envFingerprint(env) {
  const sorted = Object.fromEntries(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

async function readFingerprint() {
  try {
    return (await readFile(FINGERPRINT_FILE, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function writeFingerprint(fingerprint) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(FINGERPRINT_FILE, fingerprint ?? '');
  } catch (err) {
    logger.warn(`Could not persist the tydom2mqtt fingerprint: ${err.message}`);
  }
}

/**
 * Make the sub-container match the configuration: start it with the current
 * env, or stop it when the user runs tydom2mqtt on their own.
 *
 * A running container is left alone when its env did not change. Otherwise it
 * is stopped first: the env is applied when the container is created, and the
 * start request recreates it with the new values.
 */
export async function applyContainer(gladys, config) {
  const containers = await gladys.getContainers();
  const current = containers.find((c) => c.name === CONTAINER_NAME);
  const isRunning = current?.status === 'running';
  const isWanted = isRunning || current?.desired === 'running';

  if (!config.manage_container) {
    if (isWanted) {
      logger.info('tydom2mqtt is managed outside Gladys: stopping the sub-container');
      await gladys.stopContainer(CONTAINER_NAME);
    }
    await writeFingerprint(null);
    return;
  }

  const env = buildContainerEnv(config);
  const fingerprint = envFingerprint(env);
  if (isRunning && (await readFingerprint()) === fingerprint) {
    logger.info('tydom2mqtt already running with this configuration');
    return;
  }
  if (isWanted) {
    logger.info('Stopping tydom2mqtt to apply the new configuration');
    await gladys.stopContainer(CONTAINER_NAME);
  }
  logger.info(`Starting tydom2mqtt (Tydom ${config.tydom_ip}, MQTT ${config.mqtt_host})`);
  await gladys.startContainer(CONTAINER_NAME, { env });
  await writeFingerprint(fingerprint);
}
