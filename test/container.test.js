import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeConfig } from '../src/config.js';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

let containerModule;

// Not imported: the module must only load once DATA_DIR is set.
const CONTAINER_NAME = 'tydom2mqtt';

// The SDK fake Gladys serves `fake.containers` and records the start/stop
// requests: it does not run them, the tests play the supervisor.
function createGladys(status = 'stopped') {
  return createFakeGladys({ containers: [{ name: CONTAINER_NAME, status, desired: status }] });
}

const containerCalls = (gladys) =>
  gladys.fake.requests
    .filter((r) => r.method === 'POST' && r.path.startsWith(`/container/${CONTAINER_NAME}/`))
    .map((r) => ({ action: r.path.split('/').at(-1), env: r.body?.env }));

before(async () => {
  // The module reads DATA_DIR when loaded.
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), 'tydom-'));
  containerModule = await import('../src/container.js');
});

const config = normalizeConfig({
  tydom_mac: '00:1B:95:08:T7:70',
  tydom_password: 'secret',
  tydom_ip: '192.168.1.26',
  mqtt_host: '192.168.1.51',
  mqtt_user: 'gladys',
  mqtt_password: 'mqtt-secret',
});

test('the env mirrors the tydom2mqtt docker-compose variables', () => {
  const env = containerModule.buildContainerEnv(config);
  assert.deepEqual(env, {
    TYDOM_MAC: '001B9508T770',
    TYDOM_PASSWORD: 'secret',
    TYDOM_IP: '192.168.1.26',
    TYDOM_POLLING_INTERVAL: '300',
    MQTT_HOST: '192.168.1.51',
    MQTT_PORT: '1883',
    MQTT_USER: 'gladys',
    MQTT_PASSWORD: 'mqtt-secret',
  });
});

test('the sub-container is started, then left alone while the config is unchanged', async () => {
  const gladys = createGladys();
  await containerModule.applyContainer(gladys, config);
  assert.deepEqual(
    containerCalls(gladys).map((c) => c.action),
    ['start'],
  );
  assert.equal(containerCalls(gladys)[0].env.TYDOM_IP, '192.168.1.26');

  gladys.fake.containers[0].status = 'running';
  await containerModule.applyContainer(gladys, config);
  assert.equal(containerCalls(gladys).length, 1, 'no restart for the same configuration');
});

test('a configuration change recreates the sub-container with the new env', async () => {
  const gladys = createGladys('running');
  await containerModule.applyContainer(gladys, { ...config, tydom_ip: '192.168.1.27' });
  assert.deepEqual(
    containerCalls(gladys).map((c) => c.action),
    ['stop', 'start'],
  );
  assert.equal(containerCalls(gladys)[1].env.TYDOM_IP, '192.168.1.27');
});

test('the sub-container is stopped when tydom2mqtt is managed outside Gladys', async () => {
  const gladys = createGladys('running');
  await containerModule.applyContainer(gladys, { ...config, manage_container: false });
  assert.deepEqual(
    containerCalls(gladys).map((c) => c.action),
    ['stop'],
  );
});
