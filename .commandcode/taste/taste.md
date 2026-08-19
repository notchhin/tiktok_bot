# Taste

- Deploys bots on a VPS running Ubuntu, managed as a custom systemd service (rather than Docker or PM2). Confidence: 0.7
- Prefers automation and self-contained solutions that minimize manual user intervention; wants the bot to handle tasks "by itself" rather than requiring manual steps (e.g., exporting cookies, scp, editing configs). Confidence: 0.85
- Values hands-off convenience over robustness/self-reliance; willing to accept third-party/external dependencies and less reliable approaches (e.g., a third-party TikTok API fallback) to avoid manual effort. Confidence: 0.7
- Prefers the bot to be unobtrusive in chat: delete the user's trigger/link message (up front, before doing work) and send results without replying to or quoting the original message — just the output and a minimal caption. Confidence: 0.7
