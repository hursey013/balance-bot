import test from 'node:test';
import assert from 'node:assert/strict';
import { BalanceMonitor } from '../src/index.js';

test('balance monitor notifies when balances change', async () => {
  const fetchArgs = [];
  const accountSnapshots = [
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
        balance: '150.50',
        currency: 'USD',
      },
    ],
  ];

  const simplefinClient = {
    fetchAccounts: async (args) => {
      fetchArgs.push(args);
      return accountSnapshots.shift() ?? [];
    },
  };

  const sentNotifications = [];
  const notifier = {
    sendNotification: async (payload) => {
      sentNotifications.push(payload);
    },
  };

  const balances = new Map();
  const store = {
    getLastBalance: async (id) => (balances.has(id) ? balances.get(id) : null),
    setLastBalance: async (id, value) => {
      balances.set(id, value);
    },
    save: async () => {},
  };

  const logEntries = [];
  const captureLog =
    (level) =>
    (first, second) => {
      if (typeof first === 'string') {
        logEntries.push({ level, message: first, meta: second });
      } else {
        logEntries.push({ level, message: second, meta: first });
      }
    };
  const logger = {
    info: captureLog('info'),
    warn: captureLog('warn'),
    error: captureLog('error'),
  };

  const monitor = new BalanceMonitor({
    simplefinClient,
    notifier,
    stateStore: store,
    config: {
      polling: { cronExpression: '*/5 * * * *' },
      notifications: {
        targets: [
          {
            name: 'Test',
            accountIds: ['acct-1'],
            appriseUrls: ['pover://token@user'],
            appriseConfigKey: null,
          },
        ],
      },
    },
    log: logger,
  });

  await monitor.runOnce();

  assert.equal(fetchArgs.length, 1);
  assert.deepEqual(fetchArgs[0], { accountIds: ['acct-1'] });
  assert.equal(sentNotifications.length, 0);
  assert.equal(balances.get('acct-1'), 100);

  await monitor.runOnce();

  assert.equal(fetchArgs.length, 2);
  assert.equal(sentNotifications.length, 1);
  const [notification] = sentNotifications;
  assert.equal(notification.title, 'Balance update');
  assert(notification.body.includes('👤 Primary'));
  assert(notification.body.includes('📈 <font color="#007700">'));
  assert(notification.body.includes('💰 $150.50'));
  assert.equal(balances.get('acct-1'), 150.5);

  assert.equal(monitor.isRunning(), false);
  assert(logEntries.some((entry) => entry.level === 'info'));
});

test('balance monitor fetches all accounts when wildcard target is present', async () => {
  const fetchArgs = [];
  const simplefinClient = {
    fetchAccounts: async (args) => {
      fetchArgs.push(args);
      return [
        {
          id: 'acct-1',
          name: 'Allowances',
          balance: '15.00',
          currency: 'USD',
        },
      ];
    },
  };

  const store = {
    getLastBalance: async () => 10,
    setLastBalance: async () => {},
    save: async () => {},
  };

  let sent = false;
  const notifier = {
    sendNotification: async () => {
      sent = true;
    },
  };

  const monitor = new BalanceMonitor({
    simplefinClient,
    notifier,
    stateStore: store,
    config: {
      notifications: {
        targets: [
          {
            name: 'Everyone',
            accountIds: ['*'],
            appriseUrls: ['pover://token@user'],
          },
        ],
      },
    },
  });

  await monitor.runOnce();

  assert.equal(fetchArgs.length, 1);
  assert.equal(fetchArgs[0], undefined);
  assert.equal(sent, true);
});
