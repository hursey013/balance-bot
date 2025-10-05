import path from "node:path";
import { fileURLToPath } from "node:url";
import { trim, normalizeCacheTtl } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

/**
 * @typedef {object} BalanceBotConfig
 * @property {{ accessUrl: string, cacheFilePath: string, cacheTtlMs: number }} simplefin
 * @property {{ cronExpression: string }} polling
 * @property {{ appriseApiUrl: string }} notifier
 * @property {{ targets: Array<Record<string, any>> }} notifications
 * @property {{ stateFilePath: string }} storage
 * @property {{ filePath: string }} metadata
 */

const sanitizeTargets = (targets) => {
  if (!Array.isArray(targets)) return [];
  return targets.map((target) => {
    const accountIds = Array.isArray(target.accountIds)
      ? Array.from(
          new Set(target.accountIds.map((id) => trim(id)).filter(Boolean)),
        )
      : [];
    const appriseUrls = Array.isArray(target.appriseUrls)
      ? Array.from(
          new Set(target.appriseUrls.map((url) => trim(url)).filter(Boolean)),
        )
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
  });
};

const resolveDataDir = () => {
  const configured = trim(process.env.BALANCE_BOT_DATA_DIR);
  if (configured) {
    return path.isAbsolute(configured)
      ? path.resolve(configured)
      : path.resolve(PROJECT_ROOT, configured);
  }
  return path.join(PROJECT_ROOT, "data");
};

const DEFAULT_DATA_DIR = resolveDataDir();
const DEFAULT_STATE_FILE = path.join(DEFAULT_DATA_DIR, "state.json");
const DEFAULT_CACHE_FILE = path.join(DEFAULT_DATA_DIR, "cache.json");
const DEFAULT_CONFIG_FILE = path.join(DEFAULT_DATA_DIR, "config.json");
const DEFAULT_APPRISE_URL = "http://apprise:8000/notify";
const DEFAULT_CRON = "0 * * * *";

const resolvePath = (value, fallback) => {
  const trimmed = trim(value);
  if (!trimmed) return fallback;
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.join(DEFAULT_DATA_DIR, trimmed);
};

export const createConfig = ({ persisted = {} } = {}) => {
  const simplefin = persisted.simplefin ?? {};
  const notifier = persisted.notifier ?? {};
  const notifications = persisted.notifications ?? {};
  const polling = persisted.polling ?? {};
  const storage = persisted.storage ?? {};
  const metadata = persisted.metadata ?? {};

  const targets = sanitizeTargets(notifications.targets) ?? [];

  const cacheTtlMs = normalizeCacheTtl(simplefin.cacheTtlMs);

  return {
    simplefin: {
      accessUrl: trim(simplefin.accessUrl),
      cacheFilePath: resolvePath(simplefin.cacheFilePath, DEFAULT_CACHE_FILE),
      cacheTtlMs,
    },
    notifier: {
      appriseApiUrl: trim(notifier.appriseApiUrl) || DEFAULT_APPRISE_URL,
    },
    notifications: {
      targets,
    },
    polling: {
      cronExpression: trim(polling.cronExpression) || DEFAULT_CRON,
    },
    storage: {
      stateFilePath: resolvePath(storage.stateFilePath, DEFAULT_STATE_FILE),
    },
    metadata: {
      filePath: resolvePath(metadata.filePath, DEFAULT_CONFIG_FILE),
    },
  };
};

/** @typedef {ReturnType<typeof createConfig>} BalanceBotConfig */

export { sanitizeTargets, DEFAULT_DATA_DIR };

export default createConfig;
