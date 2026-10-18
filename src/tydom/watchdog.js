// -----------------------------------------------------------------------------
// tydom2mqtt watchdog.
//
// When the Tydom gateway closes its websocket, tydom2mqtt can lose its Tydom
// connection for good while its process and its MQTT connection stay up: the
// commands still reach it but fail with `ConnectionClosedOK`, and nothing is
// published any more. Docker sees a healthy container, so nobody restarts it.
//
// The watchdog notices that silence and restarts the sub-container:
//   - after a command, tydom2mqtt normally republishes the device within
//     seconds; with no message at all, it is probed;
//   - when nothing was received for a long time, it is probed too;
//   - a probe asks tydom2mqtt to re-read the gateway data (RESYNC_TOPIC): a
//     live tydom2mqtt republishes every device, a stuck one stays silent and
//     is restarted.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'watchdog' });

export const WATCHDOG_DEFAULTS = {
  // Silence after a command before probing tydom2mqtt.
  commandTimeoutMs: 20_000,
  // Time given to tydom2mqtt to answer a probe.
  probeTimeoutMs: 30_000,
  // Silence after which tydom2mqtt is probed even without command.
  idleTimeoutMs: 15 * 60_000,
  // Minimum delay between two restarts (tydom2mqtt needs time to reconnect).
  restartCooldownMs: 5 * 60_000,
};

export class TydomWatchdog {
  /**
   * @param {object} options
   * @param {import('./bridge.js').TydomBridge} options.bridge
   * @param {() => Promise<unknown>} options.probe    asks tydom2mqtt to republish
   * @param {() => Promise<unknown>} options.restart  restarts tydom2mqtt
   * @param {() => number} [options.now]
   */
  constructor({ bridge, probe, restart, now = Date.now, ...timings }) {
    this.bridge = bridge;
    this.probe = probe;
    this.restart = restart;
    this.now = now;
    this.timings = { ...WATCHDOG_DEFAULTS, ...timings };
    /** Count of messages received, compared before/after a command or probe. */
    this.activityCount = 0;
    this.lastRestartAt = -Infinity;
    this.checkTimer = null;
    this.idleTimer = null;
    this.probing = false;
    this.onActivity = () => this.activity();
    this.onCommand = () => this.command();
  }

  start() {
    this.stop();
    this.bridge.on('activity', this.onActivity);
    this.bridge.on('command', this.onCommand);
    this.armIdle();
  }

  stop() {
    this.bridge.off('activity', this.onActivity);
    this.bridge.off('command', this.onCommand);
    clearTimeout(this.checkTimer);
    clearTimeout(this.idleTimer);
    this.checkTimer = null;
    this.idleTimer = null;
    this.probing = false;
  }

  activity() {
    this.activityCount += 1;
    this.probing = false;
    clearTimeout(this.checkTimer);
    this.checkTimer = null;
    this.armIdle();
  }

  /** A command was sent: expect tydom2mqtt to answer shortly. */
  command() {
    if (this.checkTimer) return;
    const before = this.activityCount;
    this.checkTimer = setTimeout(() => {
      this.checkTimer = null;
      if (this.activityCount === before) this.sendProbe('no answer to a command');
    }, this.timings.commandTimeoutMs);
  }

  armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.sendProbe('no message for a long time');
    }, this.timings.idleTimeoutMs);
  }

  async sendProbe(reason) {
    if (this.probing || !this.bridge.connected) {
      this.armIdle();
      return;
    }
    logger.info(`Probing tydom2mqtt (${reason})`);
    this.probing = true;
    const before = this.activityCount;
    try {
      await this.probe();
    } catch (err) {
      logger.warn(`tydom2mqtt probe not sent: ${err.message}`);
      this.probing = false;
      this.armIdle();
      return;
    }
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      this.checkTimer = null;
      this.probing = false;
      if (this.activityCount === before) this.restartStuck();
    }, this.timings.probeTimeoutMs);
  }

  async restartStuck() {
    if (this.now() - this.lastRestartAt < this.timings.restartCooldownMs) {
      logger.warn('tydom2mqtt still silent, waiting before restarting it again');
      this.armIdle();
      return;
    }
    this.lastRestartAt = this.now();
    logger.warn('tydom2mqtt does not answer (Tydom connection lost?): restarting it');
    try {
      await this.restart();
    } catch (err) {
      logger.error('Failed to restart tydom2mqtt', err);
    }
    this.armIdle();
  }
}
