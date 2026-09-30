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

/**
 * Parses user message into caption and array of hashtags.
 * @param {string} text
 * @returns {{ caption: string, hashtags: string[], fullText: string }}
 */
function parseCaptionAndHashtags(text = '') {
  const raw = String(text || '').trim();
  if (!raw || raw.toLowerCase() === '/skip') {
    return {
      caption: '3 Little Bosses 🐾',
      hashtags: ['#cat', '#cute', '#pets', '#reels', '#shorts'],
      fullText: '3 Little Bosses 🐾 #cat #cute #pets #reels #shorts',
    };
  }

  // Extract all hashtags (#word or #từ_khoá)
  const hashtagMatches = raw.match(/#[^\s#]+/g) || [];
  const hashtags = hashtagMatches.map(h => h.trim());

  // Remove hashtags from text to get pure caption
  let caption = raw;
  for (const h of hashtags) {
    caption = caption.replace(h, '');
  }
  caption = caption.replace(/\s+/g, ' ').trim();

  if (!caption && hashtags.length > 0) {
    caption = '3 Little Bosses 🐾';
  }

  const fullText = hashtags.length > 0
    ? `${caption}\n\n${hashtags.join(' ')}`
    : caption;

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
