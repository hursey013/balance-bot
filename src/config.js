import path from "node:path";
import "dotenv/config";
import { trim, normalizeCacheTtl } from "./utils.js";

/**
 * @typedef {object} BalanceBotConfig
 * @property {{ accessUrl: string, cacheFilePath: string, cacheTtlMs: number, accessUrlFilePath?: string }} simplefin
 * @property {{ cronExpression: string }} polling
 * @property {{ appriseApiUrl: string }} notifier
 * @property {{ targets: Array<Record<string, any>> }} notifications
 * @property {{ stateFilePath: string }} storage
 */

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

export const createConfig = ({
  env = process.env,
  accessUrl,
  accessUrlFilePath,
} = {}) => {
  const resolvedAccessUrl = trim(accessUrl ?? env.SIMPLEFIN_ACCESS_URL);
  const cronExpression = trim(env.POLL_CRON_EXPRESSION) || "0 * * * *";
  const appriseApiUrl =
    trim(env.APPRISE_API_URL) || "http://apprise:8000/notify";

  const statePathRaw = trim(env.STATE_FILE_PATH);
  const stateFilePath = statePathRaw
    ? path.resolve(statePathRaw)
    : path.resolve("data/state.json");

  const cachePathRaw = trim(env.SIMPLEFIN_CACHE_PATH);
  const cacheFilePath = cachePathRaw
    ? path.resolve(cachePathRaw)
    : path.resolve("data/cache.json");

  const cacheTtlMs = normalizeCacheTtl(env.SIMPLEFIN_CACHE_TTL_MS);

  const targets = parseTargets(env.ACCOUNT_NOTIFICATION_TARGETS).map(
    (target) => {
      const accountIds = Array.isArray(target.accountIds)
        ? target.accountIds.map((id) => trim(id)).filter(Boolean)
        : [];
      const appriseUrls = Array.isArray(target.appriseUrls)
        ? target.appriseUrls.map((url) => trim(url)).filter(Boolean)
        : [];
      const appriseConfigKey = target.appriseConfigKey
        ? trim(target.appriseConfigKey)
        : "";
      const name =
        typeof target.name === "string" ? target.name.trim() : target.name;

      const sanitized = {
        ...target,
        name,
        accountIds,
      };

      if (appriseUrls.length) {
        sanitized.appriseUrls = appriseUrls;
      } else {
        delete sanitized.appriseUrls;
      }

      if (appriseConfigKey) {
        sanitized.appriseConfigKey = appriseConfigKey;
      } else {
        delete sanitized.appriseConfigKey;
      }

      return sanitized;
    },
  );

  return {
    simplefin: {
      accessUrl: resolvedAccessUrl,
      cacheFilePath,
      cacheTtlMs,
      accessUrlFilePath,
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

/** @typedef {ReturnType<typeof createConfig>} BalanceBotConfig */

export default createConfig;
