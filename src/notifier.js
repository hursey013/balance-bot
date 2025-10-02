const normalizeUrls = (raw) => {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const postNotification = async ({
  appriseApiUrl,
  appriseUrls,
  requestTimeoutMs,
  title,
  body,
}) => {
  const signal = AbortSignal.timeout(requestTimeoutMs);
  try {
    const response = await fetch(appriseApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: appriseUrls,
        title,
        body,
        format: 'markdown',
      }),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Apprise notification failed with status ${response.status}: ${text}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Apprise request timed out after ${requestTimeoutMs} ms`);
    }
    throw error;
  }
};

const createNotifier = ({ appriseApiUrl, appriseUrls, requestTimeoutMs = 10000 }) => {
  const urls = normalizeUrls(appriseUrls);

  const sendNotification = async ({ title, body }) => {
    if (!urls.length) {
      throw new Error('No Apprise URLs configured. Provide APPRISE_NOTIFICATION_URLS.');
    }
    await postNotification({
      appriseApiUrl,
      appriseUrls: urls,
      requestTimeoutMs,
      title,
      body,
    });
  };

  return { sendNotification };
};

export default createNotifier;
