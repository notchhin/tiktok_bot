require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs/promises');
const { downloadTikTok, MAX_VIDEO_BYTES } = require('./downloader');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN — copy .env.example to .env and fill it in.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Matches www / vm / vt / m subdomains and bare tiktok.com links.
const TIKTOK_RE = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com[^\s)]+/i;

bot.on('text', async (msg) => {
  // Ignore other bots (including ourselves) to avoid loops.
  if (msg.from && msg.from.is_bot) return;

  const text = msg.text || '';
  const match = text.match(TIKTOK_RE);
  if (!match) return;

  const url = match[0].startsWith('http') ? match[0] : 'https://' + match[0];
  const sender = msg.from && msg.from.username
    ? '@' + msg.from.username
    : (msg.from && msg.from.first_name) || 'someone';

  const chatId = msg.chat.id;
  const status = await bot.sendMessage(chatId, '⏳ Downloading TikTok…');

  try {
    const file = await downloadTikTok(url);
    const { size } = await fs.stat(file);
    const replyOpts = { caption: sender, reply_to_message_id: msg.message_id };

    if (size > MAX_VIDEO_BYTES) {
      // Too big for sendVideo — send as a document instead (up to 2 GB).
      await bot.sendDocument(chatId, file, replyOpts, {
        filename: 'tiktok.mp4',
        contentType: 'video/mp4',
      });
    } else {
      await bot.sendVideo(chatId, file, replyOpts);
    }

    await fs.unlink(file).catch(() => {});
  } catch (err) {
    console.error('Download failed:', err && err.message);
    await bot.sendMessage(chatId, '❌ Could not download that TikTok video.');
  } finally {
    await bot.deleteMessage(chatId, status.message_id).catch(() => {});
  }
});

bot.on('polling_error', (err) => console.error('Polling error:', err.message));

console.log('🤖 TikTok bot is running…');
