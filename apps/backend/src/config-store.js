import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import logger from "./logger.js";
import { trim } from "./utils.js";
import { sanitizeTargets, DEFAULT_DATA_DIR } from "./config.js";

const DEFAULT_CONFIG = ({ filePath }) => ({
  simplefin: {
    accessUrl: "",
    cacheFilePath: "cache.json",
    cacheTtlMs: 60 * 60 * 1000,
  },
  notifier: {
    appriseApiUrl: "http://apprise:8000/notify",
  },
  notifications: {
    targets: [],
  },
  polling: {
    cronExpression: "0 * * * *",
  },
  storage: {
    stateFilePath: "state.json",
  },
  metadata: {
    filePath,
  },
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const atomicWriteJson = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.chmod(tempFile, 0o600);
  await fs.rename(tempFile, filePath);
};

class ConfigStore {
  constructor({ filePath = path.join(DEFAULT_DATA_DIR, "config.json") } = {}) {
    this.filePath = path.resolve(filePath);
    this._pending = Promise.resolve();
  }

  async _read() {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content);
      return {
        ...DEFAULT_CONFIG({ filePath: this.filePath }),
        ...parsed,
        simplefin: {
          ...DEFAULT_CONFIG({ filePath: this.filePath }).simplefin,
          ...parsed?.simplefin,
        },
        notifier: {
          ...DEFAULT_CONFIG({ filePath: this.filePath }).notifier,
          ...parsed?.notifier,
        },
        notifications: {
          ...DEFAULT_CONFIG({ filePath: this.filePath }).notifications,
          ...parsed?.notifications,
        },
        polling: {
          ...DEFAULT_CONFIG({ filePath: this.filePath }).polling,
          ...parsed?.polling,
        },
        storage: {
          ...DEFAULT_CONFIG({ filePath: this.filePath }).storage,
          ...parsed?.storage,
        },
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return DEFAULT_CONFIG({ filePath: this.filePath });
      }
      throw error;
    }
  }

  async _write(data) {
    const payload = clone(data);
    await atomicWriteJson(this.filePath, payload);
    logger.info("Persisted configuration", { filePath: this.filePath });
  }

  async get() {
    const config = await this._read();
    return clone(config);
  }

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

  async setSimplefinAccess(accessUrl) {
    const trimmed = trim(accessUrl);
    if (!trimmed) {
      throw new Error("Access URL must be provided");
    }

    return this.update(async (current) => {
      return {
        ...current,
        simplefin: {
          ...current.simplefin,
          accessUrl: trimmed,
        },
      };
    });
  }

  async setAppriseApiUrl(appriseApiUrl) {
    return this.update(async (current) => ({
      ...current,
      notifier: {
        ...current.notifier,
        appriseApiUrl: trim(appriseApiUrl) || current.notifier.appriseApiUrl,
      },
    }));
  }

  async setCronExpression(cronExpression) {
    return this.update(async (current) => ({
      ...current,
      polling: {
        ...current.polling,
        cronExpression: trim(cronExpression) || current.polling.cronExpression,
      },
    }));
  }

  async setNotificationTargets(targets) {
    return this.update(async (current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        targets: sanitizeTargets(Array.isArray(targets) ? targets : []),
      },
    }));
  }

  async setConfig({ appriseApiUrl, cronExpression, targets }) {
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
    }));
  }
}

export default ConfigStore;
