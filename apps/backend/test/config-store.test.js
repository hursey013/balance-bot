import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../src/config.js';

const createTempPath = async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'balance-bot-config-store-'),
  );
  return {
    dir,
    file: path.join(dir, 'config.json'),
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

test('returns defaults when config file is missing', async () => {
  const store = new ConfigStore({ filePath: temp.file });
  const config = await store.get();
  assert.deepEqual(config.notifications.targets, []);
  assert.equal(config.simplefin.accessUrl, '');
  assert.equal(config.metadata.onboarding.simplefinConfigured, false);
  assert.equal(config.metadata.onboarding.targetsConfigured, false);
});

test('stores simplefin access url in config', async () => {
  const store = new ConfigStore({ filePath: temp.file });
  await store.setSimplefinAccess(
    'https://user:pass@bridge.simplefin.org/simplefin',
  );
  const config = await store.get();
  assert.equal(
    config.simplefin.accessUrl,
    'https://user:pass@bridge.simplefin.org/simplefin',
  );
  assert.equal(config.metadata.onboarding.simplefinConfigured, true);
});

test('sanitizes notification targets', async () => {
  const store = new ConfigStore({ filePath: temp.file });
  await store.setNotificationTargets([
    {
      name: 'Team',
      accountIds: [' acct-1 ', 'acct-1'],
      appriseUrls: ['  discord://hook  '],
    },
  ]);

  const config = await store.get();
  assert.deepEqual(config.notifications.targets, [
    {
      name: 'Team',
      accountIds: ['acct-1'],
      appriseUrls: ['discord://hook'],
    },
  ]);
  assert.equal(config.metadata.onboarding.targetsConfigured, true);
});

test('clearing notification targets updates onboarding metadata', async () => {
  const store = new ConfigStore({ filePath: temp.file });
  await store.setNotificationTargets([
    { name: 'Family', accountIds: ['acct-1'] },
  ]);
  await store.setNotificationTargets([]);

  const config = await store.get();
  assert.deepEqual(config.notifications.targets, []);
  assert.equal(config.metadata.onboarding.targetsConfigured, false);
});
