/**
 * Trim a string value while safely handling nullish input.
 * @param {unknown} value
 * @returns {string}
 */
const trim = (value) => value?.toString?.().trim?.() ?? '';

/**
 * Normalize a cache TTL value in milliseconds, falling back to one hour.
 * @param {unknown} value
 * @returns {number}
 */
const normalizeCacheTtl = (value) => {
  const defaultTtl = 60 * 60 * 1000;
  if (value === undefined) {
    return defaultTtl;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultTtl;
  }
  return Math.max(0, parsed);
};

/**
 * Parse a numeric string or number into a finite number.
 * @param {unknown} value
 * @returns {number|null}
 */
const parseNumeric = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Resolve an account record into a normalized balance payload.
 * @param {Record<string, any>|undefined|null} account
 * @returns {{ amount: number, currency: string }|null}
 */
const resolveBalanceInfo = (account) => {
  if (!account) return null;

  const availableAmount = parseNumeric(account['available-balance']);
  const balanceAmount = parseNumeric(account.balance);
  const amount = availableAmount ?? balanceAmount;

  if (amount === null) {
    return null;
  }

  const currency = account.currency || 'USD';
  return { amount, currency };
};

/**
 * Format a numeric amount into a localized currency string.
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
const formatCurrency = (amount, currency) => {
  if (!Number.isFinite(amount)) {
    return `${amount ?? '0'} ${currency}`;
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

/**
 * Return a deduplicated list while preserving the original order.
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
const uniqueEntries = (items) => Array.from(new Set(items));

/**
 * Remove trailing forward slashes from a URL-like string.
 * @param {string} [value=""]
 * @returns {string}
 */
const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

/**
 * Redact credentials from a URL while keeping it human-readable.
 * @param {string} value
 * @returns {string}
 */
const redactAccessUrl = (value) => {
  const trimmed = trim(value);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.username) {
      parsed.username = '****';
    }
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return '(redacted)';
  }
};

export {
  trim,
  normalizeCacheTtl,
  parseNumeric,
  resolveBalanceInfo,
  formatCurrency,
  uniqueEntries,
  trimTrailingSlash,
  redactAccessUrl,
};
