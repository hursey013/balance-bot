# Balance Bot

Balance Bot is a cheerful little Node.js sidekick that watches the [SimpleFIN](https://www.simplefin.org/protocol.html) bridge for fresh transactions and pings [Apprise](https://github.com/caronc/apprise) whenever your kid’s balance shifts. Drop it on your homelab, forget about copy-pasting numbers, and let the bot deliver the good (or "please stop buying snacks") news.

## Why this exists

USAA youth accounts hide behind the grown-up app wall. Rather than playing telephone every time a sliver of allowance moves, Balance Bot keeps watch and whispers the latest balance right away. Under the hood it:

- Polls the SimpleFIN bridge you connect and follows one or many accounts.
- Spots brand-new transactions without replaying history.
- Crafts playful Markdown summaries and hands them to Apprise for delivery wherever you like.
- Saves its place locally so restarts don’t double-ding your kid.

## What you’ll need

- SimpleFIN bridge credentials (`accessUrl` + `secret`) from [beta-bridge.simplefin.org/info/developers](https://beta-bridge.simplefin.org/info/developers).
- At least one Apprise-friendly destination URL (Discord, Matrix, email, SMS gateways—pick your flavor).
- A Docker host ready to run the stack below.

## Plug-and-play stack

Copy the Compose snippet, swap the placeholders, and you’re off to the races. The inline comments call out what goes where.

```yaml
version: "3.8"

services:
  balance-bot:
    build: .
    container_name: balance-bot
    restart: unless-stopped
    environment:
      SIMPLEFIN_ACCESS_URL: "https://bridge.simplefin.org/access/..." # paste the accessUrl from the SimpleFIN bridge
      SIMPLEFIN_ACCESS_SECRET: "replace-with-your-secret" # paste the matching secret
      SIMPLEFIN_ACCOUNT_ID: "optional-account-id" # leave empty to watch every linked account
      SIMPLEFIN_TIMEOUT_MS: "10000" # API call timeout in milliseconds
      POLL_CRON_EXPRESSION: "*/5 * * * *" # cron schedule for checking SimpleFIN (keep it chill)
      SUPPRESS_INITIAL_NOTIFICATION: "true" # flip to false if you want a welcome message on boot
      APPRISE_NOTIFICATION_URLS: "mailto://kid@example.com" # comma-separated list of Apprise destinations
      APPRISE_API_URL: "http://apprise:8000/notify" # URL where Apprise listens inside the stack
      APPRISE_TIMEOUT_MS: "10000" # timeout for calling Apprise
      STATE_FILE_PATH: "/app/data/state.json" # where the bot tracks its last-seen transactions
      TZ: "UTC" # timezone for timestamps
    volumes:
      - ./data:/app/data
    depends_on:
      - apprise

  apprise:
    image: ghcr.io/linuxserver/apprise-api:latest
    container_name: apprise
    restart: unless-stopped
    environment:
      - PUID=1000 # map to your host user if you care about permissions
      - PGID=1000 # map to your host group if you care about permissions
      - TZ=UTC # timezone for Apprise’s logs
    volumes:
      - ./apprise:/config
    ports:
      - "8000:8000"
```

Tweak the Apprise config in `apprise/apprise.yml` (it shows up after the first launch) to add more destinations or fancy formatting. The `data/` folder sticks around between restarts so the bot remembers what it already reported.

## How it works

1. The SimpleFIN client fetches account data using the `Authorization: Token <secret>` magic SimpleFIN expects.
2. Each scheduled run checks balances and transactions against the saved state.
3. Anything new triggers a tidy Markdown snapshot with the latest balance plus a highlight reel of transactions.
4. Apprise fans that message out to every URL you provided—buzzing inboxes, phones, or wherever else you send it.

## License

MIT License © 2025
