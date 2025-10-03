import createJsonFileStore from "./jsonFileStore.js";
import { requestJson, uniqueEntries } from "./utils.js";

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

export default createSimplefin;
