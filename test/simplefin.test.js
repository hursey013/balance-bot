import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import createSimplefinClient, {
  createSimplefinApi,
  ensureSimplefinAccess,
} from "../src/simplefin.js";

const withTempDir = async (t, prefix) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
};

const restoreFetch = (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });
  return originalFetch;
};

test("SimpleFIN client caches results when TTL is positive", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");
  restoreFetch(t);

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

  const client = createSimplefinApi({
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
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");
  restoreFetch(t);

  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => ({ accounts: [{ id: `acct-${callCount}` }] }),
    };
  };

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
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");
  restoreFetch(t);

  let lastRequest = null;
  global.fetch = async (url, options) => {
    lastRequest = { url, options };
    return { ok: true, json: async () => ({ accounts: [] }) };
  };

  const client = createSimplefinApi({
    accessUrl: "https://name:secret@beta-bridge.simplefin.org/access",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await client.fetchAccounts();

  assert(lastRequest);
  assert(lastRequest.url.includes("/access/accounts?"));
  assert.equal(
    lastRequest.options.headers.Authorization,
    `Basic ${Buffer.from("name:secret").toString("base64")}`,
  );
});

test("SimpleFIN client does not double-append accounts path", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");
  restoreFetch(t);

  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = url;
    return { ok: true, json: async () => ({ accounts: [] }) };
  };

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin/accounts",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await client.fetchAccounts();

  assert(calledUrl);
  const url = new URL(calledUrl);
  assert.equal(url.pathname.endsWith("/accounts"), true);
});

test("SimpleFIN client throws when SimpleFIN responds without accounts", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");
  restoreFetch(t);

  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  const client = createSimplefinApi({
    accessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    cacheFilePath: cachePath,
    cacheTtlMs: 0,
  });

  await assert.rejects(() => client.fetchAccounts(), /missing accounts array/i);
});

test("SimpleFIN client surfaces HTTP failures", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-cache-");
  const cachePath = path.join(tempDir, "cache.json");
  restoreFetch(t);

  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

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

test("ensureSimplefinAccess prefers explicit env secret", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-access-");
  const targetFile = path.join(tempDir, "secret");
  restoreFetch(t);

  global.fetch = () => {
    throw new Error("fetch should not be called when SIMPLEFIN_ACCESS_URL is set");
  };

  const env = {
    SIMPLEFIN_ACCESS_URL: "https://user:pass@bridge.simplefin.org/simplefin",
  };

  const result = await ensureSimplefinAccess({ env, accessUrlFilePath: targetFile });
  assert.equal(result.accessUrl, env.SIMPLEFIN_ACCESS_URL);
  assert.equal(result.source, "env");
  assert.equal(result.filePath, path.resolve(targetFile));
});

test("ensureSimplefinAccess reads secret from file when present", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-access-");
  const targetFile = path.join(tempDir, "simplefin-access-url");
  await fs.writeFile(targetFile, "https://user:pass@bridge.simplefin.org/simplefin\n", {
    mode: 0o600,
  });

  const env = {};
  const result = await ensureSimplefinAccess({ env, accessUrlFilePath: targetFile });
  assert.equal(result.accessUrl, "https://user:pass@bridge.simplefin.org/simplefin");
  assert.equal(result.source, "file");
  assert.equal(result.filePath, path.resolve(targetFile));
});

test("ensureSimplefinAccess exchanges setup token and writes file", async (t) => {
  const tempDir = await withTempDir(t, "balance-bot-access-");
  const targetFile = path.join(tempDir, "simplefin-access-url");
  restoreFetch(t);

  let lastRequest;
  global.fetch = async (url, options) => {
    lastRequest = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => "https://demo:secret@bridge.simplefin.org/simplefin",
    };
  };

  const claimUrl = "https://bridge.simplefin.org/connect/claim/demo";
  const encodedToken = Buffer.from(claimUrl, "utf8").toString("base64");
  const env = {
    SIMPLEFIN_SETUP_TOKEN: encodedToken,
  };

  const result = await ensureSimplefinAccess({ env, accessUrlFilePath: targetFile });

  assert.ok(lastRequest);
  assert.equal(lastRequest.url, claimUrl);
  assert.equal(lastRequest.options.method, "POST");
  assert.equal(lastRequest.options.body, undefined);
  assert.deepEqual(lastRequest.options.headers ?? {}, {});
  assert.equal(result.accessUrl, "https://demo:secret@bridge.simplefin.org/simplefin");
  assert.equal(result.source, "token");
  assert.equal(result.expiresAt, null);
  const stored = await fs.readFile(targetFile, "utf8");
  assert.match(stored, /https:\/\/demo:secret@bridge.simplefin.org\/simplefin/);
});
