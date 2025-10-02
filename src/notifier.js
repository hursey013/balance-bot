const postNotification = async ({
  appriseApiUrl,
  urls,
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
        urls,
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

const createNotifier = ({ appriseApiUrl, requestTimeoutMs = 10000 }) => {
  const sendNotification = async ({ title, body, urls }) => {
    const targets = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!targets.length) {
      throw new Error('No Apprise URLs provided for notification.');
    }
    await postNotification({
      appriseApiUrl,
      urls: targets,
      requestTimeoutMs,
      title,
      body,
    });
  };

  return { sendNotification };
};

export default createNotifier;
