import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import logger from './logger.js';
import { trim, normalizeCacheTtl } from './utils.js';

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
 * Normalize notification targets by trimming identifiers and removing duplicates.
 * @param {Array<Record<string, any>>|undefined} targets
 * @returns {Array<Record<string, any>>}
 */
const sanitizeTargets = (targets) => {
  if (!Array.isArray(targets)) return [];
  const uniqueTrimmed = (items) => {
    if (!Array.isArray(items)) return [];
    const trimmedItems = items.map((value) => trim(value)).filter(Boolean);
    return Array.from(new Set(trimmedItems));
  };

  return targets.map((target) => {
    const accountIds = uniqueTrimmed(target.accountIds);
    const appriseUrls = uniqueTrimmed(target.appriseUrls);
    const appriseConfigKey = target.appriseConfigKey
      ? trim(target.appriseConfigKey)
      : '';
    const name =
      typeof target.name === 'string' ? target.name.trim() : target.name;

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

/**
 * Resolve the base data directory, honoring BALANCE_BOT_DATA_DIR when provided.
 * @returns {string}
 */
const resolveDataDir = () => {
  const configured = trim(process.env.BALANCE_BOT_DATA_DIR);
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
  appriseConfigured: false,
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
    cacheTtlMs: 60 * 60 * 1000,
  },
  notifier: {
    appriseApiUrl: DEFAULT_APPRISE_URL,
  },
  notifications: {
    targets: [],
  },
  polling: {
    cronExpression: DEFAULT_CRON,
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
    notifier: {
      ...defaults.notifier,
      ...(persisted.notifier ?? {}),
    },
    notifications: {
      ...defaults.notifications,
      ...(persisted.notifications ?? {}),
    },
    polling: {
      ...defaults.polling,
      ...(persisted.polling ?? {}),
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

  merged.notifications.targets = sanitizeTargets(merged.notifications.targets);
  return merged;
};

/**
 * Produce a runtime configuration object ready for the application to consume.
 * @param {{ persisted?: Record<string, any> }} [options]
 * @returns {BalanceBotConfig}
 */
export const createConfig = ({ persisted = {} } = {}) => {
  const merged = applyDefaults(persisted, { filePath: DEFAULT_CONFIG_FILE });

  const cacheTtlMs = normalizeCacheTtl(merged.simplefin.cacheTtlMs);

  return {
    simplefin: {
      accessUrl: trim(merged.simplefin.accessUrl),
      cacheFilePath: resolvePath(
        merged.simplefin.cacheFilePath,
        DEFAULT_CACHE_FILE,
      ),
      cacheTtlMs,
    },
    notifier: {
      appriseApiUrl: trim(merged.notifier.appriseApiUrl) || DEFAULT_APPRISE_URL,
    },
    notifications: {
      targets: merged.notifications.targets,
    },
    polling: {
      cronExpression: trim(merged.polling.cronExpression) || DEFAULT_CRON,
    },
    storage: {
      stateFilePath: resolvePath(
        merged.storage.stateFilePath,
        DEFAULT_STATE_FILE,
      ),
    },
    metadata: {
      filePath: resolvePath(merged.metadata.filePath, DEFAULT_CONFIG_FILE),
      onboarding: {
        ...DEFAULT_ONBOARDING_STATE,
        ...(merged.metadata.onboarding ?? {}),
      },
    },
  };
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
    payload.notifications.targets = sanitizeTargets(
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
    }));
  }

  /**
   * Update the Apprise API endpoint.
   * @param {string} appriseApiUrl
   * @returns {Promise<Record<string, any>>}
   */
  async setAppriseApiUrl(appriseApiUrl) {
    return this.update(async (current) => ({
      ...current,
      notifier: {
        ...current.notifier,
        appriseApiUrl: trim(appriseApiUrl) || current.notifier.appriseApiUrl,
      },
    }));
  }

  /**
   * Update the cron expression controlling balance checks.
   * @param {string} cronExpression
   * @returns {Promise<Record<string, any>>}
   */
  async setCronExpression(cronExpression) {
    return this.update(async (current) => ({
      ...current,
      polling: {
        ...current.polling,
        cronExpression: trim(cronExpression) || current.polling.cronExpression,
      },
    }));
  }

  /**
   * Replace the configured notification targets.
   * @param {Array<Record<string, any>>} targets
   * @returns {Promise<Record<string, any>>}
   */
  async setNotificationTargets(targets) {
    return this.update(async (current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        targets: sanitizeTargets(Array.isArray(targets) ? targets : []),
      },
    }));
  }

  /**
   * Batch-update core configuration knobs used by the onboarding UI.
   * @param {{ appriseApiUrl?: string, cronExpression?: string, targets?: Array<Record<string, any>> }} params
   * @returns {Promise<Record<string, any>>}
   */
  async setConfig({ appriseApiUrl, cronExpression, targets }) {
    const onboardingDefaults = { ...DEFAULT_ONBOARDING_STATE };
    return this.update(async (current) => ({
      ...current,
      notifier: {
        ...current.notifier,
        appriseApiUrl: trim(appriseApiUrl) || current.notifier.appriseApiUrl,
      },
      polling: {
        ...current.polling,
        cronExpression: trim(cronExpression) || current.polling.cronExpression,
      },
      notifications: {
        ...current.notifications,
        targets: sanitizeTargets(Array.isArray(targets) ? targets : []),
      },
      metadata: {
        ...current.metadata,
        onboarding: {
          ...onboardingDefaults,
          ...(current.metadata?.onboarding ?? {}),
          appriseConfigured:
            appriseApiUrl !== undefined
              ? Boolean(trim(appriseApiUrl) || current.notifier.appriseApiUrl)
              : Boolean(current.metadata?.onboarding?.appriseConfigured),
        },
      },
    }));
  }
}

export { sanitizeTargets, DEFAULT_DATA_DIR, ConfigStore };

/** @typedef {ReturnType<typeof createConfig>} BalanceBotConfig */

export default createConfig;
