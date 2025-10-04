import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import got from "got";
import logger from "./logger.js";
import { trim, uniqueEntries, redactAccessUrl } from "./utils.js";

const DEFAULT_ACCESS_URL_FILENAME = "simplefin-access-url";

/**
 * Decode a SimpleFIN setup token and extract its claim URL.
 * @param {string|undefined} value
 * @returns {{ token: string, claimUrl: string }}
 */
const decodeSetupToken = (value) => {
  const trimmed = trim(value);
  if (!trimmed) return { token: "", claimUrl: "" };

  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  let decoded;
  try {
    decoded = Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
  } catch (error) {
    throw new Error(
      `Invalid SimpleFIN setup token: ${error.message ?? "unable to decode base64"}`,
    );
  }

  let claimUrl;
  try {
    claimUrl = new URL(decoded);
  } catch (error) {
    throw new Error(
      `SimpleFIN setup token decoded to an invalid URL: ${error.message}`,
    );
  }

  if (claimUrl.protocol !== "https:") {
    throw new Error("SimpleFIN claim URL must use HTTPS");
  }

  return { token: trimmed, claimUrl: claimUrl.toString() };
};

const resolveAccessFilePath = (env, explicitPath) => {
  if (explicitPath) return path.resolve(explicitPath);
  if (env?.SIMPLEFIN_ACCESS_URL_FILE) {
    return path.resolve(env.SIMPLEFIN_ACCESS_URL_FILE);
  }
  return path.resolve("data", DEFAULT_ACCESS_URL_FILENAME);
};

/**
 * Read a stored SimpleFIN access URL from disk.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const readAccessUrlFromFile = async (filePath) => {
  try {
    const content = await fsPromises.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = trim(line);
      if (trimmedLine) {
        return trimmedLine;
      }
    }
    return "";
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw new Error(
      `Failed to read SimpleFIN access URL file at ${filePath}: ${error.message}`,
    );
  }
};

const ensureRestrictedPermissions = async (filePath) => {
  try {
    const stats = await fsPromises.stat(filePath);
    const mode = stats.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      logger.warn("SimpleFIN access URL file has permissive permissions", {
        filePath,
        mode: mode.toString(8),
      });
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      logger.warn("Unable to check permissions for SimpleFIN access URL file", {
        filePath,
        error: error.message,
      });
    }
  }
};

/**
 * Atomically write the SimpleFIN access URL to disk.
 * @param {string} filePath
 * @param {string} accessUrl
 */
const writeAccessUrlFile = async (filePath, accessUrl) => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  const data = `${trim(accessUrl)}\n`;
  await fsPromises.writeFile(tempFile, data, { mode: 0o600 });
  await fsPromises.chmod(tempFile, 0o600);
  await fsPromises.rename(tempFile, filePath);
  await ensureRestrictedPermissions(filePath);
};

/**
 * Exchange a setup token claim URL for an access URL.
 * @param {{ claimUrl: string }} params
 * @returns {Promise<{ accessUrl: string, expiresAt: null }>}
 */
const exchangeSetupToken = async ({ claimUrl }) => {
  try {
    const { body } = await got.post(claimUrl, { retry: { limit: 0 } });
    const accessUrl = trim(body);
    if (!accessUrl) {
      throw new Error(
        "SimpleFIN token claim response did not include an access URL",
      );
    }
    return { accessUrl, expiresAt: null };
  } catch (error) {
    if (error.response) {
      const { statusCode, body } = error.response;
      const errorBody = typeof body === "string" ? body : body?.toString?.() ?? "";
      throw new Error(
        `SimpleFIN token claim failed with status ${statusCode}: ${errorBody}`,
      );
    }
    throw error;
  }
};

/**
 * Resolve a usable SimpleFIN access URL from env, disk, or setup token.
 * @param {{ env?: NodeJS.ProcessEnv, accessUrlFilePath?: string }} [options]
 * @returns {Promise<{ accessUrl: string, source: "env"|"file"|"token"|null, filePath: string, expiresAt: string|null }>}
 */
const ensureSimplefinAccess = async ({
  env = process.env,
  accessUrlFilePath,
} = {}) => {
  const accessUrlFromEnv = trim(env?.SIMPLEFIN_ACCESS_URL);
  if (accessUrlFromEnv) {
    return {
      accessUrl: accessUrlFromEnv,
      source: "env",
      filePath: resolveAccessFilePath(env, accessUrlFilePath),
      expiresAt: null,
    };
  }

  const targetFilePath = resolveAccessFilePath(env, accessUrlFilePath);
  const accessUrlFromFile = await readAccessUrlFromFile(targetFilePath);
  if (accessUrlFromFile) {
    await ensureRestrictedPermissions(targetFilePath);
    return {
      accessUrl: accessUrlFromFile,
      source: "file",
      filePath: targetFilePath,
      expiresAt: null,
    };
  }

  const setupTokenRaw = trim(env?.SIMPLEFIN_SETUP_TOKEN);
  if (!setupTokenRaw) {
    return {
      accessUrl: "",
      source: null,
      filePath: targetFilePath,
      expiresAt: null,
    };
  }

  logger.info("Exchanging SimpleFIN setup token for access URL");

  const endpointOverride = trim(env?.SIMPLEFIN_SETUP_URL) || "";
  const { claimUrl } = decodeSetupToken(setupTokenRaw);
  const targetClaimUrlString = endpointOverride || claimUrl;

  let targetClaimUrl;
  try {
    const parsed = new URL(targetClaimUrlString);
    if (parsed.protocol !== "https:") {
      throw new Error("SimpleFIN claim URL must use HTTPS");
    }
    targetClaimUrl = parsed.toString();
  } catch (error) {
    throw new Error(
      `Invalid SimpleFIN claim URL: ${error.message ?? "unable to parse"}`,
    );
  }

  const { accessUrl, expiresAt } = await exchangeSetupToken({
    claimUrl: targetClaimUrl,
  });

  await writeAccessUrlFile(targetFilePath, accessUrl);
  if (env === process.env) {
    process.env.SIMPLEFIN_ACCESS_URL = accessUrl;
    process.env.SIMPLEFIN_SETUP_TOKEN = "";
  }

  logger.info("Stored SimpleFIN access URL", {
    filePath: targetFilePath,
    preview: redactAccessUrl(accessUrl),
    expiresAt: expiresAt ?? undefined,
  });

  return {
    accessUrl,
    source: "token",
    filePath: targetFilePath,
    expiresAt: expiresAt ?? null,
  };
};

const createCacheKey = (accountIds) => {
  if (!Array.isArray(accountIds) || accountIds.length === 0) return "accounts:all";
  const cleanedIds = accountIds.map((id) => `${id}`.trim()).filter(Boolean);
  const uniqueSortedIds = uniqueEntries(cleanedIds).sort();
  return uniqueSortedIds.length ? `accounts:${uniqueSortedIds.join(",")}` : "accounts:all";
};

/**
 * @typedef {{ entries: Record<string, { value: unknown, timestamp: number }> }} CacheState
 */

const createCacheStore = (filePath) => {
  if (!filePath) return null;

  const adapter = new JSONFile(filePath);
  const db = new Low(adapter, { entries: {} });
  let initialized = false;

  const ensureDb = async () => {
    if (!initialized) {
      await db.read();
      db.data ||= { entries: {} };
      initialized = true;
    }
  };

  const get = async (key, maxAgeMs) => {
    await ensureDb();
    const record = db.data.entries[key];
    if (!record) return null;
    if (typeof maxAgeMs === "number" && maxAgeMs > 0) {
      const age = Date.now() - record.timestamp;
      if (age > maxAgeMs) return null;
    }
    return record.value ?? null;
  };

  const set = async (key, value) => {
    await ensureDb();
    db.data.entries[key] = { value, timestamp: Date.now() };
    await db.write();
  };

  return { get, set };
};

/**
 * Create a low-level SimpleFIN API wrapper that fetches accounts.
 * @param {{ accessUrl: string, cacheFilePath?: string, cacheTtlMs?: number }} params
 * @returns {{ fetchAccounts: (options?: { accountIds?: string[] }) => Promise<any[]> }}
 */
const createSimplefinApi = ({ accessUrl, cacheFilePath, cacheTtlMs = 0 }) => {
  if (!accessUrl) {
    throw new Error("SimpleFIN access URL is required");
  }

  let access;
  try {
    access = new URL(accessUrl);
  } catch (error) {
    throw new Error(`Invalid SimpleFIN access URL: ${error.message}`);
  }

  const username = access.username ? decodeURIComponent(access.username) : "";
  const password = access.password ? decodeURIComponent(access.password) : "";
  const hasCredentials = username || password;
  const authHeader = hasCredentials
    ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    : null;
  if (hasCredentials) {
    access.username = "";
    access.password = "";
  }

  if (!access.pathname.endsWith("/accounts")) {
    const trimmedPath = access.pathname.replace(/\/$/, "");
    access.pathname = `${trimmedPath}/accounts`;
  }

  const baseUrl = access.toString();
  const cache = cacheTtlMs > 0 ? createCacheStore(cacheFilePath) : null;

  const readFromCache = async (key) => {
    if (!cache) return null;
    return cache.get(key, cacheTtlMs);
  };

  const writeToCache = async (key, value) => {
    if (!cache) return;
    await cache.set(key, value);
  };

  const fetchAccounts = async ({ accountIds } = {}) => {
    const requestUrl = new URL(baseUrl);
    requestUrl.searchParams.set("balances-only", "1");

    if (Array.isArray(accountIds) && accountIds.length) {
      const uniqueIds = uniqueEntries(
        accountIds.map((id) => `${id}`.trim()).filter(Boolean),
      );
      for (const id of uniqueIds) {
        requestUrl.searchParams.append("account", id);
      }
    }

    const cacheKey = createCacheKey(accountIds);
    const cachedAccounts = await readFromCache(cacheKey);
    if (cachedAccounts) {
      return cachedAccounts;
    }

    let payload;
    try {
      payload = await got(requestUrl.toString(), {
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        retry: { limit: 0 },
      }).json();
    } catch (error) {
      if (error.response) {
        const { statusCode, body } = error.response;
        const errorBody = typeof body === "string" ? body : body?.toString?.() ?? "";
        throw new Error(
          `SimpleFIN request failed with status ${statusCode}: ${errorBody}`,
        );
      }
      throw error;
    }

    if (!payload || !Array.isArray(payload.accounts)) {
      throw new Error("Unexpected SimpleFIN response: missing accounts array");
    }

    await writeToCache(cacheKey, payload.accounts);

    return payload.accounts;
  };

  return { fetchAccounts };
};

/**
 * Create a high-level SimpleFIN client that manages access tokens and API usage.
 * @param {{ env?: NodeJS.ProcessEnv, accessUrlFilePath?: string, cacheFilePath?: string, cacheTtlMs?: number }} [options]
 * @returns {{ ensureAccess: () => Promise<any>, fetchAccounts: (options?: { accountIds?: string[] }) => Promise<any[]>, getAccessInfo: () => any, setAccessUrl: (accessUrl: string) => void }}
 */
const createSimplefinClient = ({
  env = process.env,
  accessUrlFilePath,
  cacheFilePath,
  cacheTtlMs = 0,
} = {}) => {
  let accessInfo = null;
  let apiInstance = null;

  const ensureAccess = async () => {
    accessInfo = await ensureSimplefinAccess({
      env,
      accessUrlFilePath,
    });

    if (!accessInfo.accessUrl) {
      throw new Error(
        "SimpleFIN access URL is required. Provide SIMPLEFIN_ACCESS_URL, SIMPLEFIN_ACCESS_URL_FILE, or SIMPLEFIN_SETUP_TOKEN.",
      );
    }

    return accessInfo;
  };

  const getApi = async () => {
    if (!accessInfo || !accessInfo.accessUrl) {
      await ensureAccess();
    }

    if (!apiInstance || apiInstance.accessUrl !== accessInfo.accessUrl) {
      apiInstance = {
        accessUrl: accessInfo.accessUrl,
        client: createSimplefinApi({
          accessUrl: accessInfo.accessUrl,
          cacheFilePath,
          cacheTtlMs,
        }),
      };
    }

    return apiInstance.client;
  };

  const fetchAccounts = async (params = {}) => {
    const api = await getApi();
    return api.fetchAccounts(params);
  };

  const getAccessInfo = () => (accessInfo ? { ...accessInfo } : null);

  const setAccessUrl = (accessUrl) => {
    const trimmedAccessUrl = trim(accessUrl);
    if (!trimmedAccessUrl) {
      throw new Error("Access URL must be a non-empty string");
    }
    accessInfo = {
      accessUrl: trimmedAccessUrl,
      source: "manual",
      filePath: resolveAccessFilePath(env, accessUrlFilePath),
      expiresAt: null,
    };
    apiInstance = null;
  };

  return {
    ensureAccess,
    fetchAccounts,
    getAccessInfo,
    setAccessUrl,
  };
};

export {
  decodeSetupToken,
  readAccessUrlFromFile,
  writeAccessUrlFile,
  ensureSimplefinAccess,
  exchangeSetupToken,
  createSimplefinApi,
};

export default createSimplefinClient;
