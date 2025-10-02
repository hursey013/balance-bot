import cron from 'node-cron';
import logger from './logger.js';

const parseNumeric = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveBalanceInfo = (account) => {
  if (!account) return null;
  const rawBalance = account.balance;
  const currency = account.currency || rawBalance?.currency || 'USD';

  let amount = parseNumeric(rawBalance);
  if (amount === null && rawBalance && typeof rawBalance === 'object') {
    amount =
      parseNumeric(rawBalance.current) ??
      parseNumeric(rawBalance.available) ??
      parseNumeric(rawBalance.amount) ??
      parseNumeric(rawBalance.value);
  }

  if (amount === null) {
    return null;
  }

  return { amount, currency };
};

const formatCurrency = (amount, currency) => {
  if (!Number.isFinite(amount)) {
    return `${amount ?? '0'} ${currency}`;
  }
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const createBalanceScheduler = ({ simplefinClient, notifier, stateStore, config }) => {
  const targets = config.notifications.targets || [];
  const wildcardTargets = targets.filter((target) => target.accountIds.includes('*'));
  const accountTargets = new Map();

  for (const target of targets) {
    for (const accountId of target.accountIds) {
      if (accountId === '*') continue;
      const list = accountTargets.get(accountId) ?? [];
      list.push(target);
      accountTargets.set(accountId, list);
    }
  }

  const targetedAccountIds = [...accountTargets.keys()];

  const selectTargets = (accountId) => {
    const specific = accountTargets.get(accountId) ?? [];
    return [...new Set([...specific, ...wildcardTargets])];
  };

  let task = null;
  let running = false;

  const handleAccount = async (account) => {
    if (!account || !account.id) {
      logger.warn('Skipping account without id');
      return;
    }

    const matchedTargets = selectTargets(account.id);
    if (!matchedTargets.length) {
      return;
    }

    const balanceInfo = resolveBalanceInfo(account);
    if (!balanceInfo) {
      logger.warn('Could not resolve account balance', { accountId: account.id });
      return;
    }

    const { amount: currentBalance, currency } = balanceInfo;
    const previousBalance = await stateStore.getLastBalance(account.id);

    if (previousBalance === null) {
      await stateStore.setLastBalance(account.id, currentBalance);
      logger.info('Stored baseline balance', {
        accountId: account.id,
        accountName: account.name || account.id,
        balance: currentBalance,
      });
      return;
    }

    const delta = currentBalance - previousBalance;
    if (Math.abs(delta) < 0.0001) {
      if (previousBalance !== currentBalance) {
        await stateStore.setLastBalance(account.id, currentBalance);
      }
      return;
    }

    const accountName = account.name || account.nickname || account.id;
    const formattedBalance = formatCurrency(currentBalance, currency);
    const formattedDelta = formatCurrency(Math.abs(delta), currency);
    const signedDelta = `${delta > 0 ? '+' : '-'}${formattedDelta}`;

    for (const target of matchedTargets) {
      const title = target.name ? `${target.name} balance update` : `${accountName} balance update`;
      const body = [
        `Account: **${accountName}** (${account.id})`,
        `Change: ${signedDelta}`,
        `New balance: **${formattedBalance}**`,
      ].join('\n');

      await notifier.sendNotification({
        title,
        body,
        urls: target.appriseUrls,
      });

      logger.info('Sent balance update', {
        accountId: account.id,
        accountName,
        delta,
        newBalance: currentBalance,
        target: target.name || 'unnamed',
      });
    }

    await stateStore.setLastBalance(account.id, currentBalance);
  };

  const runOnce = async () => {
    if (running) {
      logger.warn('Skipping balance check because the previous run is still running');
      return;
    }
    running = true;
    try {
      const needsAllAccounts = wildcardTargets.length > 0 || targetedAccountIds.length === 0;
      const accounts = await simplefinClient.fetchAccounts(
        needsAllAccounts ? undefined : { accountIds: targetedAccountIds },
      );
      if (!Array.isArray(accounts) || !accounts.length) {
        logger.warn('SimpleFIN returned no accounts');
        return;
      }
      for (const account of accounts) {
        try {
          await handleAccount(account);
        } catch (error) {
          logger.error('Failed to process account', {
            accountId: account?.id,
            error: error.message,
          });
        }
      }
    } finally {
      running = false;
    }
  };

  const scheduleRun = () => runOnce().catch((error) => {
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
      targetCount: targets.length,
    });
    task = cron.schedule(schedule, scheduleRun);
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
