import path from "node:path";
import "dotenv/config";

const trim = (value) => value?.trim() ?? "";

const parseTargets = (raw) => {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed?.targets) ? parsed.targets : [];
};

const normalizeCacheTtl = (value) => {
  const defaultTtl = 15 * 60 * 1000;
  if (value === undefined) {
    return defaultTtl;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultTtl;
};

export const createConfig = (env = process.env) => {
  const accessUrl = trim(env.SIMPLEFIN_ACCESS_URL);
  const cronExpression = trim(env.POLL_CRON_EXPRESSION) || "*/5 * * * *";
  const appriseApiUrl = trim(env.APPRISE_API_URL) || "http://apprise:8000/notify";

  const statePathRaw = trim(env.STATE_FILE_PATH);
  const stateFilePath = statePathRaw
    ? path.resolve(statePathRaw)
    : path.resolve("data/state.json");

  const cachePathRaw = trim(env.SIMPLEFIN_CACHE_PATH);
  const cacheFilePath = cachePathRaw
    ? path.resolve(cachePathRaw)
    : path.resolve("data/simplefin-cache.json");

  const cacheTtlMs = normalizeCacheTtl(env.SIMPLEFIN_CACHE_TTL_MS);

  const targets = parseTargets(env.ACCOUNT_NOTIFICATION_TARGETS);

  return {
    simplefin: {
      accessUrl,
      cacheFilePath,
      cacheTtlMs,
    },
    polling: {
      cronExpression,
    },
    notifier: {
      appriseApiUrl,
    },
    notifications: {
      targets,
    },
    storage: {
      stateFilePath,
    },
  };
};

const config = createConfig();

export default config;
