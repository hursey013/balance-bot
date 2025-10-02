const requestJson = async ({ url, headers }) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `SimpleFIN request failed with status ${response.status}: ${body}`,
    );
  }

  return response.json();
};

const createSimplefinClient = ({ accessUrl }) => {
  if (!accessUrl) {
    throw new Error("SimpleFIN access URL is required");
  }

  let access;
  try {
    access = new URL(accessUrl);
  } catch (error) {
    throw new Error(`Invalid SimpleFIN access URL: ${error.message}`);
  }

  const username = access.username ? decodeURIComponent(access.username) : "";
  const password = access.password ? decodeURIComponent(access.password) : "";
  const hasCredentials = username || password;
  const authHeader = hasCredentials
    ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    : null;
  if (hasCredentials) {
    access.username = "";
    access.password = "";
  }
  const baseUrl = access.toString();

  const fetchAccounts = async ({ accountIds } = {}) => {
    const requestUrl = new URL(baseUrl);
    requestUrl.searchParams.set("balances-only", "1");

    if (Array.isArray(accountIds) && accountIds.length) {
      const uniqueIds = [
        ...new Set(accountIds.map((id) => `${id}`.trim()).filter(Boolean)),
      ];
      for (const id of uniqueIds) {
        requestUrl.searchParams.append("account", id);
      }
    }

    const response = await requestJson({
      url: requestUrl.toString(),
      headers: authHeader
        ? {
            Authorization: authHeader,
          }
        : undefined,
    });
    if (!response || !Array.isArray(response.accounts)) {
      throw new Error("Unexpected SimpleFIN response: missing accounts array");
    }

    return response.accounts;
  };

  return { fetchAccounts };
};

export default createSimplefinClient;
