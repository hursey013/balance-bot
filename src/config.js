import path from 'node:path';
import 'dotenv/config';

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const trimOrEmpty = (value) => value?.trim() ?? '';

const config = {
  simplefin: {
    accessUrl: trimOrEmpty(process.env.SIMPLEFIN_ACCESS_URL),
    accessSecret: trimOrEmpty(process.env.SIMPLEFIN_ACCESS_SECRET),
    authScheme: process.env.SIMPLEFIN_AUTH_SCHEME || 'Token',
    accountId: trimOrEmpty(process.env.SIMPLEFIN_ACCOUNT_ID) || null,
    timeoutMs: numberFromEnv(process.env.SIMPLEFIN_TIMEOUT_MS, 10000),
  },
  polling: {
    cronExpression: trimOrEmpty(process.env.POLL_CRON_EXPRESSION) || '*/5 * * * *',
    suppressInitialNotification: process.env.SUPPRESS_INITIAL_NOTIFICATION !== 'false',
  },
  notifier: {
    appriseApiUrl: trimOrEmpty(process.env.APPRISE_API_URL) || 'http://apprise:8000/notify',
    appriseUrls: trimOrEmpty(process.env.APPRISE_NOTIFICATION_URLS),
    requestTimeoutMs: numberFromEnv(process.env.APPRISE_TIMEOUT_MS, 10000),
  },
  storage: {
    stateFilePath: trimOrEmpty(process.env.STATE_FILE_PATH) || path.resolve('data/state.json'),
  },
  service: {
    timezone: trimOrEmpty(process.env.TZ) || 'UTC',
  },
};

export default config;
