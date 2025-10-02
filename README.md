# Balance Bot

Balance Bot is a cheerful little Node.js sidekick that watches the [SimpleFIN](https://www.simplefin.org/protocol.html) bridge for balance changes and pings [Apprise](https://github.com/caronc/apprise) as soon as money moves. Drop it on your homelab, forget about copy-pasting numbers, and let the bot deliver the good (or "please stop buying snacks") news.

## Why this exists

USAA youth accounts hide behind the grown-up app wall. Rather than playing telephone every time a sliver of allowance moves, Balance Bot keeps watch and whispers the latest balance right away. Under the hood it:

- Polls the SimpleFIN bridge you connect and follows one or many accounts.
- Tracks the latest balance for each account and notices when it rises or falls.
- Hands balance + delta updates to Apprise, routing them to each kid’s devices.
- Saves its place locally so restarts don’t double-ding your kid.

## What you’ll need

- A SimpleFIN access link (looks like `https://user:pass@bridge.simplefin.org/access/...`) from [beta-bridge.simplefin.org/info/developers](https://beta-bridge.simplefin.org/info/developers). Copy the entire URL with the embedded Basic Auth credentials when you create an access.
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
      SIMPLEFIN_ACCESS_URL: "https://user:secret@bridge.simplefin.org/access/..." # paste the full access link (credentials included)
      POLL_CRON_EXPRESSION: "*/5 * * * *" # cron schedule for checking SimpleFIN (keep it chill)
      ACCOUNT_NOTIFICATION_TARGETS: >- # JSON array describing who should receive which account updates
        [
          {
            "name": "Ellie",
            "accountIds": ["acct-123"],
            "appriseUrls": "mailto://ellie@example.com"
          },
          {
            "name": "Max",
            "accountIds": ["acct-456", "acct-789"],
            "appriseUrls": [
              "discord://webhook-id/webhook-token"
            ]
          }
        ]
      APPRISE_API_URL: "http://apprise:8000/notify" # URL where Apprise listens inside the stack
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

### Dev-friendly SimpleFIN caching

Balance Bot keeps a tiny LowDB-backed cache of the most recent SimpleFIN response so you don't spam the API while iterating on notification formatting or other behavior. Cached data automatically expires after a short window and will be refreshed on the next poll. If you need to tweak or disable the cache entirely, there are advanced environment knobs available—but the defaults should cover most workflows.

## How it works

1. The SimpleFIN client fetches account data over HTTPS, letting the embedded `user:pass@` credentials in the access link provide Basic Auth automatically.
2. Each scheduled run compares the latest balance for every account against the saved snapshot.
3. Whenever a balance rises or falls, Balance Bot records the delta and sends an update downstream.
4. Apprise fans that message out to the URLs configured for each kid—buzzing inboxes, phones, or wherever else you send it.

### Getting the right SimpleFIN values

The ["Start a connection" section of the SimpleFIN protocol](https://www.simplefin.org/protocol.html#start-a-connection) walks through generating an access link that already embeds HTTP Basic Auth credentials (e.g. `https://user:secret@beta-bridge.simplefin.org/access/...`). Copy that entire URL into `SIMPLEFIN_ACCESS_URL`—credentials and all. Balance Bot passes the URL straight to `fetch`, so the Basic Auth header is derived automatically with no extra secret variables or manual headers required.

## License

MIT License © 2025
