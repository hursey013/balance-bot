import cron from 'node-cron';
import logger from './logger.js';
import createSimplefinClient from './simplefin.js';
import createNotifier from './notifier.js';
import createStore from './store.js';
import { resolveBalanceInfo, formatCurrency, uniqueEntries } from './utils.js';
import { createConfig, ConfigStore } from './config.js';

/**
 * Coordinates SimpleFIN balances, persistence, and notifications for one run.
 */
class BalanceMonitor {
  constructor({ simplefinClient, notifier, stateStore, config, log = logger }) {
    this.simplefinClient = simplefinClient;
    this.notifier = notifier;
    this.stateStore = stateStore;
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
    this.log.info('Balance check started');

    try {
      const accounts = await this.#fetchAccounts();
      if (!Array.isArray(accounts) || !accounts.length) {
        this.log.warn('SimpleFIN returned no accounts');
        return false;
      }

      for (const account of accounts) {
        try {
          await this.#processAccount(account);
        } catch (error) {
          this.log.error('Failed to process account', {
            accountId: account?.id,
            error: error.message,
          });
        }
      }

      return true;
    } finally {
      this.log.info('Balance check finished');
      this.running = false;
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
    if (!account?.id) {
      this.log.warn('Skipping account without id');
      return;
    }

    const targets = this.#selectTargets(account.id);
    if (!targets.length) {
      return;
    }

    const balanceInfo = resolveBalanceInfo(account);
    if (!balanceInfo) {
      this.log.warn('Could not resolve account balance', {
        accountId: account.id,
      });
      return;
    }

    const { amount: currentBalance, currency } = balanceInfo;
    const previousBalance = await this.stateStore.getLastBalance(account.id);

    if (previousBalance === null) {
      await this.stateStore.setLastBalance(account.id, currentBalance);
      this.log.info('Stored baseline balance', {
        accountId: account.id,
        accountName: account.name || account.id,
        balance: currentBalance,
      });
      return;
    }

    const delta = currentBalance - previousBalance;
    if (Math.abs(delta) < 0.0001) {
      if (previousBalance !== currentBalance) {
        await this.stateStore.setLastBalance(account.id, currentBalance);
      }
      return;
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

      this.log.info('Sent balance update', {
        accountId: account.id,
        accountName,
        delta,
        newBalance: currentBalance,
        target: target.name || 'unnamed',
      });
    }

    await this.stateStore.setLastBalance(account.id, currentBalance);
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
 * Orchestrates configuration, polling, and notifications for Balance Bot.
 */
class BalanceBotService {
  constructor({ configStore }) {
    this.configStore = configStore;
    this.simplefinClient = null;
    this.notifier = null;
    this.stateStore = null;
    this.balanceMonitor = null;
    this.task = null;
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
    this.stateStore = createStore(config.storage.stateFilePath);
    this.balanceMonitor = new BalanceMonitor({
      simplefinClient: this.simplefinClient,
      notifier: this.notifier,
      stateStore: this.stateStore,
      config,
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

    logger.info('Starting balance monitor', {
      schedule,
      ...this.balanceMonitor.summary,
    });

    const queueCheck = () =>
      this.balanceMonitor.runOnce().catch((error) => {
        logger.error('Balance check failed', { error: error.message });
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
        logger.error('Failed to persist state during shutdown', {
          error: error.message,
        });
      }
    }

    this.simplefinClient = null;
    this.notifier = null;
    this.stateStore = null;
    this.balanceMonitor = null;
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
