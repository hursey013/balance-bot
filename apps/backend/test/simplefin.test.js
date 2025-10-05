import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nock from "nock";
import createSimplefinClient, { createSimplefinApi } from "../src/simplefin.js";

nock.disableNetConnect();

const withTempDir = async (t, prefix) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
};

const baseSimplefinScope = (t) => {
  t.after(() => {
    if (!nock.isDone()) {
      const pending = nock.pendingMocks();
      nock.cleanAll();
      throw new Error(`Pending mocks: ${pending.join(", ")}`);
    }
  });
};

test("SimpleFIN client caches results when TTL is positive", async (t) => {
  baseSimplefinScope(t);
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");

  let callCount = 0;
  nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query({ "balances-only": "1" })
    .reply(() => {
      callCount += 1;
      return [
        200,
        { accounts: [{ id: "acct-1", balance: "100", currency: "USD" }] },
      ];
    });

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 60_000,
  });

  const first = await client.fetchAccounts();
  const second = await client.fetchAccounts();

  assert.deepEqual(first, second);
  assert.equal(callCount, 1);
});

test("SimpleFIN client bypasses cache when TTL is zero", async (t) => {
  baseSimplefinScope(t);
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");

  let callCount = 0;
  nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query({ "balances-only": "1" })
    .times(2)
    .reply(() => {
      callCount += 1;
      return [200, { accounts: [{ id: `acct-${callCount}` }] }];
    });

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  const first = await client.fetchAccounts();
  const second = await client.fetchAccounts();
  assert.equal(callCount, 2);
  assert.notDeepEqual(first, second);
});

test("SimpleFIN client includes Basic Auth credentials", async (t) => {
  baseSimplefinScope(t);
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");

  let lastAuth = null;
  nock("https://beta-bridge.simplefin.org")
    .get("/access/accounts")
    .query({ "balances-only": "1" })
    .reply(function () {
      lastAuth = this.req.headers.authorization;
      return [200, { accounts: [] }];
    });

  const client = createSimplefinApi({
    accessUrl: "https://name:secret@beta-bridge.simplefin.org/access",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await client.fetchAccounts();

  assert.equal(
    lastAuth,
    `Basic ${Buffer.from("name:secret").toString("base64")}`,
  );
});

test("SimpleFIN client does not double-append accounts path", async (t) => {
  baseSimplefinScope(t);
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");

  let requestedPath;
  nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query({ "balances-only": "1" })
    .reply(function () {
      requestedPath = this.req.path;
      return [200, { accounts: [] }];
    });

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin/accounts",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await client.fetchAccounts();

  assert(requestedPath.endsWith("/simplefin/accounts?balances-only=1"));
});

test("SimpleFIN client throws when SimpleFIN responds without accounts", async (t) => {
  baseSimplefinScope(t);
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");

  nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query({ "balances-only": "1" })
    .reply(200, {});

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await assert.rejects(() => client.fetchAccounts(), /missing accounts array/i);
});

test("SimpleFIN client surfaces HTTP failures", async (t) => {
  baseSimplefinScope(t);
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");

  nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query({ "balances-only": "1" })
    .reply(500, "Internal Server Error");

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await assert.rejects(
    () => client.fetchAccounts(),
    /SimpleFIN request failed with status 500/i,
  );
});

test("createSimplefinClient requires an access URL", async (t) => {
  baseSimplefinScope(t);
  const client = createSimplefinClient();
  await assert.rejects(() => client.fetchAccounts(), /access URL is required/i);
});

test("createSimplefinClient fetches accounts when configured", async (t) => {
  baseSimplefinScope(t);

  nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query({ "balances-only": "1" })
    .reply(200, { accounts: [{ id: "acct-123" }] });

  const client = createSimplefinClient({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheTtlMs: 0,
  });

  const result = await client.fetchAccounts();
  assert.deepEqual(result, [{ id: "acct-123" }]);
});

test("createSimplefinClient updates access URL via setAccessUrl", async (t) => {
  baseSimplefinScope(t);

  const firstScope = nock("https://bridge.simplefin.org")
    .get("/simplefin/accounts")
    .query(true)
    .reply(200, { accounts: [{ id: "old" }] });

  const secondScope = nock("https://beta-bridge.simplefin.org")
    .get("/new/accounts")
    .query(true)
    .reply(200, { accounts: [{ id: "new" }] });

  const client = createSimplefinClient({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheTtlMs: 0,
  });

  const first = await client.fetchAccounts();
  assert.deepEqual(first, [{ id: "old" }]);
  assert(firstScope.isDone());

  client.setAccessUrl("https://api:secret@beta-bridge.simplefin.org/new");

  const second = await client.fetchAccounts();
  assert.deepEqual(second, [{ id: "new" }]);
  assert(secondScope.isDone());
  assert.equal(client.getAccessInfo().source, "manual");
});
