import config from './config.js';
import logger from './logger.js';
import createSimplefinClient from './simplefinClient.js';
import createNotifier from './notifier.js';
import createStateStore from './stateStore.js';
import createBalanceScheduler from './balanceScheduler.js';

const main = async () => {
  logger.info('Booting balance bot');
  const simplefinClient = createSimplefinClient(config.simplefin);
  const notifier = createNotifier(config.notifier);
  const stateStore = createStateStore(config.storage.stateFilePath);
  const scheduler = createBalanceScheduler({ simplefinClient, notifier, stateStore, config });

  const shutdown = async (signal) => {
    logger.info('Received shutdown signal', { signal });
    scheduler.stop();
    try {
      await stateStore.save();
    } catch (error) {
      logger.error('Failed to persist state during shutdown', { error: error.message });
    }
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', { error: error.message });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message });
  });

  scheduler.start();
};

main().catch((error) => {
  logger.error('Fatal error during startup', { error: error.message });
  process.exit(1);
});
