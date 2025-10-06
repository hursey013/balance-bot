import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createConfig, DEFAULT_DATA_DIR } from '../src/config.js';

test('createConfig returns defaults when persisted config is empty', () => {
  const config = createConfig();
  assert.equal(config.simplefin.accessUrl, '');
  assert.equal(
    config.simplefin.cacheFilePath,
    path.join(DEFAULT_DATA_DIR, 'cache.json'),
  );
  assert.equal(config.simplefin.cacheTtlMs, 60 * 60 * 1000);
  assert.equal(config.polling.cronExpression, '0 * * * *');
  assert.equal(config.notifier.appriseApiUrl, 'http://apprise:8000/notify');
  assert.equal(
    config.storage.stateFilePath,
    path.join(DEFAULT_DATA_DIR, 'state.json'),
  );
  assert.deepEqual(config.notifications.targets, []);
});

test('createConfig merges persisted overrides', () => {
  const persisted = {
    simplefin: {
      accessUrl: ' https://example.org/simplefin ',
      cacheFilePath: 'tmp/cache.json',
      cacheTtlMs: '5000',
    },
    notifier: {
      appriseApiUrl: ' http://apprise.local:8000/notify ',
    },
    notifications: {
      targets: [
        {
          name: 'Test',
          accountIds: ['acct-123'],
          appriseConfigKey: 'test-users',
        },
      ],
    },
    polling: {
      cronExpression: '*/15 * * * *',
    },
    storage: {
      stateFilePath: 'tmp/state.json',
    },
  };

  const config = createConfig({ persisted });

  assert.equal(config.simplefin.accessUrl, 'https://example.org/simplefin');
  assert.equal(
    config.simplefin.cacheFilePath,
    path.join(DEFAULT_DATA_DIR, 'tmp/cache.json'),
  );
  assert.equal(config.simplefin.cacheTtlMs, 5000);
  assert.equal(config.polling.cronExpression, '*/15 * * * *');
  assert.equal(
    config.notifier.appriseApiUrl,
    'http://apprise.local:8000/notify',
  );
  assert.equal(
    config.storage.stateFilePath,
    path.join(DEFAULT_DATA_DIR, 'tmp/state.json'),
  );
  assert.deepEqual(config.notifications.targets, [
    {
      name: 'Test',
      accountIds: ['acct-123'],
      appriseConfigKey: 'test-users',
    },
  ]);
});

test('createConfig sanitizes notification targets', () => {
  const persisted = {
    notifications: {
      targets: [
        {
          name: ' Elliot ',
          accountIds: [' acct-1 ', ''],
          appriseUrls: [' http://example.com ', null],
          appriseConfigKey: ' kids ',
        },
      ],
    },
  };

  const config = createConfig({ persisted });
  assert.deepEqual(config.notifications.targets, [
    {
      name: 'Elliot',
      accountIds: ['acct-1'],
      appriseUrls: ['http://example.com'],
      appriseConfigKey: 'kids',
    },
  ]);
});
