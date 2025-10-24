import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createConfig, DEFAULT_DATA_DIR } from '../src/config.js';

const withEnv = (t, overrides) => {
  const entries = Object.entries(overrides);
  const previous = entries.map(([key]) => [key, process.env[key]]);
  for (const [key, value] of entries) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
};

test('createConfig returns defaults when persisted config is empty', (t) => {
  withEnv(t, {
    APPRISE_API_URL: undefined,
    BALANCE_BOT_CRON: undefined,
    HEALTHCHECKS_PING_URL: undefined,
    BALANCE_BOT_STATE_FILE: undefined,
  });

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
  assert.equal(config.healthchecks.pingUrl, '');
  assert.equal(config.metadata.onboarding.simplefinConfigured, false);
  assert.equal(config.metadata.onboarding.targetsConfigured, false);
});

test('createConfig merges persisted overrides', (t) => {
  withEnv(t, {
    APPRISE_API_URL: undefined,
    BALANCE_BOT_CRON: undefined,
    HEALTHCHECKS_PING_URL: undefined,
    BALANCE_BOT_STATE_FILE: undefined,
  });

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
    healthchecks: {
      pingUrl: ' https://hc-ping.example.com/uuid ',
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
  assert.equal(
    config.healthchecks.pingUrl,
    'https://hc-ping.example.com/uuid',
  );
  assert.equal(config.metadata.onboarding.simplefinConfigured, true);
  assert.equal(config.metadata.onboarding.targetsConfigured, true);
});

test('environment variables override persisted config', (t) => {
  withEnv(t, {
    APPRISE_API_URL: ' https://apprise.example.com/notify ',
    BALANCE_BOT_CRON: '*/10 * * * *',
    HEALTHCHECKS_PING_URL: ' https://hc.env/uuid ',
    BALANCE_BOT_STATE_FILE: ' /var/lib/balance/state.json ',
  });

  const persisted = {
    notifier: {
      appriseApiUrl: 'http://apprise.local:8000/notify',
    },
    polling: {
      cronExpression: '0 * * * *',
    },
    healthchecks: {
      pingUrl: 'https://hc-persisted/uuid',
    },
    storage: {
      stateFilePath: 'state.json',
    },
  };

  const config = createConfig({ persisted });
  assert.equal(
    config.notifier.appriseApiUrl,
    'https://apprise.example.com/notify',
  );
  assert.equal(config.polling.cronExpression, '*/10 * * * *');
  assert.equal(config.healthchecks.pingUrl, 'https://hc.env/uuid');
  assert.equal(
    config.storage.stateFilePath,
    path.join('/var/lib/balance/state.json'),
  );
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
