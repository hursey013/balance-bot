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
  notifications: {
    targets: [],
    ...overrides.notifications,
  },
  environment: {
    appriseApiUrl: 'http://apprise:8000/notify',
    cronExpression: '0 * * * *',
    healthchecksPingUrl: '',
    stateFilePath: '/app/data/state.json',
    ...overrides.environment,
  },
  onboarding: {
    simplefinConfigured: false,
    targetsConfigured: false,
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

test('shows notification management when SimpleFIN is configured', async () => {
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
    await screen.findByText(/Notification recipients/i),
  ).toBeInTheDocument();
});

test('renders runtime environment details from the API', async () => {
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
              environment: {
                appriseApiUrl: 'http://apprise.local/notify',
                cronExpression: '*/30 * * * *',
                healthchecksPingUrl: 'https://hc-ping.com/uuid',
                stateFilePath: '/data/state.json',
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
  const runtimeHeadings = await screen.findAllByText(/Runtime environment/i);
  expect(runtimeHeadings.length).toBeGreaterThan(0);
  expect(
    await screen.findByText(/http:\/\/apprise\.local\/notify/i),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/\*\/30 \* \* \* \*/i),
  ).toBeInTheDocument();
  expect(await screen.findByText(/https:\/\/hc-ping\.com\/uuid/i)).toBeInTheDocument();
  const statePaths = await screen.findAllByText(/\/data\/state\.json/i);
  expect(statePaths.length).toBeGreaterThan(0);
});
