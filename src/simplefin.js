import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
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

const createCacheStore = (filePath) => {
  if (!filePath) return null;

  let db;

  const ensureDb = async () => {
    if (!db) {
      await mkdir(path.dirname(filePath), { recursive: true });
      const adapter = new JSONFile(filePath);
      db = new Low(adapter, { entries: {} });
      await db.read();
      if (!db.data || typeof db.data !== "object") {
        db.data = { entries: {} };
      }
      if (!db.data.entries || typeof db.data.entries !== "object") {
        db.data.entries = {};
      }
    }
    return db;
  };

  const get = async (key, maxAgeMs) => {
    const database = await ensureDb();
    const record = database.data.entries[key];
    if (!record) return null;
    if (typeof maxAgeMs === "number" && maxAgeMs > 0) {
      const age = Date.now() - record.timestamp;
      if (age > maxAgeMs) return null;
    }
    return record.value ?? null;
  };

  const set = async (key, value) => {
    const database = await ensureDb();
    database.data.entries[key] = {
      value,
      timestamp: Date.now(),
    };
    await database.write();
  };

  return { get, set };
};

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
