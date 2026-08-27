// -----------------------------------------------------------------------------
// High-level Tydom orchestration: owns the registry + the protocol client,
// resolves credentials, reconnects with backoff, and re-issues a periodic
// /refresh/all so the registry never drifts too far from reality even if a
// push notification is missed. index.js wires this to the Gladys SDK; this
// module knows nothing about Gladys itself, which keeps it unit-testable by
// injecting a fake `createClient`.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createLogger } from '@gladysassistant/integration-sdk';
import { TydomClient } from './client.js';
import { TydomRegistry } from './registry.js';
import { fetchGatewayPassword } from './credentials.js';

const logger = createLogger({ name: 'tydom:service' });

const MIN_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const MIN_POLL_FREQUENCY_SECONDS = 30;
const REFRESH_RESPONSE_TIMEOUT_MS = 10_000;

/**
 * Resolve once `eventName` next fires on `emitter`, or after `timeoutMs`
 * elapses — whichever comes first. Never rejects: a box that stays silent
 * should not turn a refresh into a hard failure, it should just give up
 * waiting and let the caller see whatever state is already known.
 */
function waitForEvent(emitter, eventName, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      emitter.removeListener(eventName, finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    emitter.once(eventName, finish);
  });
}

export class TydomService extends EventEmitter {
  /** @param {{ createClient?: (options: object) => TydomClient }} [options] */
  constructor({ createClient = (options) => new TydomClient(options) } = {}) {
    super();
    this.registry = new TydomRegistry();
    this.client = null;
    this.config = null;
    this.onPasswordResolved = undefined;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.refreshTimer = null;
    this.stopped = true;
    this.transport = 'unreachable';
    this.#createClient = createClient;
  }

  #createClient;
  // Bumped by every start()/stop(): a connect attempt (or a scheduled
  // reconnect) started under an older generation checks it after every await
  // and aborts as soon as it no longer matches, instead of possibly
  // finishing AFTER a newer attempt already has a live connection. Without
  // this, onConfigUpdated firing while a backoff-scheduled reconnect is
  // already mid-flight can open a SECOND WebSocket to the same box — Tydom
  // boxes accept only one session at a time and cleanly close (code 1000)
  // whichever one becomes redundant, which looks like an endless
  // connect/disconnect loop from the logs.
  #generation = 0;

  /**
   * (Re)start the service with a configuration. Safe to call again after a
   * config change, including while a previous connection attempt is still in
   * flight: the new generation supersedes it, see `#generation` above.
   * @param {object} config - normalized integration config (see src/config.js).
   * @param {{ onPasswordResolved?: (password: string) => Promise<void> | void }} [options]
   */
  async start(config, { onPasswordResolved } = {}) {
    this.stopped = false;
    this.config = config;
    this.onPasswordResolved = onPasswordResolved;
    this.#generation += 1;
    this.#teardown();
    await this.#connectWithRetry(this.#generation);
  }

  /** Stop for good: no further reconnection attempts. */
  stop() {
    this.stopped = true;
    this.#generation += 1;
    this.#teardown();
  }

  get connected() {
    return this.client?.connected === true;
  }

  /**
   * Force an immediate re-discovery + state refresh (manual rescan / action).
   * `/configs/file` and `/devices/data` answer as separate, asynchronous
   * 'config'/'data' events on the client (Tydom's own push-based protocol has
   * no request/response pairing) — this waits for the catalog response (up to
   * REFRESH_RESPONSE_TIMEOUT_MS) so callers reading `registry.list()` right
   * after `await refresh()` see the refreshed catalog instead of racing
   * ahead of the box's answer.
   */
  async refresh() {
    if (!this.connected) {
      throw new Error('Not connected to the Tydom box');
    }
    const client = this.client;
    const configReceived = waitForEvent(client, 'config', REFRESH_RESPONSE_TIMEOUT_MS);
    await client.getConfigsFile();
    await configReceived;
    await client.getDevicesData();
  }

  /** Send a raw command to one registered endpoint (see src/devices/*.js). */
  async commandDevice(uniqueId, name, value) {
    const entry = this.registry.get(uniqueId);
    if (!entry) {
      throw new Error(`Unknown Tydom device: ${uniqueId}`);
    }
    if (!this.connected) {
      throw new Error('Not connected to the Tydom box');
    }
    await this.client.putDeviceData(entry.deviceId, entry.endpointId, name, value);
  }

  #teardown() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.client) {
      this.client.removeAllListeners();
      this.client.disconnect();
      this.client = null;
    }
  }

  async #resolvePassword() {
    const { tydom_password, deltadore_login, deltadore_password, tydom_mac } = this.config;
    if (tydom_password) {
      return tydom_password;
    }
    if (deltadore_login && deltadore_password) {
      logger.info('Resolving the Tydom gateway password from the Delta Dore account...');
      const password = await fetchGatewayPassword(deltadore_login, deltadore_password, tydom_mac);
      await this.onPasswordResolved?.(password);
      return password;
    }
    throw new Error(
      'Missing Tydom credentials: set "Tydom password", or a Delta Dore login/password',
    );
  }

  async #connectWithRetry() {
    if (this.stopped) {
      return;
    }
    try {
      if (!this.config.tydom_mac) {
        throw new Error('Missing Tydom mac address');
      }
      const password = await this.#resolvePassword();
      const preferLocal = this.config.GLADYS_PREFER_LOCAL !== false;
      const host = preferLocal && this.config.tydom_host ? this.config.tydom_host : undefined;

      const client = this.#createClient({ mac: this.config.tydom_mac, password, host });
      this.#wireClient(client);
      await client.connect();

      this.client = client;
      this.reconnectAttempt = 0;
      this.transport = client.remoteMode ? 'cloud' : 'local';
      this.emit('connected', { transport: this.transport });

      await client.getConfigsFile();
      await client.getDevicesData();

      const intervalSeconds = Math.max(
        MIN_POLL_FREQUENCY_SECONDS,
        this.config.poll_frequency ?? 300,
      );
      this.refreshTimer = setInterval(() => {
        client
          .postRefreshAll()
          .catch((err) => logger.warn('Periodic refresh failed:', err.message));
      }, intervalSeconds * 1000);
    } catch (err) {
      this.transport = 'unreachable';
      this.emit('connectionError', err);
      this.#scheduleReconnect();
    }
  }

  #wireClient(client) {
    client.on('config', (payload) => {
      const changed = this.registry.applyConfig(payload);
      if (changed) {
        this.emit('catalogChanged');
      }
    });
    client.on('data', (payload) => {
      for (const update of this.registry.applyDevicesData(payload)) {
        this.emit('stateChanged', update);
      }
    });
    client.on('disconnected', (info) => {
      if (this.stopped || this.client !== client) {
        return;
      }
      this.client = null;
      this.transport = 'unreachable';
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
      this.emit('disconnected', info);
      this.#scheduleReconnect();
    });
    client.on('error', (err) => {
      logger.warn('Tydom connection error:', err.message);
    });
  }

  #scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = Math.min(
      MIN_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    logger.info(`Reconnecting to Tydom in ${Math.round(delay / 1000)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.#connectWithRetry();
    }, delay);
  }
}
