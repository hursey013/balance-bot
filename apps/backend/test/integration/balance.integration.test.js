import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nock from 'nock';

import { createConfig } from '../../src/config.js';
import createSimplefinClient from '../../src/simplefin.js';
import createNotifier from '../../src/notifier.js';
import createStore from '../../src/store.js';
import { BalanceMonitor } from '../../src/index.js';

nock.disableNetConnect();

const withTempDir = async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'balance-bot-int-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
};

test('balance monitor integrates simplefin, store, and notifier', async t => {
  t.after(() => {
    if (!nock.isDone()) {
      const pending = nock.pendingMocks();
      nock.cleanAll();
      throw new Error(`Pending mocks: ${pending.join(', ')}`);
    }
  });

  const tempDir = await withTempDir(t);
  const stateFile = path.join(tempDir, 'state.json');
  const cacheFile = path.join(tempDir, 'cache.json');

  const persisted = {
    simplefin: {
      accessUrl: 'https://user:pass@bridge.simplefin.org/simplefin',
      cacheFilePath: cacheFile,
      cacheTtlMs: 0,
    },
    storage: {
      stateFilePath: stateFile,
    },
    notifications: {
      targets: [
        {
          name: 'Integration',
          accountIds: ['acct-1'],
          appriseUrls: ['http://apprise.local/notify'],
        },
      ],
    },
    notifier: {
      appriseApiUrl: 'http://apprise.local/notify',
    },
  };

  const config = createConfig({ persisted });

  const simplefinSnapshots = [
    [
      {
        id: 'acct-1',
        name: 'Primary',
        balance: '100.00',
        currency: 'USD',
      },
    ],
    [
      {
        id: 'acct-1',
        name: 'Primary',
        balance: '150.25',
        currency: 'USD',
      },
    ],
  ];

  nock('https://bridge.simplefin.org')
    .get('/simplefin/accounts')
    .query({ 'balances-only': '1', account: 'acct-1' })
    .reply(() => [200, { accounts: simplefinSnapshots.shift() ?? [] }])
    .get('/simplefin/accounts')
    .query({ 'balances-only': '1', account: 'acct-1' })
    .reply(() => [200, { accounts: simplefinSnapshots.shift() ?? [] }]);

  const appriseRequests = [];
  nock('http://apprise.local')
    .post('/notify')
    .reply(function (uri, body) {
      appriseRequests.push({ url: `http://apprise.local${uri}`, body });
      return [200, ''];
    });

  const simplefinClient = createSimplefinClient({
    accessUrl: config.simplefin.accessUrl,
    cacheFilePath: config.simplefin.cacheFilePath,
    cacheTtlMs: config.simplefin.cacheTtlMs,
  });

  const notifier = createNotifier(config.notifier);
  const store = createStore(config.storage.stateFilePath);
  const balanceMonitor = new BalanceMonitor({
    simplefinClient,
    notifier,
    stateStore: store,
    config,
  });

  await balanceMonitor.runOnce();
  assert.equal(appriseRequests.length, 0);

  await balanceMonitor.runOnce();
  assert.equal(appriseRequests.length, 1);

  const [request] = appriseRequests;
  assert.equal(request.url, 'http://apprise.local/notify');
  assert.equal(request.body.title, 'Balance update');
  assert(request.body.body.includes('👤 Primary'));
  assert(request.body.body.includes('💰 $150.25'));

  const persistedRaw = await fs.readFile(stateFile, 'utf8');
  const persistedState = JSON.parse(persistedRaw);
  assert.equal(persistedState.accounts['acct-1'].lastBalance, 150.25);
});
