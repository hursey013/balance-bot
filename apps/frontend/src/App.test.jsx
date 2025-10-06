import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

const createConfigResponse = (overrides = {}) => ({
  simplefin: {
    configured: false,
    accessUrlPreview: null,
    ...overrides.simplefin,
  },
  notifier: {
    appriseApiUrl: 'http://apprise:8000/notify',
    ...overrides.notifier,
  },
  notifications: {
    targets: [],
    ...overrides.notifications,
  },
  polling: {
    cronExpression: '0 * * * *',
    ...overrides.polling,
  },
  onboarding: {
    appriseConfigured: false,
    ...overrides.onboarding,
  },
});

beforeEach(() => {
  globalThis.fetch = vi.fn((url) => {
    if (url === '/api/config') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createConfigResponse()),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ accounts: [] }),
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('renders setup token input when onboarding has not run', async () => {
  render(<App />);

  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/config');
  });

  expect(
    await screen.findByLabelText(/SimpleFIN setup token/i),
  ).toBeInTheDocument();
});

test('prompts for Apprise when SimpleFIN is already configured', async () => {
  globalThis.fetch = vi.fn((url) => {
    if (url === '/api/config') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            createConfigResponse({
              simplefin: {
                configured: true,
                accessUrlPreview: 'https://redacted',
              },
            }),
          ),
      });
    }
    if (url === '/api/simplefin/accounts') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ accounts: [{ id: 'acct-1' }] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  render(<App />);

  expect(
    await screen.findByLabelText(/Apprise API endpoint/i),
  ).toBeInTheDocument();
});

test('shows notification management when onboarding is finished', async () => {
  globalThis.fetch = vi.fn((url) => {
    if (url === '/api/config') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            createConfigResponse({
              simplefin: {
                configured: true,
                accessUrlPreview: 'https://redacted',
              },
              onboarding: {
                appriseConfigured: true,
              },
            }),
          ),
      });
    }
    if (url === '/api/simplefin/accounts') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ accounts: [{ id: 'acct-1' }] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  render(<App />);

  expect(
    await screen.findByText(/Notification recipients/i),
  ).toBeInTheDocument();
});
