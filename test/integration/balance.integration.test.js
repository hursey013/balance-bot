import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createConfig } from "../../src/config.js";
import createSimplefinClient from "../../src/simplefin.js";
import createNotifier from "../../src/notifier.js";
import createStore from "../../src/store.js";
import createBalanceProcessor from "../../src/balance.js";

const withTempDir = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "balance-bot-int-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
};

test("balance processor integrates simplefin, store, and notifier", async (t) => {
  const tempDir = await withTempDir(t);
  const stateFile = path.join(tempDir, "state.json");
  const cacheFile = path.join(tempDir, "cache.json");

  const env = {
    SIMPLEFIN_ACCESS_URL: "https://user:pass@bridge.simplefin.org/simplefin",
    STATE_FILE_PATH: stateFile,
    SIMPLEFIN_CACHE_PATH: cacheFile,
    SIMPLEFIN_CACHE_TTL_MS: "0",
    ACCOUNT_NOTIFICATION_TARGETS: JSON.stringify([
      {
        name: "Integration",
        accountIds: ["acct-1"],
        appriseUrls: ["http://apprise.local/notify"],
      },
    ]),
    APPRISE_API_URL: "http://apprise.local/notify",
  };

  const config = createConfig({ env });

  const originalFetch = global.fetch;
  const simplefinSnapshots = [
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
        balance: "150.25",
        currency: "USD",
      },
    ],
  ];

  const appriseRequests = [];

  global.fetch = async (url, options = {}) => {
    const stringUrl = String(url);
    if (stringUrl.includes("bridge.simplefin.org")) {
      const payload = simplefinSnapshots.shift();
      return {
        ok: true,
        json: async () => ({ accounts: payload ?? [] }),
      };
    }
    if (stringUrl.includes("apprise.local")) {
      appriseRequests.push({ url: stringUrl, options });
      return {
        ok: true,
        text: async () => "",
      };
    }
    throw new Error(`Unexpected fetch call to ${stringUrl}`);
  };

  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  const simplefinClient = createSimplefinClient({
    env,
    accessUrlFilePath: config.simplefin.accessUrlFilePath,
    cacheFilePath: config.simplefin.cacheFilePath,
    cacheTtlMs: config.simplefin.cacheTtlMs,
  });

  if (config.simplefin.accessUrl) {
    simplefinClient.setAccessUrl(config.simplefin.accessUrl);
  }
  await simplefinClient.ensureAccess();
  const notifier = createNotifier(config.notifier);
  const store = createStore(config.storage.stateFilePath);
  const balanceProcessor = createBalanceProcessor({
    simplefinClient,
    notifier,
    store,
    config,
  });

  await balanceProcessor.checkBalances();
  assert.equal(appriseRequests.length, 0);

  await balanceProcessor.checkBalances();
  assert.equal(appriseRequests.length, 1);

  const [request] = appriseRequests;
  assert.equal(request.url, "http://apprise.local/notify");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.title, "Balance update");
  assert(payload.body.includes("👤 Primary"));
  assert(payload.body.includes("💰 $150.25"));

  const persistedRaw = await fs.readFile(stateFile, "utf8");
  const persisted = JSON.parse(persistedRaw);
  assert.equal(persisted.accounts["acct-1"].lastBalance, 150.25);
});
