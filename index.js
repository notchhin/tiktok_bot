require('dotenv').config();
const fs = require('fs/promises');
const { downloadTikTok, MAX_VIDEO_BYTES } = require('./downloader');

// Matches www / vm / vt / m subdomains and bare tiktok.com links.
const TIKTOK_RE = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com[^\s)]+/i;

const STATUS_TEXT = '⏳ Downloading TikTok…';
const FAIL_TEXT = '❌ Could not download that TikTok video.';

function normalizeUrl(raw) {
  return raw.startsWith('http') ? raw : 'https://' + raw;
}

// Platform-agnostic handler. `ctx` adapts each chat platform to a small,
// uniform interface so Telegram and Discord share the same download logic:
//   sendText(channel, text)   -> returns a handle usable by deleteText
//   deleteText(handle)        -> removes a status message we posted
//   deleteMessage(handle)     -> removes the user's original trigger message
//   replyFile(channel, file, opts, isLarge) -> posts the video (opts.caption)
async function handleTikTok(ctx, channel, trigger, text, senderName) {
  const match = text.match(TIKTOK_RE);
  if (!match) return false;

  const url = normalizeUrl(match[0]);
  const status = await ctx.sendText(channel, STATUS_TEXT);

  // Remove the user's original TikTok link up front, before doing the work.
  if (trigger) await ctx.deleteMessage(trigger).catch(() => {});

  try {
    const { file, playUrl } = await downloadTikTok(url);
    const { size } = await fs.stat(file);
    const opts = { caption: senderName };
    await ctx.replyFile(channel, file, opts, size > MAX_VIDEO_BYTES, playUrl);
    await fs.unlink(file).catch(() => {});
  } catch (err) {
    console.error('Download failed:', err && err.message);
    await ctx.sendText(channel, FAIL_TEXT);
  } finally {
    if (status) await ctx.deleteText(status).catch(() => {});
  }

  return true;
}

// --- Telegram -------------------------------------------------------------
if (process.env.TELEGRAM_BOT_TOKEN) {
  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  const telegramCtx = {
    sendText: (chatId, text) => bot.sendMessage(chatId, text),
    deleteText: (msg) => bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {}),
    deleteMessage: (msg) => bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {}),
    replyFile: (chatId, file, opts, isLarge) => {
      if (isLarge) {
        // Too big for sendVideo — send as a document instead (up to 2 GB).
        return bot.sendDocument(chatId, file, opts, {
          filename: 'tiktok.mp4',
          contentType: 'video/mp4',
        });
      }
      return bot.sendVideo(chatId, file, opts);
    },
  };

  bot.on('text', async (msg) => {
    // Ignore other bots (including ourselves) to avoid loops.
    if (msg.from && msg.from.is_bot) return;

    const sender =
      (msg.from && msg.from.username && 'Send by: ' + msg.from.username) ||
      (msg.from && msg.from.first_name) ||
      'someone';

    await handleTikTok(telegramCtx, msg.chat.id, msg, msg.text || '', sender);
  });

  bot.on('polling_error', (err) => console.error('Polling error:', err.message));
  console.log('🤖 Telegram bot is running…');
}

// --- Discord --------------------------------------------------------------
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
  const { Client, GatewayIntentBits } = require('discord.js');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Discord caps bot uploads at 25 MB (Telegram allows up to 2 GB), so larger
  // videos get a 413 "Request entity too large". When that happens, share the
  // direct tikwm URL instead — Discord embeds direct .mp4 links as a video.
  const DISCORD_MAX_BYTES = 25 * 1024 * 1024;

  const sendTooLarge = async (channel, caption, playUrl) => {
    const head = caption ? caption + '\n' : '';
    if (playUrl) {
      await channel.send(head);
    } else {
      await channel.send(head + '❌ This TikTok is too large to upload on Discord ' +
        `(limit ${Math.round(DISCORD_MAX_BYTES / 1024 / 1024)} MB).`);
    }
  };

  const discordCtx = {
    sendText: (channel, text) => channel.send(text),
    deleteText: (msg) => msg.delete().catch(() => {}),
    deleteMessage: (msg) => msg.delete().catch(() => {}),
    replyFile: async (channel, file, opts, isLarge, playUrl) => {
      const { size } = await fs.stat(file);
      if (size > DISCORD_MAX_BYTES) {
        await sendTooLarge(channel, opts.caption, playUrl);
        return;
      }
      try {
        await channel.send({
          files: [{ attachment: file, name: 'tiktok.mp4' }],
          content: opts.caption || '',
        });
      } catch (err) {
        // Discord rejects oversized uploads with a bare 413; share the link
        // instead of surfacing an uncaught "Download failed".
        if (/entity too large|413/i.test(err.message || '')) {
          await sendTooLarge(channel, opts.caption, playUrl);
          return;
        }
        throw err;
      }
    },
  };

  client.on('messageCreate', async (message) => {
    // Only act in the configured channel, and ignore bots to avoid loops.
    if (message.author.bot) return;
    if (message.channel.id !== process.env.DISCORD_CHANNEL_ID) return;

    const sender = (message.author.username && 'Send by: ' + message.author.username) || 'someone';
    await handleTikTok(discordCtx, message.channel, message, message.content || '', sender);
  });

  client.on('error', (err) => console.error('Discord error:', err.message));
  client.login(process.env.DISCORD_BOT_TOKEN);
  console.log('🤖 Discord bot is running…');
}

if (!process.env.TELEGRAM_BOT_TOKEN &&
    !(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID)) {
  console.error('Nothing to run — set TELEGRAM_BOT_TOKEN and/or ' +
    'DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID in your .env.');
  process.exit(1);
}
