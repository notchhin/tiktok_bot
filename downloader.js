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

async function downloadTikTok(url) {
  const outTemplate = path.join(os.tmpdir(), `tiktok_${Date.now()}_%(id)s.%(ext)s`);

  const stdout = await runYtDlp([
    url,
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--print', 'filename',
    '-o', outTemplate,
    // Grab the clean (no-watermark) TikTok source when available.
    '--extractor-args', 'tiktok:download_without_watermark=1',
  ]);

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

module.exports = { downloadTikTok, MAX_VIDEO_BYTES, ytDlpCommand };
