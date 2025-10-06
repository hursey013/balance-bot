<p align="center">
  <picture>
    <img alt="Balance-Bot logo" src="logo.svg" width="160" height="160">
  </picture>
</p>

<h1 align="center">balance-bot</h1>

<p align="center">
  The family-friendly money buddy that spots allowance drops, snack splurges, and everything in between—then gives your family a cheerful heads-up.
</p>

<p align="center">
  <a href="https://github.com/hursey013/balance-bot/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hursey013/balance-bot/ci.yml?label=CI&logo=github"></a>
  <a href="https://github.com/hursey013/balance-bot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0EA5E9"></a>
  <a href="https://ghcr.io/hursey013/balance-bot"><img alt="Image" src="https://img.shields.io/badge/ghcr-image-blue"></a>
</p>

## Welcome to Your Household Helper

Balance-bot keeps a friendly watch on your [SimpleFIN](https://beta-bridge.simplefin.org) accounts and sends bright, timely notes through [Apprise](https://github.com/caronc/apprise). Parents and kids stay in the loop—no spreadsheets, no stress, just quick reminders when something changes.

### Why families love it

- **Everyone hears the news.** Drop in Discord, Matrix, email, or any Apprise-ready place and we’ll whisper updates right where your family hangs out.
- **It’s cheerful, not stuffy.** We use warm wording and emojis so every alert feels like a helpful nudge, not a bank statement.
- **You stay in charge.** Pick which accounts matter to each person, then relax while balance-bot keeps watch.

## Gather Your Ingredients

- A SimpleFIN setup token or an existing access link. Copy the whole thing so we can trade it for a long-lived key.
- Somewhere for Apprise to deliver the news—Discord channel, Matrix room, email, you name it.
- Docker (Portainer, Synology Container Manager, or vanilla `docker`) **or** Node.js 20+ if you prefer running it directly.

## Quick Start: Copy & Paste Docker Compose

This snippet plays nicely with Docker Compose, Portainer stacks, and Synology’s container wizard. Paste it in and launch:

```yaml
version: '3.8'

services:
  balance-bot:
    image: ghcr.io/hursey013/balance-bot:latest
    container_name: balance-bot
    restart: unless-stopped
    ports:
      - '4000:4000' # opens the friendly setup site
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
      PUID: '1026' # adjust to match your user
      PGID: '100'
      TZ: 'America/New_York'
    volumes:
      - ./apprise-config:/config
      - ./apprise-attachments:/attachments
    ports:
      - '8000:8000'
```

### Portainer & Synology tips

- **Portainer:** Open *Stacks* → *Add Stack*, paste the YAML above, tweak the time zone and IDs, and hit *Deploy the stack*.
- **Synology Container Manager:** Choose *Projects* → *Create*, select “Import compose file,” paste the YAML, update volume paths if needed, and launch. Synology will auto-create the bind mounts for you.

Once the containers settle, visit [http://localhost:4000](http://localhost:4000) (replace `localhost` with your NAS IP if needed). That’s your command center.

## Take the Setup Tour

1. **Share your SimpleFIN link.** Paste your setup token or access link. We swap it for the secure, long-term key and fetch your accounts.
2. **Tag your kids (and yourself).** For each person, choose the accounts they should hear about. Use the `*` choice when someone should get every update. Mix and match Apprise URLs, config keys, or both.
3. **Choose how the note should sound.** Write a friendly label for each person so the alerts read just right.
4. **Hit “Save recipients.”** Balance-bot tucks everything into its data folder and starts watching your balances straight away.

Need to make a change later? Revisit the site anytime. We remember your settings and only show the “Save recipients” button when something actually changed.

### Peek at the alerts

Here’s an example Discord message you might see:

```
🏦 Balance update for Jamie
Kids Savings • $54.22 → $79.22

Allowance landed right on schedule. High five! 🎉
```

Every notification includes the account name, the new balance, and a short, upbeat summary.

## Where your settings live

Everything ends up in `config.json` inside the mounted `data` folder:

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

Because the Docker image sets `BALANCE_BOT_DATA_DIR=/app/data`, the same folder keeps your access keys, cache, and history tidy. Want a clean slate? Stop the container, remove `config.json`, and start things up again.

## Prefer running without Docker?

```bash
npm install
npm run build
npm run start --workspace=@balance-bot/backend
```

The app listens on [http://localhost:4000](http://localhost:4000). For live-reloading while you tinker with the interface:

```bash
npm run dev --workspace=@balance-bot/frontend
```

## Caring for your balance-bot

- `npm test` checks both the backend and frontend so you know everything still works.
- `npm run lint` keeps the code tidy and consistent across the project.
- `npm run build` packages the whole app for production.

Balances and snapshots live alongside `config.json`. Mount the `data` directory somewhere durable (a NAS share, synced folder, etc.) so nothing gets lost between restarts.

That’s all! Fire it up, invite the family, and let balance-bot keep watch while you enjoy the fun stuff.
