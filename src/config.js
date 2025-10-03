import path from "node:path";
import "dotenv/config";
import { trim, normalizeCacheTtl } from "./utils.js";

const parseTargets = (raw) => {
  const value = trim(raw);
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `ACCOUNT_NOTIFICATION_TARGETS must be valid JSON: ${error.message}`,
    );
  }
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed?.targets) ? parsed.targets : [];
};

export const createConfig = (env = process.env) => {
  const accessUrl = trim(env.SIMPLEFIN_ACCESS_URL);
  const cronExpression = trim(env.POLL_CRON_EXPRESSION) || "0 * * * *";
  const appriseApiUrl = trim(env.APPRISE_API_URL) || "http://apprise:8000/notify";

  const statePathRaw = trim(env.STATE_FILE_PATH);
  const stateFilePath = statePathRaw
    ? path.resolve(statePathRaw)
    : path.resolve("data/state.json");

  const cachePathRaw = trim(env.SIMPLEFIN_CACHE_PATH);
  const cacheFilePath = cachePathRaw
    ? path.resolve(cachePathRaw)
    : path.resolve("data/cache.json");

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
