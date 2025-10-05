const trim = (value) => value?.trim() ?? "";

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

const parseNumeric = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveBalanceInfo = (account) => {
  if (!account) return null;

  const availableAmount = parseNumeric(account["available-balance"]);
  const balanceAmount = parseNumeric(account.balance);
  const amount = availableAmount ?? balanceAmount;

  if (amount === null) {
    return null;
  }

  const currency = account.currency || "USD";
  return { amount, currency };
};

const formatCurrency = (amount, currency) => {
  if (!Number.isFinite(amount)) {
    return `${amount ?? "0"} ${currency}`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const uniqueEntries = (items) => Array.from(new Set(items));

const trimTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const redactAccessUrl = (value) => {
  const trimmed = trim(value);
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.username) {
      parsed.username = "****";
    }
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return "(redacted)";
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
