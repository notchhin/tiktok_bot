# Taste

- Deploys bots on a VPS running Ubuntu, managed as a custom systemd service (rather than Docker or PM2). Confidence: 0.7
- Prefers automation and self-contained solutions that minimize manual user intervention; wants the bot to handle tasks "by itself" rather than requiring manual steps (e.g., exporting cookies, scp, editing configs). Confidence: 0.85
- Values hands-off convenience over robustness/self-reliance; willing to accept third-party/external dependencies and less reliable approaches (e.g., a third-party TikTok API fallback) to avoid manual effort. Removed the more robust self-reliant tool (yt-dlp) entirely in favor of a tikwm-only API path, reinforcing this. Confidence: 0.8
- Prefers the bot to be unobtrusive in chat: delete the user's trigger/link message (up front, before doing work) and send results without replying to or quoting the original message — just the output and a minimal caption. Confidence: 0.7
- Wants long/ugly raw CDN URLs (e.g., TikTok CDN links) shortened/cleaned up rather than pasted in full into chat, to avoid flooding the channel with a wall of link text — consistent with keeping chat output clean and unobtrusive. Confidence: 0.65
