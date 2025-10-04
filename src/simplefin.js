import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import logger from "./logger.js";
import createJsonFileStore from "./jsonFileStore.js";
import { trim, requestJson, uniqueEntries, redactAccessUrl } from "./utils.js";

const DEFAULT_ACCESS_URL_FILENAME = "simplefin-access-url";

const decodeSetupToken = (value) => {
  const trimmed = trim(value);
  if (!trimmed) {
    return { token: "", claimUrl: "" };
  }

  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

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

  return {
    token: trimmed,
    claimUrl: claimUrl.toString(),
  };
};

const resolveAccessFilePath = (env, explicitPath) => {
  if (explicitPath) {
    return path.resolve(explicitPath);
  }
  if (env?.SIMPLEFIN_ACCESS_URL_FILE) {
    return path.resolve(env.SIMPLEFIN_ACCESS_URL_FILE);
  }
  return path.resolve("data", DEFAULT_ACCESS_URL_FILENAME);
};

const readAccessUrlFromFile = async (filePath) => {
  try {
    const content = await fsPromises.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = trim(line);
      if (trimmed) {
        return trimmed;
      }
    }
    return "";
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
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

const writeAccessUrlFile = async (filePath, accessUrl) => {
  const directory = path.dirname(filePath);
  await fsPromises.mkdir(directory, { recursive: true });
  const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  const data = `${trim(accessUrl)}\n`;
  await fsPromises.writeFile(tempFile, data, { mode: 0o600 });
  await fsPromises.chmod(tempFile, 0o600);
  await fsPromises.rename(tempFile, filePath);
  await ensureRestrictedPermissions(filePath);
};

const exchangeSetupToken = async ({ claimUrl, fetchHeaders }) => {
  const requestOptions = { method: "POST" };
  if (fetchHeaders && Object.keys(fetchHeaders).length) {
    requestOptions.headers = fetchHeaders;
  }

  const response = await fetch(claimUrl, requestOptions);

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `SimpleFIN token claim failed with status ${response.status}: ${responseBody}`,
    );
  }

  const accessUrl = trim(responseBody);
  if (!accessUrl) {
    throw new Error(
      "SimpleFIN token claim response did not include an access URL",
    );
  }

  return { accessUrl, expiresAt: null };
};

const ensureSimplefinAccess = async ({ env = process.env, accessUrlFilePath } = {}) => {
  const accessUrlFromEnv = trim(env?.SIMPLEFIN_ACCESS_URL);
  if (accessUrlFromEnv) {
    return {
      accessUrl: accessUrlFromEnv,
      source: "env",
      filePath: resolveAccessFilePath(env, accessUrlFilePath),
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
    };
  }

  const setupTokenRaw = trim(env?.SIMPLEFIN_SETUP_TOKEN);
  if (!setupTokenRaw) {
    return {
      accessUrl: "",
      source: null,
      filePath: targetFilePath,
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
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return "accounts:all";
  }
  const cleanedIds = accountIds.map((id) => `${id}`.trim()).filter(Boolean);
  const uniqueSortedIds = uniqueEntries(cleanedIds).sort();
  if (!uniqueSortedIds.length) {
    return "accounts:all";
  }
  return `accounts:${uniqueSortedIds.join(",")}`;
};

/**
 * @typedef {{ entries: Record<string, { value: any, timestamp: number }> }} CacheState
 */

const createCacheStore = (filePath) => {
  if (!filePath) return null;

  const cacheStore = createJsonFileStore({
    filePath,
    defaultData: /** @returns {CacheState} */ () => ({ entries: {} }),
    autoFlush: true,
  });

  const get = async (key, maxAgeMs) => {
    const current = await cacheStore.load();
    const record = current.entries[key];
    if (!record) return null;
    if (typeof maxAgeMs === "number" && maxAgeMs > 0) {
      const age = Date.now() - record.timestamp;
      if (age > maxAgeMs) return null;
    }
    return record.value ?? null;
  };

  const set = async (key, value) => {
    await cacheStore.update((current) => {
      current.entries[key] = {
        value,
        timestamp: Date.now(),
      };
    });
  };

  return { get, set };
};

/**
 * @param {object} options
 * @param {string} options.accessUrl
 * @param {string} [options.cacheFilePath]
 * @param {number} [options.cacheTtlMs=0]
 */
const createSimplefin = ({ accessUrl, cacheFilePath, cacheTtlMs = 0 }) => {
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

  /**
   * @param {{ accountIds?: string[] }} [params]
   */
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

    const response = await requestJson({
      url: requestUrl.toString(),
      headers: authHeader
        ? {
            Authorization: authHeader,
          }
        : undefined,
      errorContext: "SimpleFIN request",
    });
    if (!response || !Array.isArray(response.accounts)) {
      throw new Error("Unexpected SimpleFIN response: missing accounts array");
    }

    await writeToCache(cacheKey, response.accounts);

    return response.accounts;
  };

  return { fetchAccounts };
};

export {
  ensureSimplefinAccess,
  exchangeSetupToken,
  writeAccessUrlFile,
  readAccessUrlFromFile,
};

export default createSimplefin;
