import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';
import { trim, normalizeCacheTtl } from './utils.js';

/**
 * Configuration management utilities for balance-bot.
 *
 * The backend persists only the pieces of state that require user interaction
 * through the onboarding UI (SimpleFIN access links and notification targets).
 * Everything else is sourced from environment variables so deployments can rely
 * on familiar `.env` or container-based configuration.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Perform a deep clone of supported JSON data structures.
 * @template T
 * @param {T} value
 * @returns {T}
 */
const clone = (value) => structuredClone(value);

/**
 * Treat unknown values as empty arrays.
 * @param {any} value
 * @returns {Array}
 */
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Normalize a list of values by trimming whitespace and dropping empty entries.
 * Duplicates are removed to avoid sending the same notification twice.
 * @param {any} value
 * @returns {string[]}
 */
const normalizeList = (value) => {
  const seen = new Set();
  for (const entry of asArray(value)) {
    const trimmed = trim(entry);
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
};

/**
 * Normalize notification targets while largely trusting user input.
 * We trim common string fields and ensure list properties are arrays, but avoid
 * aggressively pruning other values so advanced users can extend the payload.
 * @param {Array<Record<string, any>>|undefined} targets
 * @returns {Array<Record<string, any>>}
 */
const normalizeTargets = (targets) =>
  asArray(targets).map((target) => {
    const normalized = {
      ...target,
      name:
        typeof target?.name === 'string' ? target.name.trim() : target?.name,
      accountIds: normalizeList(target?.accountIds),
      appriseUrls: normalizeList(target?.appriseUrls),
    };

    const appriseConfigKey =
      typeof target?.appriseConfigKey === 'string'
        ? target.appriseConfigKey.trim()
        : '';

    if (appriseConfigKey) {
      normalized.appriseConfigKey = appriseConfigKey;
    } else {
      delete normalized.appriseConfigKey;
    }

    if (normalized.appriseUrls.length === 0) {
      delete normalized.appriseUrls;
    }

    return normalized;
  });

/**
 * Read and trim an environment variable, returning undefined when unset.
 * @param {string} name
 * @returns {string|undefined}
 */
const readEnv = (name) => {
  const value = trim(process.env[name]);
  return value || undefined;
};

/**
 * Resolve the base data directory, honoring BALANCE_BOT_DATA_DIR when provided.
 * @returns {string}
 */
const resolveDataDir = () => {
  const configured = readEnv('BALANCE_BOT_DATA_DIR');
  if (configured) {
    return path.isAbsolute(configured)
      ? path.resolve(configured)
      : path.resolve(PROJECT_ROOT, configured);
  }
  return path.join(PROJECT_ROOT, 'data');
};

const DEFAULT_DATA_DIR = resolveDataDir();
const DEFAULT_STATE_FILE = path.join(DEFAULT_DATA_DIR, 'state.json');
const DEFAULT_CACHE_FILE = path.join(DEFAULT_DATA_DIR, 'cache.json');
const DEFAULT_CONFIG_FILE = path.join(DEFAULT_DATA_DIR, 'config.json');
const DEFAULT_APPRISE_URL = 'http://apprise:8000/notify';
const DEFAULT_CRON = '0 * * * *';
const DEFAULT_ONBOARDING_STATE = {
  simplefinConfigured: false,
  targetsConfigured: false,
};

/**
 * Resolve a config path relative to the data directory when needed.
 * @param {string|undefined} value
 * @param {string} fallback
 * @returns {string}
 */
const resolvePath = (value, fallback) => {
  const trimmed = trim(value);
  if (!trimmed) return fallback;
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.join(DEFAULT_DATA_DIR, trimmed);
};

/**
 * Provide the default configuration object written to disk on first run.
 * @param {{ filePath: string }} params
 * @returns {Record<string, any>}
 */
const defaultConfigTemplate = ({ filePath }) => ({
  simplefin: {
    accessUrl: '',
    cacheFilePath: 'cache.json',
    cacheTtlMs: 5 * 60 * 1000,
  },
  notifications: {
    targets: [],
  },
  storage: {
    stateFilePath: 'state.json',
  },
  metadata: {
    filePath,
    onboarding: {
      ...DEFAULT_ONBOARDING_STATE,
    },
  },
});

/**
 * Merge persisted configuration with defaults, ensuring nested structures exist.
 * @param {Record<string, any>|undefined} persisted
 * @param {{ filePath: string }} context
 * @returns {Record<string, any>}
 */
const applyDefaults = (persisted = {}, { filePath }) => {
  const defaults = defaultConfigTemplate({ filePath });
  const merged = {
    ...defaults,
    ...persisted,
    simplefin: {
      ...defaults.simplefin,
      ...(persisted.simplefin ?? {}),
    },
    notifications: {
      ...defaults.notifications,
      ...(persisted.notifications ?? {}),
    },
    storage: {
      ...defaults.storage,
      ...(persisted.storage ?? {}),
    },
    metadata: {
      ...defaults.metadata,
      ...(persisted.metadata ?? {}),
      onboarding: {
        ...defaults.metadata.onboarding,
        ...((persisted.metadata ?? {}).onboarding ?? {}),
      },
    },
  };

  merged.notifications.targets = normalizeTargets(merged.notifications.targets);
  return merged;
};

/**
 * Produce a runtime configuration object ready for the application to consume.
 * @param {{ persisted?: Record<string, any> }} [options]
 * @returns {BalanceBotConfig}
 */
export const createConfig = ({ persisted = {} } = {}) => {
  const merged = applyDefaults(persisted, { filePath: DEFAULT_CONFIG_FILE });

  const persistedNotifier = merged.notifier ?? {};
  const persistedHealthchecks = merged.healthchecks ?? {};
  const persistedPolling = merged.polling ?? {};
  const persistedStorage = merged.storage ?? {};

  const cacheTtlOverride = readEnv('SIMPLEFIN_CACHE_TTL_MS');
  const cacheTtlMs = normalizeCacheTtl(
    cacheTtlOverride ?? merged.simplefin.cacheTtlMs,
  );

  const persistedApprise = trim(persistedNotifier.appriseApiUrl) || undefined;
  const appriseApiUrl =
    readEnv('APPRISE_API_URL') ??
    persistedApprise ??
    DEFAULT_APPRISE_URL;

  const persistedCron =
    trim(persistedPolling.cronExpression) || undefined;
  const cronExpression =
    readEnv('BALANCE_BOT_CRON') ??
    persistedCron ??
    DEFAULT_CRON;

  const persistedPing =
    trim(persistedHealthchecks.pingUrl) || undefined;
  const healthchecksPingUrl =
    readEnv('HEALTHCHECKS_PING_URL') ??
    persistedPing ??
    '';

  const persistedStateFile =
    trim(persistedStorage.stateFilePath) || undefined;

  const configuredStateFile =
    readEnv('BALANCE_BOT_STATE_FILE') ?? persistedStateFile;

  const metadata = {
    ...merged.metadata,
    onboarding: {
      ...DEFAULT_ONBOARDING_STATE,
      ...(merged.metadata?.onboarding ?? {}),
    },
  };

  const config = {
    simplefin: {
      accessUrl: trim(merged.simplefin.accessUrl),
      cacheFilePath: resolvePath(
        merged.simplefin.cacheFilePath,
        DEFAULT_CACHE_FILE,
      ),
      cacheTtlMs,
    },
    notifier: {
      appriseApiUrl,
    },
    healthchecks: {
      pingUrl: healthchecksPingUrl,
    },
    notifications: {
      targets: merged.notifications.targets,
    },
    polling: {
      cronExpression,
    },
    storage: {
      stateFilePath: resolvePath(
        configuredStateFile,
        DEFAULT_STATE_FILE,
      ),
    },
    metadata: {
      filePath: resolvePath(merged.metadata.filePath, DEFAULT_CONFIG_FILE),
      onboarding: metadata.onboarding,
    },
  };

  config.metadata.onboarding.simplefinConfigured = Boolean(
    config.simplefin.accessUrl,
  );
  config.metadata.onboarding.targetsConfigured =
    config.notifications.targets.length > 0;
  return config;
};

/**
 * Write JSON data atomically to disk to avoid partial config files.
 * @param {string} filePath
 * @param {any} data
 * @returns {Promise<void>}
 */
const atomicWriteJson = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.chmod(tempFile, 0o600);
  await fs.rename(tempFile, filePath);
};

/**
 * Persistent configuration manager backed by a JSON file.
 */
class ConfigStore {
  constructor({ filePath = path.join(DEFAULT_DATA_DIR, 'config.json') } = {}) {
    this.filePath = path.resolve(filePath);
    this._pending = Promise.resolve();
  }

  /**
   * Load configuration from disk, hydrating defaults when necessary.
   * @returns {Promise<Record<string, any>>}
   */
  async _read() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      return applyDefaults(parsed, { filePath: this.filePath });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return defaultConfigTemplate({ filePath: this.filePath });
      }
      throw error;
    }
  }

  /**
   * Persist the provided configuration payload to disk.
   * @param {Record<string, any>} data
   * @returns {Promise<void>}
   */
  async _write(data) {
    const payload = clone(data);
    payload.notifications.targets = normalizeTargets(
      payload.notifications.targets,
    );
    await atomicWriteJson(this.filePath, payload);
    logger.info({ filePath: this.filePath }, 'Persisted configuration');
  }

  /**
   * Read the current configuration from disk.
   * @returns {Promise<Record<string, any>>}
   */
  async get() {
    const config = await this._read();
    return clone(config);
  }

  /**
   * Apply a mutator function to the configuration in an atomic fashion.
   * @param {(current: Record<string, any>) => Promise<Record<string, any>>} updater
   * @returns {Promise<Record<string, any>>}
   */
  async update(updater) {
    const perform = async () => {
      const current = await this._read();
      const next = await updater(clone(current));
      await this._write(next);
      return clone(next);
    };

    this._pending = this._pending.then(perform, perform);
    return this._pending;
  }

  /**
   * Store the SimpleFIN access URL.
   * @param {string} accessUrl
   * @returns {Promise<Record<string, any>>}
   */
  async setSimplefinAccess(accessUrl) {
    const trimmed = trim(accessUrl);
    if (!trimmed) {
      throw new Error('Access URL must be provided');
    }

    return this.update(async (current) => ({
      ...current,
      simplefin: {
        ...current.simplefin,
        accessUrl: trimmed,
      },
      metadata: {
        ...current.metadata,
        onboarding: {
          ...DEFAULT_ONBOARDING_STATE,
          ...(current.metadata?.onboarding ?? {}),
          simplefinConfigured: true,
        },
      },
    }));
  }

  /**
   * Replace the configured notification targets.
   * @param {Array<Record<string, any>>} targets
   * @returns {Promise<Record<string, any>>}
   */
  async setNotificationTargets(targets) {
    return this.update(async (current) => {
      const sanitizedTargets = normalizeTargets(targets);
      return {
        ...current,
        notifications: {
          ...current.notifications,
          targets: sanitizedTargets,
        },
        metadata: {
          ...current.metadata,
          onboarding: {
            ...DEFAULT_ONBOARDING_STATE,
            ...(current.metadata?.onboarding ?? {}),
            targetsConfigured: sanitizedTargets.length > 0,
          },
        },
      };
    });
  }

}

export { normalizeTargets, DEFAULT_DATA_DIR, ConfigStore };

/** @typedef {ReturnType<typeof createConfig>} BalanceBotConfig */

export default createConfig;
