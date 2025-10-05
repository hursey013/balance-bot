import cron from "node-cron";
import logger from "./logger.js";
import createSimplefinClient from "./simplefin.js";
import createNotifier from "./notifier.js";
import createStore from "./store.js";
import createBalanceProcessor from "./balance.js";
import { createConfig } from "./config.js";

class BalanceBotService {
  constructor({ configStore }) {
    this.configStore = configStore;
    this.simplefinClient = null;
    this.notifier = null;
    this.stateStore = null;
    this.balanceProcessor = null;
    this.task = null;
    this.currentConfig = null;
  }

  async start() {
    await this.reload();
  }

  async reload() {
    const persisted = await this.configStore.get();
    const config = createConfig({ persisted });

    if (!config.simplefin.accessUrl) {
      logger.warn(
        "SimpleFIN access URL not configured yet. Waiting for onboarding.",
      );
      await this._teardown();
      this.currentConfig = null;
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
    this.balanceProcessor = createBalanceProcessor({
      simplefinClient: this.simplefinClient,
      notifier: this.notifier,
      store: this.stateStore,
      config,
    });

    if (!config.notifications.targets.length) {
      logger.warn(
        "No notification targets configured. Balance changes will not be sent anywhere.",
      );
    }

    const schedule = config.polling.cronExpression;
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    logger.info("Starting balance monitor", {
      schedule,
      targetCount: config.notifications.targets.length,
      ...this.balanceProcessor.targetSummary,
    });

    const queueCheck = () =>
      this.balanceProcessor.checkBalances().catch((error) => {
        logger.error("Balance check failed", { error: error.message });
      });

    this.task = cron.schedule(schedule, queueCheck, { scheduled: false });
    queueCheck();
    this.task.start();
    this.currentConfig = config;
  }

  async fetchAccounts() {
    if (!this.simplefinClient) {
      throw new Error("SimpleFIN is not configured yet");
    }
    return this.simplefinClient.fetchAccounts();
  }

  async _teardown() {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }

    if (this.stateStore) {
      try {
        await this.stateStore.save();
      } catch (error) {
        logger.error("Failed to persist state during shutdown", {
          error: error.message,
        });
      }
    }

    this.simplefinClient = null;
    this.notifier = null;
    this.stateStore = null;
    this.balanceProcessor = null;
  }

  async stop() {
    await this._teardown();
  }
}

export default BalanceBotService;
