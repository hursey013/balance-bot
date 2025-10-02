import path from "node:path";
import "dotenv/config";

const accessUrl = process.env.SIMPLEFIN_ACCESS_URL?.trim() ?? "";
const cronExpression =
  process.env.POLL_CRON_EXPRESSION?.trim() || "*/5 * * * *";
const appriseApiUrl =
  process.env.APPRISE_API_URL?.trim() || "http://apprise:8000/notify";
const stateFilePath =
  process.env.STATE_FILE_PATH?.trim() || path.resolve("data/state.json");

const rawTargets = process.env.ACCOUNT_NOTIFICATION_TARGETS;
const parsedTargets = rawTargets ? JSON.parse(rawTargets) : [];
const targets = Array.isArray(parsedTargets)
  ? parsedTargets
  : (parsedTargets?.targets ?? []);

const config = {
  simplefin: {
    accessUrl,
  },
  polling: {
    cronExpression,
  },
  notifier: {
    appriseApiUrl,
  },
  notifications: {
    targets,
  },
  storage: {
    stateFilePath,
  },
};

export default config;
