const requestJson = async ({ url, timeoutMs, headers }) => {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(headers ?? {}),
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

const createSimplefinClient = ({ accessUrl, timeoutMs = 10000 }) => {
  if (!accessUrl) {
    throw new Error('SimpleFIN access URL is required');
  }

  let access;
  try {
    access = new URL(accessUrl);
  } catch (error) {
    throw new Error(`Invalid SimpleFIN access URL: ${error.message}`);
  }

  const username = access.username ? decodeURIComponent(access.username) : '';
  const password = access.password ? decodeURIComponent(access.password) : '';
  const hasCredentials = username || password;
  const authHeader = hasCredentials
    ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    : null;
  if (hasCredentials) {
    access.username = '';
    access.password = '';
  }
  const url = access.toString();

  const fetchAccounts = async () => {
    const response = await requestJson({
      url,
      timeoutMs,
      headers: authHeader
        ? {
            Authorization: authHeader,
          }
        : undefined,
    });
    if (!response || !Array.isArray(response.accounts)) {
      throw new Error('Unexpected SimpleFIN response: missing accounts array');
    }

    return response.accounts;
  };

  return { fetchAccounts };
};

export default createSimplefinClient;
