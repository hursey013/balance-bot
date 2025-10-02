const requestJson = async ({ url, authScheme, accessSecret, timeoutMs }) => {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `${authScheme} ${accessSecret}`,
        Accept: 'application/json',
      },
      signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SimpleFIN request failed with status ${response.status}: ${body}`);
    }
    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`SimpleFIN request timed out after ${timeoutMs} ms`);
    }
    throw error;
  }
};

const createSimplefinClient = ({ accessUrl, accessSecret, authScheme = 'Token', timeoutMs = 10000 }) => {
  const fetchAccounts = async () => {
    const response = await requestJson({
      url: accessUrl,
      authScheme,
      accessSecret,
      timeoutMs,
    });
    if (!response || !Array.isArray(response.accounts)) {
      throw new Error('Unexpected SimpleFIN response: missing accounts array');
    }
    return response.accounts;
  };

  return { fetchAccounts };
};

export default createSimplefinClient;
