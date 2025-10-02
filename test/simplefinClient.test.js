import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import createSimplefinClient from "../src/simplefinClient.js";

const withTempDir = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "balance-bot-test-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
};

test("SimpleFIN client caches results when TTL is positive", async (t) => {
  const tempDir = await withTempDir(t);
  const cachePath = path.join(tempDir, "cache.json");
  const originalFetch = global.fetch;
  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  let callCount = 0;
  const accountsPayload = [{ id: "acct-1", balance: "100", currency: "USD" }];
  global.fetch = async () => {
    callCount += 1;
    if (callCount > 1) {
      throw new Error("fetch should only be called once when cached");
    }
    return {
      ok: true,
      json: async () => ({ accounts: accountsPayload }),
    };
  };

  const client = createSimplefinClient({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 60_000,
  });

  const first = await client.fetchAccounts();
  assert.deepEqual(first, accountsPayload);
  const second = await client.fetchAccounts();
  assert.deepEqual(second, accountsPayload);
  assert.equal(callCount, 1);
});

test("SimpleFIN client bypasses cache when TTL is zero", async (t) => {
  const tempDir = await withTempDir(t);
  const cachePath = path.join(tempDir, "cache.json");
  const originalFetch = global.fetch;
  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => ({ accounts: [{ id: `acct-${callCount}` }] }),
    };
  };

  const client = createSimplefinClient({
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
  const tempDir = await withTempDir(t);
  const cachePath = path.join(tempDir, "cache.json");
  const originalFetch = global.fetch;
  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  let lastRequest = null;
  global.fetch = async (url, options) => {
    lastRequest = { url, options };
    return { ok: true, json: async () => ({ accounts: [] }) };
  };

  const client = createSimplefinClient({
    accessUrl: "https://name:secret@beta-bridge.simplefin.org/access",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await client.fetchAccounts();

  assert(lastRequest);
  assert.equal(
    lastRequest.options.headers.Authorization,
    `Basic ${Buffer.from("name:secret").toString("base64")}`,
  );
});

test("SimpleFIN client throws when SimpleFIN responds without accounts", async (t) => {
  const tempDir = await withTempDir(t);
  const cachePath = path.join(tempDir, "cache.json");
  const originalFetch = global.fetch;
  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  const client = createSimplefinClient({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await assert.rejects(
    () => client.fetchAccounts(),
    /missing accounts array/i,
  );
});

test("SimpleFIN client surfaces HTTP failures", async (t) => {
  const tempDir = await withTempDir(t);
  const cachePath = path.join(tempDir, "cache.json");
  const originalFetch = global.fetch;
  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  const client = createSimplefinClient({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await assert.rejects(
    () => client.fetchAccounts(),
    /SimpleFIN request failed with status 500/i,
  );
});
