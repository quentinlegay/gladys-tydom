// -----------------------------------------------------------------------------
// MQTT bridge between tydom2mqtt and Gladys.
//
// The integration connects to the same broker as tydom2mqtt and:
//   - reads the (retained) discovery messages to know the Tydom devices;
//   - forwards every state message to Gladys with `publishState`;
//   - turns Gladys commands into tydom2mqtt command messages.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import mqtt from 'mqtt';
import { createLogger } from '@gladysassistant/integration-sdk';
import { Catalog } from './catalog.js';
import { DISCOVERY_TOPIC, RESYNC_TOPIC, STATE_TOPICS, parseDiscoveryTopic } from './mapping.js';

const logger = createLogger({ name: 'bridge' });

// Discovery messages arrive in bursts (one per entity): wait for the burst to
// end before re-publishing the devices to Gladys.
const DEVICES_DEBOUNCE_MS = 3000;

/**
 * Events:
 *   - 'connected'          the broker connection is up
 *   - 'disconnected'       (message) the broker connection is down
 *   - 'devices'            (devices) the Gladys device list changed
 */
export class TydomBridge extends EventEmitter {
  /**
   * @param {object} gladys  SDK instance
   * @param {object} [options]
   * @param {typeof mqtt.connect} [options.connect]  injectable for tests
   * @param {number} [options.debounceMs]
   */
  constructor(gladys, { connect = mqtt.connect, debounceMs = DEVICES_DEBOUNCE_MS } = {}) {
    super();
    this.gladys = gladys;
    this.connectFn = connect;
    this.debounceMs = debounceMs;
    this.catalog = new Catalog(gladys);
    /** @type {Map<string, string>} last payload received per state topic */
    this.lastStates = new Map();
    this.client = null;
    this.devicesTimer = null;
  }

  get connected() {
    return Boolean(this.client?.connected);
  }

  /** (Re)connect to the broker described by the configuration. */
  start(config) {
    this.stop();
    const url = `mqtt://${config.mqtt_host}:${config.mqtt_port}`;
    logger.info(`Connecting to the MQTT broker ${url}`);
    const client = this.connectFn(url, {
      clientId: `gladys-tydom-${randomUUID().slice(0, 8)}`,
      username: config.mqtt_user || undefined,
      password: config.mqtt_password || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
    });
    this.client = client;

    client.on('connect', () => {
      logger.info('Connected to the MQTT broker');
      client.subscribe([DISCOVERY_TOPIC, STATE_TOPICS], { qos: 0 }, (err) => {
        if (err) logger.error('MQTT subscription failed', err);
      });
      this.emit('connected');
    });
    client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString()).catch((err) =>
        logger.error(`Failed to handle ${topic}`, err),
      );
    });
    client.on('error', (err) => {
      logger.warn(`MQTT error: ${err.message}`);
      this.emit('disconnected', err.message);
    });
    client.on('offline', () => {
      logger.warn('MQTT broker unreachable, retrying…');
      this.emit('disconnected', 'offline');
    });
  }

  stop() {
    clearTimeout(this.devicesTimer);
    this.devicesTimer = null;
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end(true);
      this.client = null;
    }
    this.catalog.clear();
    this.lastStates.clear();
  }

  async handleMessage(topic, payload) {
    if (parseDiscoveryTopic(topic)) {
      const { changed, entity } = this.catalog.applyDiscovery(topic, payload);
      if (changed) {
        logger.debug(`Discovery updated: ${topic}`);
        this.scheduleDevicesUpdate();
      }
      if (changed && entity) {
        // States may have arrived before their discovery: replay them.
        for (const stateTopic of this.catalog.stateTopicsOf(entity)) {
          if (this.lastStates.has(stateTopic)) {
            await this.forwardState(stateTopic, this.lastStates.get(stateTopic));
          }
        }
      }
      return;
    }
    this.lastStates.set(topic, payload);
    await this.forwardState(topic, payload);
  }

  async forwardState(topic, payload) {
    for (const feature of this.catalog.featuresForStateTopic(topic)) {
      const value = feature.parse(payload);
      if (value === null) continue;
      try {
        await this.gladys.publishState(feature.externalId, value);
      } catch (err) {
        // Typically: the device has not been added in Gladys yet.
        logger.debug(`publishState ${feature.externalId} refused: ${err.message}`);
      }
    }
  }

  scheduleDevicesUpdate() {
    clearTimeout(this.devicesTimer);
    this.devicesTimer = setTimeout(() => {
      this.devicesTimer = null;
      this.emit('devices', this.catalog.buildDevices());
    }, this.debounceMs);
  }

  buildDevices() {
    return this.catalog.buildDevices();
  }

  /**
   * Run a Gladys command. Throws when it cannot be delivered: the SDK then
   * acks the command as failed and the UI shows it.
   */
  async setValue(featureExternalId, value) {
    const feature = this.catalog.findFeature(featureExternalId);
    if (!feature) {
      throw new Error(
        `Unknown Tydom feature ${featureExternalId} (not announced by tydom2mqtt yet)`,
      );
    }
    if (typeof feature.toCommand !== 'function') {
      throw new Error(`Feature ${featureExternalId} is read-only`);
    }
    const { topic, payload } = feature.toCommand(value);
    logger.info(`Command ${featureExternalId} = ${value} -> ${topic} ${payload}`);
    await this.publish(topic, payload);

    // No state topic (e.g. shutter open/close/stop): reflect the order itself.
    if (!feature.stateTopic) {
      await this.gladys.publishState(featureExternalId, value);
    }
  }

  /** Ask tydom2mqtt to reload the Tydom configuration and republish all. */
  async requestResync() {
    await this.publish(RESYNC_TOPIC, 'gladys');
  }

  publish(topic, payload) {
    if (!this.connected) {
      return Promise.reject(new Error('MQTT broker not connected'));
    }
    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 0, retain: false }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }
}
