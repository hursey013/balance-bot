import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import got from 'got';
import { trim, uniqueEntries } from './utils.js';

/**
 * Decode a SimpleFIN setup token and extract its claim URL.
 * @param {string|undefined} value
 * @returns {{ token: string, claimUrl: string }}
 */
const decodeSetupToken = (value) => {
  const trimmed = trim(value);
  if (!trimmed) return { token: '', claimUrl: '' };

  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  let decoded;
  try {
    decoded = Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  } catch (error) {
    throw new Error(
      `Invalid SimpleFIN setup token: ${error.message ?? 'unable to decode base64'}`,
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

  if (claimUrl.protocol !== 'https:') {
    throw new Error('SimpleFIN claim URL must use HTTPS');
  }

  return { token: trimmed, claimUrl: claimUrl.toString() };
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
        'SimpleFIN token claim response did not include an access URL',
      );
    }
    return { accessUrl, expiresAt: null };
  } catch (error) {
    if (error.response) {
      const { statusCode, body } = error.response;
      const errorBody =
        typeof body === 'string' ? body : (body?.toString?.() ?? '');
      throw new Error(
        `SimpleFIN token claim failed with status ${statusCode}: ${errorBody}`,
      );
    }
    throw error;
  }
};

/**
 * Build a deterministic cache key for a SimpleFIN account request.
 * @param {string[]|undefined} accountIds
 * @returns {string}
 */
const createCacheKey = (accountIds) => {
  if (!Array.isArray(accountIds) || accountIds.length === 0)
    return 'accounts:all';
  const cleanedIds = accountIds.map((id) => `${id}`.trim()).filter(Boolean);
  const uniqueSortedIds = uniqueEntries(cleanedIds).sort();
  return uniqueSortedIds.length
    ? `accounts:${uniqueSortedIds.join(',')}`
    : 'accounts:all';
};

/**
 * @typedef {{ entries: Record<string, { value: unknown, timestamp: number }> }} CacheState
 */

/**
 * Create a persistence layer for SimpleFIN responses.
 * @param {string|undefined} filePath
 * @returns {{ get: (key: string, maxAgeMs?: number) => Promise<any>, set: (key: string, value: any) => Promise<void> }|null}
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
    if (typeof maxAgeMs === 'number' && maxAgeMs > 0) {
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
    throw new Error('SimpleFIN access URL is required');
  }

  let access;
  try {
    access = new URL(accessUrl);
  } catch (error) {
    throw new Error(`Invalid SimpleFIN access URL: ${error.message}`);
  }

  const username = access.username ? decodeURIComponent(access.username) : '';
  const password = access.password ? decodeURIComponent(access.password) : '';
  const hasCredentials = username || password;
  const authHeader = hasCredentials
    ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    : null;
  if (hasCredentials) {
    access.username = '';
    access.password = '';
  }

  if (!access.pathname.endsWith('/accounts')) {
    const trimmedPath = access.pathname.replace(/\/$/, '');
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
    requestUrl.searchParams.set('balances-only', '1');

    if (Array.isArray(accountIds) && accountIds.length) {
      const uniqueIds = uniqueEntries(
        accountIds.map((id) => `${id}`.trim()).filter(Boolean),
      );
      for (const id of uniqueIds) {
        requestUrl.searchParams.append('account', id);
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
        const errorBody =
          typeof body === 'string' ? body : (body?.toString?.() ?? '');
        throw new Error(
          `SimpleFIN request failed with status ${statusCode}: ${errorBody}`,
        );
      }
      throw error;
    }

    if (!payload || !Array.isArray(payload.accounts)) {
      throw new Error('Unexpected SimpleFIN response: missing accounts array');
    }

    await writeToCache(cacheKey, payload.accounts);

    return payload.accounts;
  };

  return { fetchAccounts };
};

/**
 * Create a high-level SimpleFIN client that manages access tokens and API usage.
 * @param {{ accessUrl?: string, cacheFilePath?: string, cacheTtlMs?: number }} [options]
 * @returns {{ fetchAccounts: (options?: { accountIds?: string[] }) => Promise<any[]>, getAccessInfo: () => any, setAccessUrl: (accessUrl: string) => void }}
 */
const createSimplefinClient = ({
  accessUrl,
  cacheFilePath,
  cacheTtlMs = 0,
} = {}) => {
  let currentAccessUrl = trim(accessUrl);
  let apiInstance = null;

  const getApi = () => {
    if (!currentAccessUrl) {
      throw new Error('SimpleFIN access URL is required');
    }

    if (!apiInstance || apiInstance.accessUrl !== currentAccessUrl) {
      apiInstance = {
        accessUrl: currentAccessUrl,
        client: createSimplefinApi({
          accessUrl: currentAccessUrl,
          cacheFilePath,
          cacheTtlMs,
        }),
      };
    }

    return apiInstance.client;
  };

  const fetchAccounts = async (params = {}) => {
    const api = getApi();
    return api.fetchAccounts(params);
  };

  /**
   * Provide metadata about the current access URL source.
   * @returns {{ accessUrl: string, source: string, expiresAt: null }|null}
   */
  const getAccessInfo = () =>
    currentAccessUrl
      ? {
          accessUrl: currentAccessUrl,
          source: 'manual',
          expiresAt: null,
        }
      : null;

  /**
   * Replace the SimpleFIN access URL and reset the underlying API client.
   * @param {string} nextAccessUrl
   * @returns {void}
   */
  const setAccessUrl = (nextAccessUrl) => {
    const trimmed = trim(nextAccessUrl);
    if (!trimmed) {
      throw new Error('Access URL must be a non-empty string');
    }
    currentAccessUrl = trimmed;
    apiInstance = null;
  };

  return {
    fetchAccounts,
    getAccessInfo,
    setAccessUrl,
  };
};

export { decodeSetupToken, exchangeSetupToken, createSimplefinApi };

export default createSimplefinClient;
