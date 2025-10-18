import cron from 'node-cron';
import logger from './logger.js';
import createSimplefinClient from './simplefin.js';
import createNotifier from './notifier.js';
import createStore from './store.js';
import createHealthchecksClient from './healthchecks.js';
import { resolveBalanceInfo, formatCurrency, uniqueEntries } from './utils.js';
import { createConfig, ConfigStore } from './config.js';

/**
 * Coordinates SimpleFIN balances, persistence, and notifications for one run.
 */
class BalanceMonitor {
  constructor({
    simplefinClient,
    notifier,
    stateStore,
    config,
    healthchecks = null,
    log = logger,
  }) {
    this.simplefinClient = simplefinClient;
    this.notifier = notifier;
    this.stateStore = stateStore;
    this.healthchecks = healthchecks;
    this.log = log;

    const targets = Array.isArray(config.notifications?.targets)
      ? config.notifications.targets
      : [];
    this.targets = targets;

    const accountIds = targets.flatMap((target) =>
      Array.isArray(target.accountIds) ? target.accountIds : [],
    );

    this.explicitAccountIds = uniqueEntries(
      accountIds.filter((id) => id && id !== '*'),
    );
    this.hasWildcardTargets = accountIds.includes('*');
    this.wildcardTargetCount = targets.filter((target) => {
      if (!Array.isArray(target.accountIds)) return false;
      return target.accountIds.includes('*');
    }).length;

    this.running = false;
    this.summary = Object.freeze({
      targetCount: targets.length,
      targetedAccountCount: this.explicitAccountIds.length,
      wildcardTargetCount: this.wildcardTargetCount,
    });
  }

  /**
   * Report whether a balance run is already underway.
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }

  /**
   * Execute one balance check cycle.
   * @returns {Promise<boolean>}
   */
  async runOnce() {
    if (this.running) {
      this.log.warn(
        'Skipping balance check because the previous run is still running',
      );
      return false;
    }

    this.running = true;
    const startedAt = Date.now();
    let accountsFetched = 0;
    let notifiedAccounts = 0;
    let notificationsSent = 0;
    let failedAccounts = 0;
    let runSuccess = false;
    let runResult = false;
    let failureError = null;

    try {
      if (
        this.healthchecks &&
        typeof this.healthchecks.notifyStart === 'function'
      ) {
        await this.healthchecks.notifyStart();
      }

      const accounts = await this.#fetchAccounts();
      if (Array.isArray(accounts)) {
        accountsFetched = accounts.length;
      }
      if (!Array.isArray(accounts) || !accounts.length) {
        this.log.warn('SimpleFIN returned no accounts');
        runSuccess = true;
        runResult = false;
        return false;
      }

      for (const account of accounts) {
        try {
          const result = await this.#processAccount(account);
          if (result?.notificationsSent > 0) {
            notificationsSent += result.notificationsSent;
            notifiedAccounts += 1;
          }
        } catch (error) {
          this.log.error(
            { accountId: account?.id, err: error },
            'Failed to process account',
          );
          failedAccounts += 1;
        }
      }

      runSuccess = true;
      runResult = notificationsSent > 0;
      return true;
    } catch (error) {
      failureError = error;
      throw error;
    } finally {
      this.running = false;

      const elapsedMs = Date.now() - startedAt;
      const payload = {
        elapsedMs,
        timestamp: new Date().toISOString(),
        accountsFetched,
        notifiedAccounts,
        notificationsSent,
        failedAccounts,
      };

      if (failureError) {
        const errorMessage =
          failureError instanceof Error
            ? failureError.message
            : typeof failureError === 'string'
              ? failureError
              : 'Unknown error';
        if (
          this.healthchecks &&
          typeof this.healthchecks.notifyFailure === 'function'
        ) {
          await this.healthchecks.notifyFailure({
            ...payload,
            error: errorMessage,
          });
        }
      } else if (runSuccess) {
        if (
          this.healthchecks &&
          typeof this.healthchecks.notifySuccess === 'function'
        ) {
          await this.healthchecks.notifySuccess({
            ...payload,
            hasNotifications: runResult,
          });
        }
      }
    }
  }

  /** @private */
  async #fetchAccounts() {
    const needsAllAccounts =
      this.hasWildcardTargets || this.explicitAccountIds.length === 0;
    return this.simplefinClient.fetchAccounts(
      needsAllAccounts ? undefined : { accountIds: this.explicitAccountIds },
    );
  }

  /** @private */
  async #processAccount(account) {
    let notificationsSent = 0;
    if (!account?.id) {
      this.log.warn('Skipping account without id');
      return { notificationsSent };
    }

    const targets = this.#selectTargets(account.id);
    if (!targets.length) {
      return { notificationsSent };
    }

    const balanceInfo = resolveBalanceInfo(account);
    if (!balanceInfo) {
      this.log.warn(
        { accountId: account.id },
        'Could not resolve account balance',
      );
      return { notificationsSent };
    }

    const { amount: currentBalance, currency } = balanceInfo;
    const previousBalance = await this.stateStore.getLastBalance(account.id);

    if (previousBalance === null) {
      await this.stateStore.setLastBalance(account.id, currentBalance);
      this.log.info(
        {
          accountId: account.id,
          accountName: account.name || account.id,
          balance: currentBalance,
        },
        'Stored baseline balance',
      );
      return { notificationsSent };
    }

    const delta = currentBalance - previousBalance;
    if (Math.abs(delta) < 0.0001) {
      if (previousBalance !== currentBalance) {
        await this.stateStore.setLastBalance(account.id, currentBalance);
      }
      return { notificationsSent };
    }

    const accountName = account.name || account.nickname || account.id;
    const formattedBalance = formatCurrency(currentBalance, currency);
    const formattedDelta = formatCurrency(Math.abs(delta), currency);
    const signedDelta = `${delta > 0 ? '+' : '-'}${formattedDelta}`;
    const deltaColor = delta > 0 ? '#007700' : '#B00000';
    const trendEmoji = delta > 0 ? '📈' : '📉';

    for (const target of targets) {
      const body = [
        `👤 ${accountName}`,
        `${trendEmoji} <font color="${deltaColor}">${signedDelta}</font>`,
        `💰 ${formattedBalance}`,
      ].join('<br>');

      await this.notifier.sendNotification({
        title: 'Balance update',
        body,
        urls: target.appriseUrls,
        configKey: target.appriseConfigKey,
      });
      notificationsSent += 1;

      this.log.info(
        {
          accountId: account.id,
          accountName,
          delta,
          newBalance: currentBalance,
          target: target.name || 'unnamed',
        },
        'Sent balance update',
      );
    }

    await this.stateStore.setLastBalance(account.id, currentBalance);
    return { notificationsSent };
  }

  /** @private */
  #selectTargets(accountId) {
    return this.targets.filter((target) => {
      if (!Array.isArray(target.accountIds)) return false;
      return (
        target.accountIds.includes(accountId) || target.accountIds.includes('*')
      );
    });
  }
}

/**
 * Orchestrates configuration, polling, and notifications for balance-bot.
 */
class BalanceBotService {
  constructor({ configStore }) {
    this.configStore = configStore;
    this.simplefinClient = null;
    this.notifier = null;
    this.stateStore = null;
    this.balanceMonitor = null;
    this.task = null;
    this.healthchecks = null;
  }

  /**
   * Start the service and schedule the polling task.
   * @returns {Promise<void>}
   */
  async start() {
    await this.reload();
  }

  /**
   * Reload configuration, rebuild dependencies, and reschedule polling.
   * @returns {Promise<void>}
   */
  async reload() {
    const persisted = await this.configStore.get();
    const config = createConfig({ persisted });

    if (!config.simplefin.accessUrl) {
      logger.warn(
        'SimpleFIN access URL not configured yet. Waiting for onboarding.',
      );
      await this._teardown();
      return;
    }

    await this._teardown();

    this.simplefinClient = createSimplefinClient({
      accessUrl: config.simplefin.accessUrl,
      cacheFilePath: config.simplefin.cacheFilePath,
      cacheTtlMs: config.simplefin.cacheTtlMs,
    });

    this.notifier = createNotifier(config.notifier);
    this.healthchecks = createHealthchecksClient(config.healthchecks);
    this.stateStore = createStore(config.storage.stateFilePath);
    this.balanceMonitor = new BalanceMonitor({
      simplefinClient: this.simplefinClient,
      notifier: this.notifier,
      stateStore: this.stateStore,
      config,
      healthchecks: this.healthchecks,
      log: logger,
    });

    if (!config.notifications.targets.length) {
      logger.warn(
        'No notification targets configured. Balance changes will not be sent anywhere.',
      );
    }

    const schedule = config.polling.cronExpression;
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    logger.info(
      { schedule, ...this.balanceMonitor.summary },
      'Starting balance monitor',
    );

    const queueCheck = () =>
      this.balanceMonitor.runOnce().catch((error) => {
        logger.error({ err: error }, 'Balance check failed');
      });

    this.task = cron.schedule(schedule, queueCheck, { scheduled: false });
    queueCheck();
    this.task.start();
  }

  /**
   * Fetch accounts using the active SimpleFIN client.
   * @returns {Promise<any[]>}
   */
  async fetchAccounts() {
    if (!this.simplefinClient) {
      throw new Error('SimpleFIN is not configured yet');
    }
    return this.simplefinClient.fetchAccounts();
  }

  /**
   * Tear down scheduled tasks and flush pending state to disk.
   * @returns {Promise<void>}
   */
  async _teardown() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }

    if (this.stateStore) {
      try {
        await this.stateStore.save();
      } catch (error) {
        logger.error({ err: error }, 'Failed to persist state during shutdown');
      }
    }

    this.simplefinClient = null;
    this.notifier = null;
    this.stateStore = null;
    this.balanceMonitor = null;
    this.healthchecks = null;
  }

  /**
   * Stop the service gracefully.
   * @returns {Promise<void>}
   */
  async stop() {
    await this._teardown();
  }
}

export { BalanceMonitor, ConfigStore, createConfig, createSimplefinClient };

export default BalanceBotService;
