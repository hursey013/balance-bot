import cron from "node-cron";
import logger from "./logger.js";
import createSimplefin, { ensureSimplefinAccess } from "./simplefin.js";
import createNotifier from "./notifier.js";
import createStore from "./store.js";
import createBalanceProcessor from "./balance.js";
import { createConfig } from "./config.js";

const main = async () => {
  logger.info("Booting balance bot");
  const secret = await ensureSimplefinAccess();
  if (!secret.accessUrl) {
    throw new Error(
      "SimpleFIN access URL is required. Provide SIMPLEFIN_ACCESS_URL, SIMPLEFIN_ACCESS_URL_FILE, or SIMPLEFIN_SETUP_TOKEN.",
    );
  }

  const config = createConfig({
    accessUrl: secret.accessUrl,
    accessUrlFilePath: secret.filePath,
  });

  const simplefinClient = createSimplefin(config.simplefin);
  const notifier = createNotifier(config.notifier);
  const stateStore = createStore(config.storage.stateFilePath);
  const balance = createBalanceProcessor({
    simplefinClient,
    notifier,
    store: stateStore,
    config,
  });

  if (!config.notifications.targets.length) {
    logger.warn(
      "No notification targets configured. Balance changes will not be sent anywhere.",
    );
  }

  const queueCheck = () =>
    balance.checkBalances().catch((error) => {
      logger.error("Balance check failed", { error: error.message });
    });

  const schedule = config.polling.cronExpression;
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron expression: ${schedule}`);
  }

  logger.info("Starting balance monitor", {
    schedule,
    targetCount: config.notifications.targets.length,
    ...balance.targetSummary,
  });

  const task = cron.schedule(schedule, queueCheck, { scheduled: false });
  queueCheck();

  const shutdown = async (signal) => {
    logger.info("Received shutdown signal", { signal });
    task.stop();
    try {
      await stateStore.save();
    } catch (error) {
      logger.error("Failed to persist state during shutdown", {
        error: error.message,
      });
    }
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.on("unhandledRejection", (error) => {
    logger.error("Unhandled promise rejection", { error: error.message });
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error: error.message });
  });

  task.start();
};

main().catch((error) => {
  logger.error("Fatal error during startup", { error: error.message });
  process.exit(1);
});
