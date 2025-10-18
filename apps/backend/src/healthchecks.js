import logger from './logger.js';
import { trim } from './utils.js';

const noopAsync = async () => {};

const buildPingUrl = (baseUrl, variant) => {
  if (!baseUrl) {
    return null;
  }

  switch (variant) {
    case 'start':
      return `${baseUrl}/start`;
    case 'fail':
      return `${baseUrl}/fail`;
    case 'success':
    default:
      return baseUrl;
  }
};

const createSender = ({ baseUrl, log }) => {
  const sendPing = async (variant, payload) => {
    const url = buildPingUrl(baseUrl, variant);
    if (!url) {
      return;
    }

    const hasPayload =
      payload &&
      typeof payload === 'object' &&
      Object.keys(payload).length > 0;

    const options = hasPayload
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      : {
          method: 'GET',
        };

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        log.warn(
          {
            source: 'healthchecks',
            variant,
            url,
            status: response.status,
          },
          'Healthchecks ping failed',
        );
      }
    } catch (error) {
      log.warn(
        {
          source: 'healthchecks',
          variant,
          url,
          err: error,
        },
        'Healthchecks ping threw',
      );
    }
  };

  return {
    notifyStart: () => sendPing('start'),
    notifySuccess: (payload) => sendPing('success', payload),
    notifyFailure: (payload) => sendPing('fail', payload),
    isEnabled: true,
  };
};

export const createHealthchecksClient = (
  { pingUrl } = {},
  { log = logger } = {},
) => {
  const baseUrl = trim(pingUrl);
  if (!baseUrl) {
    return {
      notifyStart: noopAsync,
      notifySuccess: noopAsync,
      notifyFailure: noopAsync,
      isEnabled: false,
    };
  }

  return createSender({ baseUrl, log });
};

export default createHealthchecksClient;
