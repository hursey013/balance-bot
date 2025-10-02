const postNotification = async ({ appriseApiUrl, urls, title, body }) => {
  const payload = {
    title,
    body,
    format: "html",
  };

  if (Array.isArray(urls) && urls.length) {
    payload.urls = urls;
  }

  const response = await fetch(appriseApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Apprise notification failed with status ${response.status}: ${text}`,
    );
  }
};

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const createNotifier = ({ appriseApiUrl }) => {
  if (!appriseApiUrl) {
    throw new Error("Apprise API URL is required");
  }

  const baseUrl = trimTrailingSlash(appriseApiUrl);

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
