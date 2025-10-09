<p align="center">
  <picture>
    <img alt="Balance-Bot logo" src="logo.svg" width="160" height="160">
  </picture>
</p>

<h1 align="center">balance-bot</h1>

<p align="center">
  The friendly money buddy that spots allowance drops, snack splurges, and everything in between—then gives your family a cheerful heads-up.
</p>

<p align="center">
  <a href="https://github.com/hursey013/balance-bot/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/hursey013/balance-bot/ci.yml?label=CI&logo=github"></a>
  <a href="https://github.com/hursey013/balance-bot/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0EA5E9"></a>
  <a href="https://ghcr.io/hursey013/balance-bot"><img alt="Image" src="https://img.shields.io/badge/ghcr-image-blue"></a>
</p>

## Say hello to balance-bot

Balance-bot keeps a watch on your [SimpleFIN](https://beta-bridge.simplefin.org) accounts and sends timely notes through [Apprise](https://github.com/caronc/apprise). Parents and kids stay in the loop—no spreadsheets, no stress, just quick reminders when something changes.

### Why families love it

- **Everyone hears the news.** Drop in Discord, Matrix, email, or any Apprise-ready place and we’ll send updates right where your family hangs out.
- **You stay in charge.** Pick which accounts matter to each person, then relax while balance-bot keeps watch.

### Peek at the alerts

Here’s an example message you might see:

```
🏦 Balance update for Jamie
📉 -$15.00
💰 $79.22
```

## Gather Your Ingredients

- A SimpleFIN setup token or an existing access link. Copy the whole thing so we can trade it for a long-lived key.
- Somewhere for Apprise to deliver the news—Discord channel, Matrix room, email, you name it.
- Docker **or** Node.js 20+ if you prefer running it directly.

## Quick Start

```yaml
version: '3.8'

services:
  balance-bot:
    image: ghcr.io/hursey013/balance-bot:latest
    container_name: balance-bot
    restart: unless-stopped
    ports:
      - '4000:4000' # opens the setup site
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

Once the containers settle, visit [http://localhost:4000](http://localhost:4000) (replace `localhost` with your NAS IP if needed). That’s your command center.

## Keep it shipshape

Run our quality checks anytime you tweak the bot:

```bash
npm run lint
npm run test
npm run build
```

Each command covers every workspace so the backend, frontend, and shared tooling stay in sync.

## License

balance-bot is released under the [MIT License](./LICENSE).
