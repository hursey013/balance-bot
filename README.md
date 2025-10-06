<p align="center">
  <picture>
    <img alt="Balance-Bot logo" src="logo.svg" width="160" height="160">
  </picture>
</p>

<h1 align="center">balance-bot</h1>

<p align="center">
  Your cheerful SimpleFIN lookout—spotting every allowance drop or snack attack and launching emoji-filled Apprise alerts before the kids can say “cha-ching!”
</p>

<p align="center">
  <a href="https://github.com/hursey013/balance-bot/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hursey013/balance-bot/ci.yml?label=CI&logo=github"></a>
  <a href="https://github.com/hursey013/balance-bot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0EA5E9"></a>
  <a href="https://ghcr.io/hursey013/balance-bot"><img alt="Image" src="https://img.shields.io/badge/ghcr-image-blue"></a>
</p>

## Meet balance-bot

Think of balance-bot as the enthusiastic helper who keeps an eye on the [SimpleFIN](https://beta-bridge.simplefin.org) bridge so you don’t have to. When an allowance lands—or a mystery snack run drains the balance—we nudge [Apprise](https://github.com/caronc/apprise) and send an emoji-packed message straight to the people who care.

## What You’ll Need (Nothing Scary)

- A SimpleFIN setup token or an existing access link. Copy the whole thing—we’ll paste it into the setup wizard in a moment.
- Anywhere Apprise can reach your crew: a Discord webhook, Matrix room, email address, or an Apprise config key you already have ready to go.
- Docker or Node.js 20+ on the machine that will run balance-bot.

## Fastest Path: Docker Compose

Drop this into `docker-compose.yml`, then bring it up with `docker compose up -d`:

```yaml
version: '3.8'

services:
  balance-bot:
    image: ghcr.io/hursey013/balance-bot:latest
    container_name: balance-bot
    restart: unless-stopped
    ports:
      - '4000:4000' # exposes the onboarding UI + API
    environment:
      TZ: 'America/New_York'
    volumes:
      - ./data:/app/data
    depends_on:
      - apprise

  apprise:
    image: lscr.io/linuxserver/apprise-api:latest
    container_name: apprise
    restart: unless-stopped
    environment:
      PUID: '1026' # tweak to match your user
      PGID: '100'
      TZ: 'America/New_York'
    volumes:
      - ./apprise-config:/config
      - ./apprise-attachments:/attachments
    ports:
      - '8000:8000'
```

Once the containers are up, open [http://localhost:4000](http://localhost:4000). The wizard will walk you through everything—no `.env` editing required. Keep the browser tab open, grab your SimpleFIN token or access link, and we’ll handle the rest together.

## Guided Onboarding

1. **Paste the SimpleFIN setup token or access link.** We’ll exchange the token, stash the long-lived access URL in your config, and immediately pull down your accounts so you can see what you’re working with.
2. **Meet your accounts.** Pick which accounts belong to which people (or use the `*` wildcard when someone should hear about everything). You can mix Apprise config keys and raw URLs—balance-bot happily supports both.
3. **Save and relax.** When you click “Save preferences,” we write everything to the balance-bot data directory (by default `data/config.json`, or `/app/data/config.json` inside Docker), restart the background watcher, and you’re live.

Need to tweak something later? Pop back to [http://localhost:4000](http://localhost:4000). The wizard remembers where you left off and makes updates painless.

## What Gets Saved

All of your answers live in `config.json` inside the data directory:

```json
{
  "simplefin": {
    "accessUrl": "https://user:pass@bridge.simplefin.org/simplefin",
    "cacheFilePath": "cache.json",
    "cacheTtlMs": 3600000
  },
  "notifier": {
    "appriseApiUrl": "http://apprise:8000/notify"
  },
  "notifications": {
    "targets": [
      {
        "name": "Family Room",
        "accountIds": ["*"],
        "appriseUrls": ["discord://webhook-id/webhook-token"]
      }
    ]
  },
  "polling": {
    "cronExpression": "0 * * * *"
  },
  "storage": {
    "stateFilePath": "state.json"
  }
}
```

Paths inside the file are relative to that same data directory, so `data/state.json` turns into `/app/data/state.json` in the container (and `apps/backend/data/state.json` when you run locally without overriding anything).

If you ever want a fresh start, delete `config.json` from the data directory while balance-bot is stopped and rerun the wizard.

The Docker image sets `BALANCE_BOT_DATA_DIR=/app/data` so everything lands in one easy-to-mount folder. Feel free to point that variable anywhere else if you have a different storage layout in mind.

### Tweaking the Nerdy Bits

Want to poll more often, dial down caching, or move the state file somewhere else? Open the data directory’s `config.json` in your favorite editor while the bot is stopped, make your adjustments, then start the service again. balance-bot will pick up the new settings on the next reload.

## Project Layout (For the Curious)

```
apps/
  backend/   # Express API, SimpleFIN polling loop, JSON persistence
  frontend/  # Vite + React + Tailwind onboarding wizard
```

Running any of the root scripts (`npm run lint`, `npm run test`, `npm run build`) will fan out to both workspaces.

## Running Locally Without Docker

```bash
npm install
npm run build
npm run start --workspace=@balance-bot/backend
```

The backend listens on [http://localhost:4000](http://localhost:4000). For a hot-reloading UI, open another terminal and run:

```bash
npm run dev --workspace=@balance-bot/frontend
```

## Keeping Everything Healthy

- `npm test` runs the backend’s Node test suite and the frontend’s Vitest suite.
- `npm run lint` keeps styling tidy across the repo.
- `npm run build` bundles the frontend and preps the backend for production.

balance-bot stores cached balances and SimpleFIN snapshots under the data directory (for the Docker image that’s `/app/data`). Mount that directory somewhere persistent so your history sticks around between restarts.

That’s it—you’re ready to keep your crew in the loop without babysitting bank logins. Have fun!
