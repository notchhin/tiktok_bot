const fs = require('fs/promises');
const { createWriteStream } = require('fs');
const { Readable } = require('stream');
const os = require('os');
const path = require('path');

// Telegram's sendVideo hard limit is 50 MB. Above that we fall back to sendDocument (2 GB).
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// tikwm returns a direct (usually no-watermark) video URL we download locally.
// Set TIKTOK_API_BASE in .env only to point elsewhere.
const TIKTOK_API_BASE = process.env.TIKTOK_API_BASE || 'https://www.tikwm.com/api/';

const TIKWM_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Referer': 'https://www.tikwm.com/',
};

// tikwm is an external service and can intermittently fail, so retry once.
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;

async function streamVideo(videoUrl, outPath) {
  const videoRes = await fetch(videoUrl, { headers: TIKWM_HEADERS });
  if (!videoRes.ok) throw new Error(`video fetch failed: HTTP ${videoRes.status}`);

  // Stream straight to disk instead of buffering the whole video in memory
  // (large clips were spiking RAM/swap).
  await new Promise((resolve, reject) => {
    const out = createWriteStream(outPath);
    const src = Readable.fromWeb(videoRes.body);
    src.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    src.pipe(out);
  });
  return outPath;
}

async function downloadViaTikwm(url) {
  const apiRes = await fetch(
    TIKTOK_API_BASE + '?url=' + encodeURIComponent(url),
    { headers: TIKWM_HEADERS }
  );
  if (!apiRes.ok) throw new Error(`tikwm request failed: HTTP ${apiRes.status}`);
  const json = await apiRes.json();
  if (json.code !== 0 || !json.data) {
    throw new Error('tikwm returned no playable video: ' + (json.msg || json.code));
  }

  // Prefer the no-watermark source, then HD, then the watermarked one.
  const videoUrl = json.data.play || json.data.hdplay || json.data.wmplay;
  if (!videoUrl) throw new Error('tikwm returned no playable video URL');

  const outPath = path.join(os.tmpdir(), `tiktok_${Date.now()}.mp4`);
  await streamVideo(videoUrl, outPath);
  // Return the source URL too — callers can share it directly when the file
  // is too large to upload (e.g. Discord's 25 MB bot cap).
  return { file: outPath, playUrl: videoUrl };
}

async function downloadTikTok(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await downloadViaTikwm(url);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        console.error(`tikwm attempt ${attempt} failed, retrying:`, err.message);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

module.exports = { downloadTikTok, MAX_VIDEO_BYTES };
