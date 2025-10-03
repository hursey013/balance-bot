import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureSimplefinAccess } from "../src/simplefin.js";

const withTempDir = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "balance-bot-access-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
};

test("ensureSimplefinAccess prefers explicit env secret", async (t) => {
  const tempDir = await withTempDir(t);
  const targetFile = path.join(tempDir, "secret");

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
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
  const tempDir = await withTempDir(t);
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
  const tempDir = await withTempDir(t);
  const targetFile = path.join(tempDir, "simplefin-access-url");

  let lastRequest;
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url, options) => {
    lastRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        access_url: "https://demo:secret@bridge.simplefin.org/simplefin",
        expires_at: "2099-01-01T00:00:00Z",
      }),
    };
  };

  const env = {
    SIMPLEFIN_SETUP_TOKEN: "demo-token",
  };

  const result = await ensureSimplefinAccess({ env, accessUrlFilePath: targetFile });

  assert.ok(lastRequest);
  assert.equal(lastRequest.options.method, "POST");
  assert.equal(
    JSON.parse(lastRequest.options.body).token,
    "demo-token",
  );
  assert.equal(result.accessUrl, "https://demo:secret@bridge.simplefin.org/simplefin");
  assert.equal(result.source, "token");
  assert.equal(result.expiresAt, "2099-01-01T00:00:00Z");
  const stored = await fs.readFile(targetFile, "utf8");
  assert.match(stored, /https:\/\/demo:secret@bridge.simplefin.org\/simplefin/);
});
