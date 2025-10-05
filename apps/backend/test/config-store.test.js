import { strict as assert } from "node:assert";
import { afterEach, beforeEach, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ConfigStore from "../src/config-store.js";

const createTempPath = async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "balance-bot-config-store-"),
  );
  return {
    dir,
    file: path.join(dir, "config.json"),
  };
};

let temp;

beforeEach(async () => {
  temp = await createTempPath();
});

afterEach(async () => {
  if (temp) {
    await fs.rm(temp.dir, { recursive: true, force: true });
  }
});

test("returns defaults when config file is missing", async () => {
  const store = new ConfigStore({ filePath: temp.file });
  const config = await store.get();
  assert.equal(config.notifier.appriseApiUrl, "http://apprise:8000/notify");
  assert.deepEqual(config.notifications.targets, []);
  assert.equal(config.simplefin.accessUrl, "");
});

test("stores simplefin access url in config", async () => {
  const store = new ConfigStore({ filePath: temp.file });
  await store.setSimplefinAccess(
    "https://user:pass@bridge.simplefin.org/simplefin",
  );
  const config = await store.get();
  assert.equal(
    config.simplefin.accessUrl,
    "https://user:pass@bridge.simplefin.org/simplefin",
  );
});

test("sanitizes notification targets", async () => {
  const store = new ConfigStore({ filePath: temp.file });
  await store.setNotificationTargets([
    {
      name: "Team",
      accountIds: [" acct-1 ", "acct-1"],
      appriseUrls: ["  discord://hook  "],
    },
  ]);

  const config = await store.get();
  assert.deepEqual(config.notifications.targets, [
    {
      name: "Team",
      accountIds: ["acct-1"],
      appriseUrls: ["discord://hook"],
    },
  ]);
});
