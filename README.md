# Balance Bot

Balance Bot is a cheerful Node.js sidekick that watches the [SimpleFIN](https://www.simplefin.org/protocol.html) bridge for balance changes and pings [Apprise](https://github.com/caronc/apprise) as soon as money moves. Drop it on your homelab, forget about copy-pasting numbers, and let the bot deliver the good (or "please stop buying snacks") news.

## Features

- 👨‍👩‍👧 Route updates to multiple family members with per-account or wildcard targets.
- 💾 Cache SimpleFIN responses between polls to stay friendly with rate limits.
- 📣 Send emoji-rich, HTML-formatted balance alerts through any Apprise destination.
- 🔌 Drop-in Docker Compose support plus straightforward `.env` configuration for bare Node.

## Prerequisites

- A SimpleFIN access link (looks like `https://user:pass@bridge.simplefin.org/simplefin`) from [beta-bridge.simplefin.org/info/developers](https://beta-bridge.simplefin.org/info/developers). Copy the entire URL with the embedded Basic Auth credentials when you create an access.
- At least one Apprise-friendly destination URL (Discord, Matrix, email, SMS gateways—pick your flavor) or an Apprise config key that points to a preconfigured bundle of URLs.
- Docker or Node.js 20+ if you want to run the service locally.

## Quick Start (Docker Compose)

```yaml
version: "3.8"

services:
  balance-bot:
    image: ghcr.io/hursey013/balance-bot:latest
    container_name: balance-bot
    restart: unless-stopped
    environment:
      SIMPLEFIN_ACCESS_URL: "https://user:secret@bridge.simplefin.org/simplefin"
      ACCOUNT_NOTIFICATION_TARGETS:
        >- # JSON array describing who should receive which account updates
        [
          {
            "name": "Elliot",
            "accountIds": ["acct-123"],
            "appriseConfigKey": "elliot"
          },
          {
            "name": "Family Room",
            "accountIds": ["*"],
            "appriseUrls": ["discord://webhook-id/webhook-token"]
          }
        ]
      APPRISE_API_URL: "http://apprise:8000/notify" # URL where Apprise listens inside the stack
    volumes:
      - ./data:/app/data
    depends_on:
      - apprise

  apprise:
    image: lscr.io/linuxserver/apprise-api:latest
    container_name: apprise
    restart: unless-stopped
    environment:
      PUID: "1026" # adjust to your environment
      PGID: "100"
      TZ: "America/New_York"
    volumes:
      - ./apprise-config:/config
      - ./apprise-attachments:/attachments
    ports:
      - "8000:8000"
```

Each target can point at a stateful Apprise configuration entry via `appriseConfigKey` (recommended for long-lived destinations like each kid's device bundle) or provide a list of inline `appriseUrls` for quick one-off routing. Mix and match as needed—Balance Bot will call Apprise with whichever option you supply per target. Use `"*"` in `accountIds` when a notification should be sent for every account.

### Example Notification

```
Title: Balance update

Account: 👤 Elliot
Change: 📉 -$12.34
New balance: 💰 $87.66
```

## Configuration Reference

| Variable                       | Purpose                                                                                                      | Default                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `SIMPLEFIN_ACCESS_URL`         | Full SimpleFIN access link including credentials (Balance Bot automatically calls the `/accounts` endpoint). | required                     |
| `APPRISE_API_URL`              | Base URL for Apprise notifications (append a config key automatically).                                      | `http://apprise:8000/notify` |
| `ACCOUNT_NOTIFICATION_TARGETS` | JSON describing who gets notified. Provide `accountIds`, plus `appriseUrls` or `appriseConfigKey`.           | `[]`                         |
| `POLL_CRON_EXPRESSION`         | Cron schedule for balance checks.                                                                            | `0 * * * *` (hourly)         |
| `SIMPLEFIN_CACHE_TTL_MS`       | Milliseconds to cache SimpleFIN responses; set to `0` to disable.                                            | `3600000`                    |
| `STATE_FILE_PATH`              | Where to persist the last known balances.                                                                    | `data/state.json`            |
| `SIMPLEFIN_CACHE_PATH`         | Where cached SimpleFIN responses are stored.                                                                 | `data/cache.json`            |

Fields inside `ACCOUNT_NOTIFICATION_TARGETS` are gently cleaned: whitespace is trimmed, blank account IDs are discarded, and empty destination lists are removed. Targets without destinations are ignored when notifications are sent.

## Running Locally

```bash
npm install
npm test
npm start
```

Create a `.env` file (or export variables directly) with at least:

```
SIMPLEFIN_ACCESS_URL=https://user:pass@bridge.simplefin.org/simplefin
APPRISE_API_URL=http://localhost:8000/notify
ACCOUNT_NOTIFICATION_TARGETS=[{"name":"Me","accountIds":["*"],"appriseUrls":["discord://..."]}]
```

The app writes both state (`data/state.json`) and optional SimpleFIN cache (`data/cache.json`). Keep those files on a persistent volume so restarts stay quiet.
