import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createConfig } from "../src/config.js";

test("createConfig returns defaults when env is empty", () => {
  const config = createConfig({});
  assert.equal(config.simplefin.accessUrl, "");
  assert.equal(config.simplefin.cacheFilePath, path.resolve("data/cache.json"));
  assert.equal(config.simplefin.cacheTtlMs, 60 * 60 * 1000);
  assert.equal(config.polling.cronExpression, "0 * * * *");
  assert.equal(config.notifier.appriseApiUrl, "http://apprise:8000/notify");
  assert.equal(config.storage.stateFilePath, path.resolve("data/state.json"));
  assert.deepEqual(config.notifications.targets, []);
});

test("createConfig respects override values", () => {
  const env = {
    SIMPLEFIN_ACCESS_URL: " https://example.org/simplefin ",
    SIMPLEFIN_CACHE_TTL_MS: "5000",
    SIMPLEFIN_CACHE_PATH: "tmp/cache.json",
    POLL_CRON_EXPRESSION: "0 * * * *",
    APPRISE_API_URL: "http://apprise.local:8000/notify",
    STATE_FILE_PATH: "tmp/state.json",
    ACCOUNT_NOTIFICATION_TARGETS: JSON.stringify([
      {
        name: "Test",
        accountIds: ["acct-123"],
        appriseConfigKey: "test-users",
      },
      {
        name: "Alerts",
        accountIds: ["acct-999"],
        appriseUrls: ["pover://token@user"],
      },
    ]),
  };

  const config = createConfig(env);

  assert.equal(config.simplefin.accessUrl, "https://example.org/simplefin");
  assert.equal(config.simplefin.cacheFilePath, path.resolve("tmp/cache.json"));
  assert.equal(config.simplefin.cacheTtlMs, 5000);
  assert.equal(config.polling.cronExpression, "0 * * * *");
  assert.equal(
    config.notifier.appriseApiUrl,
    "http://apprise.local:8000/notify",
  );
  assert.equal(config.storage.stateFilePath, path.resolve("tmp/state.json"));
  assert.deepEqual(config.notifications.targets, [
    {
      name: "Test",
      accountIds: ["acct-123"],
      appriseConfigKey: "test-users",
    },
    {
      name: "Alerts",
      accountIds: ["acct-999"],
      appriseUrls: ["pover://token@user"],
    },
  ]);
});

test("createConfig treats blank target env as empty array", () => {
  const env = {
    ACCOUNT_NOTIFICATION_TARGETS: "   ",
  };

  const config = createConfig(env);
  assert.deepEqual(config.notifications.targets, []);
});

test("createConfig trims target fields and discards blanks", () => {
  const env = {
    ACCOUNT_NOTIFICATION_TARGETS: JSON.stringify([
      {
        name: " Elliot ",
        accountIds: [" acct-1 ", ""],
        appriseUrls: [" http://example.com ", null],
        appriseConfigKey: " kids ",
      },
    ]),
  };

  const config = createConfig(env);
  assert.deepEqual(config.notifications.targets, [
    {
      name: "Elliot",
      accountIds: ["acct-1"],
      appriseUrls: ["http://example.com"],
      appriseConfigKey: "kids",
    },
  ]);
});
