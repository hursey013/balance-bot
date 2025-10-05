import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import BalanceBotService, { ConfigStore } from "./index.js";
import { decodeSetupToken, exchangeSetupToken } from "./simplefin.js";
import { trim, redactAccessUrl } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIST_PATH = path.resolve(__dirname, "../../frontend/dist");

/**
 * Assemble the Express application and boot the polling service.
 * @returns {Promise<{ app: import("express").Express, botService: import("./index.js").default }>}
 */
const createApp = async () => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const configStore = new ConfigStore({});

  const botService = new BalanceBotService({ configStore });
  await botService.start();

  const formatConfigResponse = async () => {
    const config = await configStore.get();
    return {
      simplefin: {
        configured: Boolean(config.simplefin.accessUrl),
        accessUrlPreview: config.simplefin.accessUrl
          ? redactAccessUrl(config.simplefin.accessUrl)
          : null,
      },
      notifier: {
        appriseApiUrl: config.notifier.appriseApiUrl,
      },
      notifications: {
        targets: config.notifications.targets,
      },
      polling: {
        cronExpression: config.polling.cronExpression,
      },
    };
  };

  app.get("/api/config", async (req, res, next) => {
    try {
      res.json(await formatConfigResponse());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/simplefin/access", async (req, res, next) => {
    try {
      const { setupToken, accessUrl } = req.body ?? {};
      let resolvedAccessUrl = trim(accessUrl);

      if (setupToken) {
        const { claimUrl } = decodeSetupToken(setupToken);
        const exchange = await exchangeSetupToken({ claimUrl });
        resolvedAccessUrl = exchange.accessUrl;
      }

      if (!resolvedAccessUrl) {
        res.status(400).json({
          error: "Provide either a SimpleFIN setup token or an access URL.",
        });
        return;
      }

      await configStore.setSimplefinAccess(resolvedAccessUrl);
      await botService.reload();
      const accounts = await botService.fetchAccounts();

      res.json({
        accessUrlPreview: redactAccessUrl(resolvedAccessUrl),
        accounts,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/simplefin/accounts", async (req, res, next) => {
    try {
      const accounts = await botService.fetchAccounts();
      res.json({ accounts });
    } catch (error) {
      if (error.message.includes("not configured")) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.put("/api/config", async (req, res, next) => {
    try {
      const { appriseApiUrl, cronExpression, targets } = req.body ?? {};
      await configStore.setConfig({ appriseApiUrl, cronExpression, targets });
      await botService.reload();
      res.json(await formatConfigResponse());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    express.static(FRONTEND_DIST_PATH, {
      extensions: ["html"],
    }),
  );

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(FRONTEND_DIST_PATH, "index.html"));
  });

  app.use((error, req, res) => {
    logger.error("API request failed", {
      path: req.path,
      method: req.method,
      error: error.message,
    });
    res.status(500).json({ error: error.message });
  });

  return { app, botService };
};

/**
 * Launch the HTTP server and wire graceful shutdown handlers.
 * @returns {Promise<void>}
 */
const start = async () => {
  const { app, botService } = await createApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  const server = app.listen(port, () => {
    logger.info("Balance Bot backend listening", { port });
  });

  const shutdown = async (signal) => {
    logger.info("Received shutdown signal", { signal });
    server.close(async () => {
      await botService.stop();
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

start().catch((error) => {
  logger.error("Failed to start backend server", { error: error.message });
  process.exit(1);
});
