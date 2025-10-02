import path from 'node:path';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const trimOrEmpty = (value) => value?.trim() ?? '';

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(trimOrEmpty).filter(Boolean);
  }
  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseJsonSource = (raw) => {
  const value = trimOrEmpty(raw);
  if (!value) return null;
  const source = value.startsWith('@') ? value.slice(1) : value;
  const text = source.startsWith('[') || source.startsWith('{')
    ? source
    : readFileSync(path.resolve(source), 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse notification targets JSON: ${error.message}`);
  }
};

const normalizeTargets = (rawTargets, fallbackUrls) => {
  const input = Array.isArray(rawTargets)
    ? rawTargets
    : rawTargets && Array.isArray(rawTargets.targets)
      ? rawTargets.targets
      : [];

  const targets = input
    .map((target) => {
      if (!target || typeof target !== 'object') return null;
      const accountIds = normalizeList(target.accountIds);
      const urls = normalizeList(target.appriseUrls ?? target.urls);
      if (!urls.length) return null;
      return {
        name: trimOrEmpty(target.name) || null,
        accountIds: accountIds.length ? accountIds : ['*'],
        appriseUrls: urls,
      };
    })
    .filter(Boolean);

  if (targets.length) {
    return targets;
  }

  const urls = normalizeList(fallbackUrls);
  if (!urls.length) return [];
  return [
    {
      name: 'Default',
      accountIds: ['*'],
      appriseUrls: urls,
    },
  ];
};

const rawTargets = parseJsonSource(process.env.ACCOUNT_NOTIFICATION_TARGETS);

const config = {
  simplefin: {
    accessUrl: trimOrEmpty(process.env.SIMPLEFIN_ACCESS_URL),
    timeoutMs: numberFromEnv(process.env.SIMPLEFIN_TIMEOUT_MS, 10000),
  },
  polling: {
    cronExpression: trimOrEmpty(process.env.POLL_CRON_EXPRESSION) || '*/5 * * * *',
  },
  notifier: {
    appriseApiUrl: trimOrEmpty(process.env.APPRISE_API_URL) || 'http://apprise:8000/notify',
    requestTimeoutMs: numberFromEnv(process.env.APPRISE_TIMEOUT_MS, 10000),
  },
  notifications: {
    targets: normalizeTargets(rawTargets, process.env.APPRISE_NOTIFICATION_URLS),
  },
  storage: {
    stateFilePath: trimOrEmpty(process.env.STATE_FILE_PATH) || path.resolve('data/state.json'),
  },
};

export default config;
