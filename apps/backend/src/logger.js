import pino from 'pino';

/**
 * Shared logger instance tuned for production defaults and quiet test runs.
 */
const isTestRun =
  process.env.NODE_ENV === 'test' || typeof process.env.NODE_TEST_CONTEXT === 'string';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTestRun ? 'silent' : 'info'),
});

export default logger;
