<p align="center">
  <picture>
    <img alt="Balance-Bot logo" src="logo.svg" width="160" height="160">
  </picture>
</p>

<h1 align="center">Balance Bot</h1>

<p align="center">
  Your cheerful SimpleFIN lookout—spotting every allowance drop or snack attack and launching emoji-filled Apprise alerts before the kids can say “cha-ching!”
</p>

<p align="center">
  <a href="https://github.com/hursey013/balance-bot/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hursey013/balance-bot/ci.yml?label=CI&logo=github"></a>
  <a href="https://github.com/hursey013/balance-bot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0EA5E9"></a>
  <a href="https://ghcr.io/hursey013/balance-bot"><img alt="Image" src="https://img.shields.io/badge/ghcr-image-blue"></a>
</p>

## Overview

Balance Bot is a friendly little Node.js helper that keeps an eye on the [SimpleFIN](https://beta-bridge.simplefin.org) bridge and nudges [Apprise](https://github.com/caronc/apprise) whenever money moves. It was built for families with kids who are too young for the bank’s app but still want to know when allowance hits—or when snack money disappears—without Mom or Dad relaying every single update.

## Features

- 👨‍👩‍👧 Share balance changes with everyone who needs to know, whether that’s one kid’s account or the whole crew via the wildcard `*` target.
- 💾 Reuse SimpleFIN responses for a bit so you stay well within bridge rate limits while keeping updates feeling fresh.
- 📣 Send colorful, emoji-packed notifications through any Apprise destination that works for your family chat or smart display.

#### Here’s the kind of alert the bot sends:

```
Title: Balance update

👤 Elliot - Checking
📉 -$12.34
💰 $87.66
```

## Prerequisites

- A SimpleFIN access link (looks like `https://user:pass@bridge.simplefin.org/simplefin`) from [beta-bridge.simplefin.org/info/developers](https://beta-bridge.simplefin.org/info/developers). When you generate it, copy the whole link—username, password, everything.
- Somewhere for Apprise to deliver notifications: a Discord webhook, Matrix room, email address, SMS gateway, or a saved Apprise config key if you already have one.
- Either Docker or Node.js 20+ on the machine that will run the bot.

## Quick Start (Docker Compose)

```yaml
version: "3.8"

services:
  balance-bot:
    image: ghcr.io/hursey013/balance-bot:latest
    container_name: balance-bot
    restart: unless-stopped
    environment:
      # Provide either SIMPLEFIN_SETUP_TOKEN for first boot or SIMPLEFIN_ACCESS_URL if you already have the link.
      SIMPLEFIN_SETUP_TOKEN: "paste-your-one-time-setup-token"
      # SIMPLEFIN_ACCESS_URL: "https://user:secret@bridge.simplefin.org/simplefin"
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

Targets can point to named Apprise configs (great for “Elliot’s iPad + phone” bundles) or list URLs right in place for quick experiments. Feel free to mix both styles—Balance Bot will happily use whatever you provide. Drop a `"*"` into `accountIds` when a target should hear about every account you’re tracking.

## Configuration Reference

| Variable                       | Purpose                                                                                                                                                                  | Default                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `SIMPLEFIN_ACCESS_URL`         | Full SimpleFIN access link including credentials (Balance Bot automatically calls the `/accounts` endpoint).                                                             | required (or use setup token)                     |
| `SIMPLEFIN_SETUP_TOKEN`        | Optional one-time setup token. When provided and no saved access URL is present, the token is exchanged at boot and the result is stored securely. Remove after success. | unset                                             |
| `SIMPLEFIN_ACCESS_URL_FILE`    | Path to the persisted SimpleFIN access URL. Handy for Docker secrets or custom mounts.                                                                                   | `data/simplefin-access-url`                       |
| `APPRISE_API_URL`              | Base URL for Apprise notifications (append a config key automatically).                                                                                                  | `http://apprise:8000/notify`                      |
| `ACCOUNT_NOTIFICATION_TARGETS` | JSON describing who gets notified. Provide `accountIds`, plus `appriseUrls` or `appriseConfigKey`.                                                                       | `[]`                                              |
| `POLL_CRON_EXPRESSION`         | Cron schedule for balance checks.                                                                                                                                        | `0 * * * *` (hourly)                              |
| `SIMPLEFIN_CACHE_TTL_MS`       | Milliseconds to cache SimpleFIN responses; set to `0` to disable.                                                                                                        | `3600000`                                         |
| `STATE_FILE_PATH`              | Where to persist the last known balances.                                                                                                                                | `data/state.json`                                 |
| `SIMPLEFIN_CACHE_PATH`         | Where cached SimpleFIN responses are stored.                                                                                                                             | `data/cache.json`                                 |
| `SIMPLEFIN_SETUP_URL`          | Override the endpoint used to exchange setup tokens (mostly for testing).                                                                                                | `https://beta-bridge.simplefin.org/connect/token` |

Balance Bot tidies up `ACCOUNT_NOTIFICATION_TARGETS` for you by trimming whitespace, skipping blank account IDs, and ignoring targets without any destinations so you don’t have to stress about perfect JSON formatting.

## Running Locally

```bash
npm install
npm test
npm start
```

Create a quick `.env` file (or export the same values another way) with at least:

```
SIMPLEFIN_ACCESS_URL=https://user:pass@bridge.simplefin.org/simplefin
APPRISE_API_URL=http://localhost:8000/notify
ACCOUNT_NOTIFICATION_TARGETS=[{"name":"Me","accountIds":["*"],"appriseUrls":["discord://..."]}]
```

The bot keeps track of the last balance it saw and any cached SimpleFIN responses under `data/`. Pop that folder on persistent storage (or bind-mount it in Docker) so it can pick up right where it left off.
