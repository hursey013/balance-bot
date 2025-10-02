import test from "node:test";
import assert from "node:assert/strict";
import createBalanceScheduler from "../src/balanceScheduler.js";

test("balance scheduler notifies when balances change", async (t) => {
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
  const stateStore = {
    getLastBalance: async (id) =>
      balances.has(id) ? balances.get(id) : null,
    setLastBalance: async (id, value) => {
      balances.set(id, value);
    },
    save: async () => {},
  };

  let scheduledCallback;
  let stopCalled = false;
  const cronLib = {
    validate: () => true,
    schedule: (expression, callback) => {
      scheduledCallback = callback;
      return {
        stop: () => {
          stopCalled = true;
        },
      };
    },
  };

  const logEntries = [];
  const logger = {
    info: (message, meta) => logEntries.push({ level: "info", message, meta }),
    warn: (message, meta) => logEntries.push({ level: "warn", message, meta }),
    error: (message, meta) => logEntries.push({ level: "error", message, meta }),
  };

  const scheduler = createBalanceScheduler({
    simplefinClient,
    notifier,
    stateStore,
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
    cronLib,
    logger,
  });

  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(fetchArgs.length, 1);
  assert.deepEqual(fetchArgs[0], { accountIds: ["acct-1"] });
  assert.equal(sentNotifications.length, 0);
  assert.equal(balances.get("acct-1"), 100);

  await scheduledCallback();

  assert.equal(fetchArgs.length, 2);
  assert.equal(sentNotifications.length, 1);
  const [notification] = sentNotifications;
  assert.equal(notification.title, "Balance update");
  assert(notification.body.includes("<font color=\"#007700\">") ||
    notification.body.includes("<font color=\"#B00000\">"));
  assert.equal(balances.get("acct-1"), 150.5);

  scheduler.stop();
  assert.equal(stopCalled, true);
  assert(logEntries.some((entry) => entry.level === "info"));
});
