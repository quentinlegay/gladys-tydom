import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TydomService } from '../src/tydom/service.js';

class FakeClient extends EventEmitter {
  constructor({ mac, password, host }) {
    super();
    this.mac = mac;
    this.password = password;
    this.host = host;
    this.remoteMode = !host;
    this.connected = false;
    this.sent = [];
  }

  async connect() {
    this.connected = true;
  }

  disconnect() {
    // Mirrors the real TydomClient: disconnect() tears down the socket, it
    // does not clear the client's own event listeners — that is
    // TydomService#teardown's job, called just before this.
    this.connected = false;
    this.disconnectCalled = true;
  }

  async getConfigsFile() {
    this.sent.push('configsFile');
  }

  async getDevicesData() {
    this.sent.push('devicesData');
  }

  async postRefreshAll() {
    this.sent.push('refreshAll');
  }

  async putDeviceData(deviceId, endpointId, name, value) {
    this.sent.push({ deviceId, endpointId, name, value });
  }
}

// A client whose connect() only resolves when the test calls releaseConnect(),
// used to simulate a connection attempt still in flight while a NEW start()
// (or stop()) happens — the exact race that used to open two live WebSockets
// to the same Tydom box (see src/tydom/service.js's #generation comment).
class SlowFakeClient extends FakeClient {
  connect() {
    return new Promise((resolve) => {
      this._releaseConnect = () => {
        this.connected = true;
        resolve();
      };
    });
  }

  releaseConnect() {
    this._releaseConnect();
  }
}

function baseConfig(overrides = {}) {
  return {
    tydom_mac: '001A2B3C4D5E',
    tydom_password: 'pwd',
    deltadore_login: '',
    deltadore_password: '',
    tydom_host: '',
    poll_frequency: 300,
    GLADYS_PREFER_LOCAL: true,
    ...overrides,
  };
}

test('start connects, discovers, and republishes on config/data events', async (t) => {
  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  t.after(() => service.stop());

  const events = [];
  service.on('connected', (e) => events.push(['connected', e]));
  service.on('catalogChanged', () => events.push(['catalogChanged']));
  service.on('stateChanged', (u) => events.push(['stateChanged', u]));

  await service.start(baseConfig());

  assert.equal(created.mac, '001A2B3C4D5E');
  assert.equal(created.password, 'pwd');
  assert.equal(
    created.host,
    undefined,
    'no tydom_host configured: falls back to the mediation relay',
  );
  assert.deepEqual(created.sent, ['configsFile', 'devicesData']);
  assert.equal(events[0][0], 'connected');
  assert.equal(service.connected, true);
  assert.equal(service.transport, 'cloud');

  created.emit('config', {
    endpoints: [{ id_endpoint: 10, id_device: 1, name: 'Volet', last_usage: 'shutter' }],
  });
  assert.ok(events.some((e) => e[0] === 'catalogChanged'));

  created.emit('data', [
    {
      id: 1,
      endpoints: [
        { id: 10, error: 0, data: [{ name: 'position', value: 20, validity: 'upToDate' }] },
      ],
    },
  ]);
  const stateChange = events.find((e) => e[0] === 'stateChanged');
  assert.ok(stateChange);
  assert.equal(stateChange[1].entry.name, 'Volet');
});

test('start connects locally when GLADYS_PREFER_LOCAL is true and a host is configured', async (t) => {
  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  t.after(() => service.stop());

  await service.start(baseConfig({ tydom_host: '192.168.1.42' }));
  assert.equal(created.host, '192.168.1.42');
  assert.equal(service.transport, 'local');
});

test('a configured host is ignored when GLADYS_PREFER_LOCAL is false', async (t) => {
  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  t.after(() => service.stop());

  await service.start(baseConfig({ tydom_host: '192.168.1.42', GLADYS_PREFER_LOCAL: false }));
  assert.equal(created.host, undefined);
  assert.equal(service.transport, 'cloud');
});

test('refresh() waits for the catalog response instead of racing ahead of it', async (t) => {
  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  t.after(() => service.stop());
  await service.start(baseConfig());

  const refreshPromise = service.refresh();
  // The box has not answered yet: a caller reading the registry here (the
  // exact race that used to make the "refresh" action report 0 devices)
  // must still see nothing, proving refresh() is genuinely still pending.
  assert.equal(service.registry.list().length, 0);

  setImmediate(() => {
    created.emit('config', {
      endpoints: [{ id_endpoint: 10, id_device: 1, name: 'Volet', last_usage: 'shutter' }],
    });
  });

  await refreshPromise;
  assert.equal(
    service.registry.list().length,
    1,
    'refresh only resolves once the catalog response was applied',
  );
});

test('commandDevice resolves the catalog entry and forwards to the client', async (t) => {
  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  t.after(() => service.stop());
  await service.start(baseConfig());
  created.emit('config', {
    endpoints: [{ id_endpoint: 10, id_device: 1, name: 'Volet', last_usage: 'shutter' }],
  });

  await service.commandDevice('10_1', 'position', 30);
  assert.deepEqual(created.sent.at(-1), {
    deviceId: 1,
    endpointId: 10,
    name: 'position',
    value: 30,
  });
});

test('commandDevice rejects an unknown device', async (t) => {
  const service = new TydomService({ createClient: (options) => new FakeClient(options) });
  t.after(() => service.stop());
  await service.start(baseConfig());
  await assert.rejects(() => service.commandDevice('99_9', 'position', 30), /Unknown Tydom device/);
});

test('missing credentials emit connectionError without ever creating a client', async (t) => {
  const service = new TydomService({
    createClient: () => {
      throw new Error('createClient must not be called without credentials');
    },
  });
  t.after(() => service.stop());

  const errors = [];
  service.on('connectionError', (err) => errors.push(err));
  await service.start(baseConfig({ tydom_password: '' }));

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Missing Tydom credentials/);
  assert.equal(service.transport, 'unreachable');
});

test('a Delta Dore login/password resolves the gateway password and persists it', async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('well-known')) {
      return { ok: true, json: async () => ({ token_endpoint: 'https://auth.example/token' }) };
    }
    if (href.includes('auth.example')) {
      return { ok: true, json: async () => ({ access_token: 'abc123' }) };
    }
    return { ok: true, json: async () => ({ sites: [{ gateway: { password: 'resolved-pwd' } }] }) };
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  t.after(() => service.stop());

  const resolved = [];
  await service.start(
    baseConfig({
      tydom_password: '',
      deltadore_login: 'user@example.com',
      deltadore_password: 'hunter2',
    }),
    { onPasswordResolved: async (password) => resolved.push(password) },
  );

  assert.equal(created.password, 'resolved-pwd');
  assert.deepEqual(resolved, ['resolved-pwd']);
});

test('stop() tears down the client and prevents any further reconnect attempt', async () => {
  let created;
  const service = new TydomService({
    createClient: (options) => {
      created = new FakeClient(options);
      return created;
    },
  });
  await service.start(baseConfig());
  assert.equal(service.connected, true);

  service.stop();
  assert.equal(service.client, null);

  // A disconnect arriving after stop() must not schedule a reconnect.
  created.emit('disconnected');
  assert.equal(service.reconnectTimer, null);
});

test('a start() that supersedes an in-flight connect discards the stale socket', async (t) => {
  const clients = [];
  const service = new TydomService({
    createClient: (options) => {
      const client = clients.length === 0 ? new SlowFakeClient(options) : new FakeClient(options);
      clients.push(client);
      return client;
    },
  });
  t.after(() => service.stop());

  const firstStart = service.start(baseConfig({ tydom_mac: '111111111111' }));
  // Let the first start() run far enough to actually open its (slow)
  // connection before superseding it: credential resolution alone already
  // hops through a microtask, so a bare synchronous supersede would abort it
  // before it ever reaches the network — a different code path than the one
  // this test targets (see the next test for that earlier-abort case).
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clients.length, 1, 'the first attempt has opened its (still pending) connection');

  // The first connect() is still pending: start() a second time (as
  // onConfigUpdated would) before it resolves.
  const secondStart = service.start(baseConfig({ tydom_mac: '222222222222' }));
  await secondStart;

  assert.equal(service.client, clients[1], 'the second, up-to-date connection wins');
  assert.equal(service.client.mac, '222222222222');

  // The first connection finally completes its handshake — too late, it must
  // be discarded rather than overwriting the live one.
  clients[0].releaseConnect();
  await firstStart;

  assert.equal(service.client, clients[1], 'the stale connection never becomes the active one');
  assert.equal(clients[0].disconnectCalled, true, 'the superseded socket is closed, not leaked');
});

test('stop() while connecting discards the in-flight connection instead of adopting it', async (t) => {
  let client;
  const service = new TydomService({
    createClient: (options) => {
      client = new SlowFakeClient(options);
      return client;
    },
  });
  t.after(() => service.stop());

  const starting = service.start(baseConfig());
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(client, 'the connection attempt reached the network before being stopped');

  service.stop();
  client.releaseConnect();
  await starting;

  assert.equal(service.client, null, 'stop() must win even though connect() resolved afterwards');
  assert.equal(client.disconnectCalled, true);
});
