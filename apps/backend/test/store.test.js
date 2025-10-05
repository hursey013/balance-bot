import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import createStore from '../src/store.js';

test('state store persists balances to disk', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'balance-bot-state-'));
  const filePath = path.join(dir, 'state.json');

  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const store = createStore(filePath);
  assert.equal(await store.getLastBalance('acct-1'), null);

  await store.setLastBalance('acct-1', 123.45);
  assert.equal(await store.getLastBalance('acct-1'), 123.45);

  const reopened = createStore(filePath);
  assert.equal(await reopened.getLastBalance('acct-1'), 123.45);
});

test('state store save flushes data without duplicates', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'balance-bot-state-'));
  const filePath = path.join(dir, 'state.json');

  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const store = createStore(filePath);
  await store.setLastBalance('acct-2', 42);
  await store.save();

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(raw.accounts['acct-2'], { lastBalance: 42 });
});
