import logger from "./logger.js";
import { resolveBalanceInfo, formatCurrency, uniqueEntries } from "./utils.js";

const createBalanceProcessor = ({
  simplefinClient,
  notifier,
  store,
  config,
  logger: loggerLib = logger,
}) => {
  const log = loggerLib;
  const targets = Array.isArray(config.notifications.targets)
    ? config.notifications.targets
    : [];

  const allAccountIds = targets.flatMap((target) =>
    Array.isArray(target.accountIds) ? target.accountIds : [],
  );
  const wildcardTargetCount = targets.filter((target) =>
    Array.isArray(target.accountIds) ? target.accountIds.includes("*") : false,
  ).length;

  const explicitAccountIds = uniqueEntries(
    allAccountIds.filter((id) => id && id !== "*"),
  );
  const hasWildcardTargets = allAccountIds.includes("*");

  const selectTargets = (accountId) =>
    targets.filter((target) => {
      if (!Array.isArray(target.accountIds)) return false;
      return (
        target.accountIds.includes(accountId) || target.accountIds.includes("*")
      );
    });

  let running = false;

  const processAccount = async (account) => {
    if (!account || !account.id) {
      log.warn("Skipping account without id");
      return;
    }

    const matchedTargets = selectTargets(account.id);
    if (!matchedTargets.length) {
      return;
    }

    const balanceInfo = resolveBalanceInfo(account);
    if (!balanceInfo) {
      log.warn("Could not resolve account balance", {
        accountId: account.id,
      });
      return;
    }

    const { amount: currentBalance, currency } = balanceInfo;
    const previousBalance = await store.getLastBalance(account.id);

    if (previousBalance === null) {
      await store.setLastBalance(account.id, currentBalance);
      log.info("Stored baseline balance", {
        accountId: account.id,
        accountName: account.name || account.id,
        balance: currentBalance,
      });
      return;
    }

    const delta = currentBalance - previousBalance;
    if (Math.abs(delta) < 0.0001) {
      if (previousBalance !== currentBalance) {
        await store.setLastBalance(account.id, currentBalance);
      }
      return;
    }

    const accountName = account.name || account.nickname || account.id;
    const formattedBalance = formatCurrency(currentBalance, currency);
    const formattedDelta = formatCurrency(Math.abs(delta), currency);
    const signedDelta = `${delta > 0 ? "+" : "-"}${formattedDelta}`;
    const deltaColor = delta > 0 ? "#007700" : "#B00000";
    const trendEmoji = delta > 0 ? "📈" : "📉";

    for (const target of matchedTargets) {
      const body = [
        `👤 ${accountName}`,
        `${trendEmoji} <font color="${deltaColor}">${signedDelta}</font>`,
        `💰 ${formattedBalance}`,
      ].join("<br>");

      await notifier.sendNotification({
        title: "Balance update",
        body,
        urls: target.appriseUrls,
        configKey: target.appriseConfigKey,
      });

      log.info("Sent balance update", {
        accountId: account.id,
        accountName,
        delta,
        newBalance: currentBalance,
        target: target.name || "unnamed",
      });
    }

    await store.setLastBalance(account.id, currentBalance);
  };

  const fetchRelevantAccounts = async () => {
    const needsAllAccounts =
      hasWildcardTargets || explicitAccountIds.length === 0;
    return simplefinClient.fetchAccounts(
      needsAllAccounts ? undefined : { accountIds: explicitAccountIds },
    );
  };

  const checkBalances = async () => {
    if (running) {
      log.warn(
        "Skipping balance check because the previous run is still running",
      );
      return false;
    }
    running = true;
    try {
      const accounts = await fetchRelevantAccounts();
      if (!Array.isArray(accounts) || !accounts.length) {
        log.warn("SimpleFIN returned no accounts");
        return false;
      }
      for (const account of accounts) {
        try {
          await processAccount(account);
        } catch (error) {
          log.error("Failed to process account", {
            accountId: account?.id,
            error: error.message,
          });
        }
      }
      return true;
    } finally {
      running = false;
    }
  };

  return {
    checkBalances,
    isRunning: () => running,
    targetSummary: {
      wildcardCount: wildcardTargetCount,
      targetedCount: explicitAccountIds.length,
    },
  };
};

export default createBalanceProcessor;
