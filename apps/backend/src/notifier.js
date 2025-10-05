import got from "got";
import { trimTrailingSlash } from "./utils.js";

/**
 * @typedef {object} NotificationPayload
 * @property {string} title
 * @property {string} body
 * @property {string[]|undefined} urls
 * @property {string|undefined} configKey
 */

const postNotification = async ({ appriseApiUrl, urls, title, body }) => {
  const payload = {
    title,
    body,
    format: "html",
  };

  if (Array.isArray(urls) && urls.length) {
    payload.urls = urls;
  }

  try {
    await got.post(appriseApiUrl, {
      json: payload,
      retry: { limit: 0 },
    });
  } catch (error) {
    if (error.response) {
      const { statusCode, body } = error.response;
      const errorBody =
        typeof body === "string" ? body : (body?.toString?.() ?? "");
      throw new Error(
        `Apprise notification failed with status ${statusCode}: ${errorBody}`,
      );
    }
    throw error;
  }
};

const createNotifier = ({ appriseApiUrl }) => {
  if (!appriseApiUrl) {
    throw new Error("Apprise API URL is required");
  }

  const baseUrl = trimTrailingSlash(appriseApiUrl);

  /**
   * @param {NotificationPayload} options
   */
  const sendNotification = async ({ title, body, urls, configKey }) => {
    const targets = Array.isArray(urls) ? urls.filter(Boolean) : [];
    const key = configKey ? configKey.trim() : "";
    if (!targets.length && !key) {
      throw new Error("No Apprise destination provided for notification.");
    }

    const endpoint = key ? `${baseUrl}/${encodeURIComponent(key)}` : baseUrl;

    await postNotification({
      appriseApiUrl: endpoint,
      urls: key ? undefined : targets,
      title,
      body,
    });
  };

  return { sendNotification };
};

export default createNotifier;
