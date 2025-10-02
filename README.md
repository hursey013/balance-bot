# Balance Bot

Balance Bot is a cheerful little Node.js sidekick that watches the [SimpleFIN](https://www.simplefin.org/protocol.html) bridge for balance changes and pings [Apprise](https://github.com/caronc/apprise) as soon as money moves. Drop it on your homelab, forget about copy-pasting numbers, and let the bot deliver the good (or "please stop buying snacks") news.

## Why this exists

Youth checking accounts ofen hide behind the grown-up app wall. Rather than playing telephone every time a sliver of allowance moves, Balance Bot keeps watch and whispers the latest balance right away. Under the hood it:

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
    image: ghcr.io/hursey013/balance-bot:latest
    container_name: balance-bot
    restart: unless-stopped
    environment:
      SIMPLEFIN_ACCESS_URL: "https://user:secret@bridge.simplefin.org/simplefin/..." # paste the full access link (credentials included)
      ACCOUNT_NOTIFICATION_TARGETS:
        >- # JSON array describing who should receive which account updates
        [
          {
            "name": "Ellie",
            "accountIds": ["acct-123"],
            "appriseConfigKey": "ellie"
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
    environment:
      PUID: "1026" # adjust to your DSM user/group if needed
      PGID: "100"
      TZ: "America/New_York"
    volumes:
      - ./apprise-config:/config
      - ./apprise-attachments:/attachments
    ports:
      - "8000:8000"
    restart: unless-stopped
```

Each target can point at a stateful Apprise configuration entry via `appriseConfigKey` (recommended for long-lived destinations like each kid's device bundle) or provide a list of inline `appriseUrls` for quick one-off routing. Mix and match as needed—Balance Bot will call Apprise with whichever option you supply per target.
