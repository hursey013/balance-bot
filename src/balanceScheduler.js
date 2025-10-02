import cron from 'node-cron';
import logger from './logger.js';

const formatCurrency = (amount, currency = 'USD') => {
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numeric)) {
    return `${amount ?? '0'} ${currency}`;
  }
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numeric);
  } catch (error) {
    return `${numeric.toFixed(2)} ${currency}`;
  }
};

const firstValidIsoDate = (...candidates) => {
  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return null;
};

const resolveTransactionId = (transaction) =>
  ['id', 'fitid', 'guid', 'reference', 'transid'].map((key) => transaction[key]).find(Boolean) ?? null;

const describeTransaction = ({ raw, posted }, currency, timezone) => {
  const when = posted
    ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'short', day: '2-digit' }).format(
        new Date(posted)
      )
    : 'Unknown date';
  const amount = formatCurrency(raw.amount, raw.currency || currency);
  const note = raw.description || raw.memo || raw.name || 'Transaction';
  return `- ${when}: ${note} (${amount})`;
};

const ledgerFor = (transactions = []) =>
  transactions
    .map((raw) => ({
      raw,
      posted: firstValidIsoDate(raw.posted, raw.timestamp, raw.date),
      id: resolveTransactionId(raw),
    }))
    .sort((a, b) => {
      if (a.posted && b.posted) return a.posted.localeCompare(b.posted);
      if (a.posted) return 1;
      if (b.posted) return -1;
      return 0;
    });

const isNewTransaction = (transaction, marker) => {
  if (!marker) return true;
  const { posted, id } = transaction;
  if (!marker.posted || !posted) return id && id !== marker.id;
  if (posted > marker.posted) return true;
  if (posted < marker.posted) return false;
  return marker.id && id && id !== marker.id;
};

const formatNotification = (account, transactions, timezone) => {
  const accountName = account.name || account.id;
  const balance = formatCurrency(account.balance, account.currency || 'USD');
  const lines = transactions.map((entry) => describeTransaction(entry, account.currency || 'USD', timezone));
  return {
    title: `New activity on ${accountName}`,
    body: [`Current balance: **${balance}**`, '', 'Recent transactions:', ...lines].join('\n'),
  };
};

const createBalanceScheduler = ({ simplefinClient, notifier, stateStore, config }) => {
  let task = null;
  let running = false;

  const handleAccount = async (account) => {
    const ledger = ledgerFor(account.transactions);
    const latest = ledger.at(-1) ?? null;
    const state = await stateStore.getAccountState(account.id);
    const marker = state.latestTransaction && typeof state.latestTransaction === 'object'
      ? state.latestTransaction
      : state.lastTransactionPosted || state.lastTransactionId
        ? {
            posted: state.lastTransactionPosted ?? null,
            id: state.lastTransactionId ?? null,
          }
        : null;

    const remember = (entry) =>
      stateStore.updateAccountState(account.id, {
        latestTransaction: entry ? { posted: entry.posted ?? null, id: entry.id ?? null } : { posted: null, id: null },
        lastTransactionPosted: entry?.posted ?? null,
        lastTransactionId: entry?.id ?? null,
        lastBalance: account.balance,
      });

    if (!marker && latest && config.polling.suppressInitialNotification) {
      await remember(latest);
      logger.info('Stored initial balance snapshot', { accountId: account.id });
      return;
    }

    const fresh = marker ? ledger.filter((entry) => isNewTransaction(entry, marker)) : ledger;
    if (!fresh.length) {
      if (latest) {
        await remember(latest);
      }
      return;
    }

    const notification = formatNotification(account, fresh, config.service.timezone);
    await notifier.sendNotification(notification);
    await remember(fresh.at(-1));
    logger.info('Sent notification for account activity', {
      accountId: account.id,
      transactionCount: fresh.length,
    });
  };

  const runOnce = async () => {
    if (running) {
      logger.warn('Skipping balance check because the previous run is still running');
      return;
    }
    running = true;
    try {
      const accounts = await simplefinClient.fetchAccounts();
      const filtered = config.simplefin.accountId
        ? accounts.filter((account) => account.id === config.simplefin.accountId)
        : accounts;
      logger.info('Fetched accounts from SimpleFIN', { accountCount: filtered.length });
      for (const account of filtered) {
        await handleAccount(account);
      }
    } finally {
      running = false;
    }
  };

  const scheduleRun = () =>
    runOnce().catch((error) => {
      logger.error('Balance check failed', { error: error.message });
    });

  const start = () => {
    if (task) return;
    const schedule = config.polling.cronExpression;
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }
    logger.info('Starting balance scheduler', {
      schedule,
      timezone: config.service.timezone,
    });
    task = cron.schedule(schedule, scheduleRun, {
      timezone: config.service.timezone,
    });
    scheduleRun();
  };

  const stop = () => {
    if (!task) return;
    task.stop();
    task = null;
  };

  return { start, stop };
};

export default createBalanceScheduler;
