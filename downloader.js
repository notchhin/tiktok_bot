const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Telegram's sendVideo hard limit is 50 MB. Above that we fall back to sendDocument (2 GB).
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function ytDlpCommand() {
  return process.env.YTDLP_PATH || 'yt-dlp';
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpCommand(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

// TikTok bot-checks the VPS IP and intermittently refuses the rehydration
// data, so a single attempt often fails. Retry a couple times with a short
// backoff before falling back to the third-party API.
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;

async function downloadOnce(url, outTemplate) {
  const args = [
    url,
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--print', 'filename',
    '-o', outTemplate,
    // Grab the clean (no-watermark) TikTok source when available.
    '--extractor-args', 'tiktok:download_without_watermark=1',
  ];

  // A logged-in session's cookies defeat TikTok's bot-check on datacenter IPs.
  if (process.env.COOKIES_FILE) {
    args.push('--cookies', process.env.COOKIES_FILE, '--no-cookies-to-file');
  }

  const stdout = await runYtDlp(args);

  const filePath = stdout.trim().split(/\r?\n/).pop();
  if (!filePath) {
    throw new Error('yt-dlp produced no output');
  }

  try {
    await fs.access(filePath);
  } catch {
    throw new Error('yt-dlp did not create the expected file');
  }

  return filePath;
}

async function downloadViaYtDlp(url) {
  const outTemplate = path.join(os.tmpdir(), `tiktok_${Date.now()}_%(id)s.%(ext)s`);

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await downloadOnce(url, outTemplate);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        console.error(`yt-dlp attempt ${attempt} failed, retrying:`, err.message);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw lastErr;
}

// Cookie-free fallback: the tikwm API returns a direct (usually no-watermark)
// video URL we download locally. Less reliable than yt-dlp and an external
// dependency, but works without cookies or a clean IP.
// Override with TIKTOK_API_BASE in .env only if you must point elsewhere.
const TIKTOK_API_BASE = process.env.TIKTOK_API_BASE || 'https://www.tikwm.com/api/';

const TIKWM_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Referer': 'https://www.tikwm.com/',
};

async function downloadViaApi(url) {
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

  const outPath = path.join(os.tmpdir(), `tiktok_api_${Date.now()}.mp4`);
  const videoRes = await fetch(videoUrl, { headers: TIKWM_HEADERS });
  if (!videoRes.ok) throw new Error(`video fetch failed: HTTP ${videoRes.status}`);
  const buf = Buffer.from(await videoRes.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return outPath;
}

async function downloadTikTok(url) {
  try {
    return await downloadViaYtDlp(url);
  } catch (ytErr) {
    console.error('yt-dlp exhausted, falling back to tikwm:', ytErr.message);
    return await downloadViaApi(url);
  }
}

module.exports = { downloadTikTok, MAX_VIDEO_BYTES, ytDlpCommand };
