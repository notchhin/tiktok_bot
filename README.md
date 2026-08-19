# TikTok Bot (Telegram + Discord)

A bot that detects TikTok links in chat messages, downloads the video (without
watermark when possible), and reposts it with the original sender's username as
the caption. Works on **Telegram** and/or **Discord**. On Discord it only reacts
in one specific channel (configured by `DISCORD_CHANNEL_ID`).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.

3. Copy the env file and paste your token:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and set `TELEGRAM_BOT_TOKEN`.

4. Install `yt-dlp` and make sure it's on your PATH:
   ```bash
   pip install yt-dlp
   ```
   If you'd rather point at a specific binary, set `YTDLP_PATH` in `.env`.

5. **Important — disable privacy mode** so the bot can read group messages:
   - In a chat with @BotFather, run `/setprivacy`
   - Select your bot, choose **Disable**
   - Without this, the bot only sees messages that mention it or are commands.

5. Add the bot to your group.

6. Run it:
   ```bash
   npm start
   ```

## Discord (optional)

1. Create an application/bot at
   [discord.com/developers/applications](https://discord.com/developers/applications),
   then copy the token from the **Bot** tab into `DISCORD_BOT_TOKEN`.
2. In the same **Bot** tab, enable the **Message Content** privileged intent
   (required so the bot can read message text).
3. Invite the bot to your server with the `Send Messages`, `Manage Messages`
   (to delete the trigger link up front) and `Attach Files` scopes.
4. Right-click the channel you want the bot to monitor → **Copy Channel ID**,
   and paste it into `DISCORD_CHANNEL_ID` in `.env`. The bot ignores every other
   channel and direct message.
5. Both Telegram and Discord can run at the same time — set whichever tokens you
   need; leave the Discord ones blank to disable Discord.

## Deploy on Ubuntu (systemd)

1. Copy the project to the server (e.g. `/opt/tiktok-bot`) and install deps:
   ```bash
   cd /opt/tiktok-bot
   npm install --omit=dev
   cp .env.example .env   # then edit and set TELEGRAM_BOT_TOKEN
   ```

2. Install `yt-dlp` (standalone binary, always current) and Node if missing:
   ```bash
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp
   sudo chmod +x /usr/local/bin/yt-dlp
   sudo apt install -y nodejs npm   # or use NodeSource for a newer Node
   ```

3. Create a dedicated, unprivileged user:
   ```bash
   sudo useradd -r -s /usr/sbin/nologin bot
   sudo chown -R bot:bot /opt/tiktok-bot
   ```

4. Install and start the service (adjust paths in `tiktok-bot.service` if yours differ):
   ```bash
   sudo cp tiktok-bot.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now tiktok-bot
   sudo systemctl status tiktok-bot
   ```

5. Watch logs:
   ```bash
   sudo journalctl -u tiktok-bot -f
   ```

To update later: pull/refresh the code, then `sudo systemctl restart tiktok-bot`.
Keep yt-dlp fresh with `sudo yt-dlp -U`.

## Notes

- `yt-dlp` does the downloading, so keep it updated: `pip install -U yt-dlp`.
  TikTok changes its site often; an outdated yt-dlp is the usual cause of failures.
- Videos up to 50 MB are sent as `sendVideo`. Larger ones are sent as a document
  (Telegram's 2 GB limit) so they still get through.
- If `yt-dlp` isn't on your PATH, set `YTDLP_PATH` in `.env` to the full path of
  the binary.
- **IP blocks:** TikTok frequently blocks datacenter/VPS IPs with
  `Your IP address is blocked from accessing this post`. The bot can't fix that
  from code — run it from a residential network, or route traffic through a proxy
  by setting `HTTP_PROXY`/`HTTPS_PROXY` (yt-dlp reads these automatically).
