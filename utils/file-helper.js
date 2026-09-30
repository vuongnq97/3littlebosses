'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

function generateJobId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `job_${time}_${rand}`;
}

function getJobDir(jobId) {
  const dir = path.join(config.uploadsDir, jobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function isVideoFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function cleanJobDir(jobId) {
  const dir = path.join(config.uploadsDir, jobId);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
}

const DEFAULT_HASHTAGS = [
  '#3LilBosses',
  '#ThreeLittleBosses',
  '#Cats',
  '#CatLife',
  '#CatLovers',
  '#FunnyCats',
  '#CuteCats',
  '#CatsOfTikTok',
  '#CatVideos',
  '#DailyCats',
];

/**
 * Parses user message into caption and array of hashtags.
 * Đảm bảo caption luôn xuống dòng (enter) rồi mới tới danh sách hashtag.
 * @param {string} text
 * @returns {{ caption: string, hashtags: string[], fullText: string }}
 */
function parseCaptionAndHashtags(text = '') {
  const raw = String(text || '').trim();
  if (!raw || raw.toLowerCase() === '/skip') {
    const caption = '';
    const hashtags = [...DEFAULT_HASHTAGS];
    return {
      caption,
      hashtags,
      fullText: hashtags.join(' '),
    };
  }

  // Extract all hashtags (#word or #từ_khoá)
  const hashtagMatches = raw.match(/#[^\s#]+/g) || [];
  let hashtags = hashtagMatches.map(h => h.trim());

  // Remove hashtags from text to get pure caption
  let caption = raw;
  for (const h of hashtags) {
    caption = caption.replace(h, '');
  }
  caption = caption.replace(/\s+/g, ' ').trim();

  // Nếu người dùng không nhập hashtag nào, tự động dùng bộ hashtag mặc định
  if (hashtags.length === 0) {
    hashtags = [...DEFAULT_HASHTAGS];
  }

  // Nếu có caption: caption phải xuống dòng (enter) rồi mới tới hashtag. Nếu caption rỗng: chỉ gồm hashtag
  const fullText = caption
    ? `${caption}\n\n${hashtags.join(' ')}`
    : hashtags.join(' ');

  return {
    caption,
    hashtags,
    fullText,
  };
}

module.exports = {
  generateJobId,
  getJobDir,
  isVideoFile,
  isImageFile,
  cleanJobDir,
  parseCaptionAndHashtags,
};
