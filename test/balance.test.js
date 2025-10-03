import test from "node:test";
import assert from "node:assert/strict";
import createBalanceProcessor from "../src/balance.js";

test("balance processor notifies when balances change", async () => {
  const fetchArgs = [];
  const accountSnapshots = [
    [
      {
        id: "acct-1",
        name: "Primary",
        balance: "100.00",
        currency: "USD",
      },
    ],
    [
      {
        id: "acct-1",
        name: "Primary",
        balance: "150.50",
        currency: "USD",
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
  const logger = {
    info: (message, meta) => logEntries.push({ level: "info", message, meta }),
    warn: (message, meta) => logEntries.push({ level: "warn", message, meta }),
    error: (message, meta) =>
      logEntries.push({ level: "error", message, meta }),
  };

  const balance = createBalanceProcessor({
    simplefinClient,
    notifier,
    store,
    config: {
      polling: { cronExpression: "*/5 * * * *" },
      notifications: {
        targets: [
          {
            name: "Test",
            accountIds: ["acct-1"],
            appriseUrls: ["pover://token@user"],
            appriseConfigKey: null,
          },
        ],
      },
    },
    logger,
  });

  await balance.checkBalances();

  assert.equal(fetchArgs.length, 1);
  assert.deepEqual(fetchArgs[0], { accountIds: ["acct-1"] });
  assert.equal(sentNotifications.length, 0);
  assert.equal(balances.get("acct-1"), 100);

  await balance.checkBalances();

  assert.equal(fetchArgs.length, 2);
  assert.equal(sentNotifications.length, 1);
  const [notification] = sentNotifications;
  assert.equal(notification.title, "Balance update");
  assert(
    notification.body.includes('<font color="#007700">') ||
      notification.body.includes('<font color="#B00000">'),
  );
  assert.equal(balances.get("acct-1"), 150.5);

  assert.equal(balance.isRunning(), false);
  assert(logEntries.some((entry) => entry.level === "info"));
});

test("balance processor fetches all accounts when wildcard target is present", async () => {
  const fetchArgs = [];
  const simplefinClient = {
    fetchAccounts: async (args) => {
      fetchArgs.push(args);
      return [
        {
          id: "acct-1",
          name: "Allowances",
          balance: "15.00",
          currency: "USD",
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

  const balance = createBalanceProcessor({
    simplefinClient,
    notifier,
    store,
    config: {
      notifications: {
        targets: [
          {
            name: "Everyone",
            accountIds: ["*"],
            appriseUrls: ["pover://token@user"],
          },
        ],
      },
    },
  });

  await balance.checkBalances();

  assert.equal(fetchArgs.length, 1);
  assert.equal(fetchArgs[0], undefined);
  assert.equal(sent, true);
});
