'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}


const baseDir = __dirname;
const uploadsDir = path.join(baseDir, 'storage', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function parseBool(val, defaultVal = false) {
  if (val === undefined || val === null || val === '') return defaultVal;
  return String(val).toLowerCase() === 'true' || String(val) === '1';
}

function parseList(val) {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  baseDir,
  uploadsDir,

  app: {
    autoCleanup: parseBool(process.env.AUTO_CLEANUP_TEMP_FILES, true),
    dryRun: parseBool(process.env.DRY_RUN, false),
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedChatIds: parseList(process.env.ALLOWED_CHAT_IDS),
    photoBatchWindowMs: parseInt(process.env.PHOTO_BATCH_WINDOW_MS || '4000', 10),
  },

  mediaServer: {
    port: parseInt(process.env.MEDIA_SERVER_PORT || '3005', 10),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3005').replace(/\/+$/, ''),
    autoTunnel: parseBool(process.env.AUTO_TUNNEL, true),
  },

  facebook: {
    enabled: parseBool(process.env.ENABLE_FACEBOOK, true),
    pageId: process.env.FB_PAGE_ID || '',
    accessToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
    apiVersion: process.env.FB_API_VERSION || 'v21.0',
  },

  instagram: {
    enabled: parseBool(process.env.ENABLE_INSTAGRAM, false),
    userId: process.env.IG_USER_ID || '',
    accessToken: process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || '',
    apiVersion: process.env.FB_API_VERSION || 'v21.0',
  },


  threads: {
    enabled: parseBool(process.env.ENABLE_THREADS, false),
    userId: process.env.THREADS_USER_ID || '',
    accessToken: process.env.THREADS_ACCESS_TOKEN || '',
  },

  youtube: {
    enabled: parseBool(process.env.ENABLE_YOUTUBE, false),
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
    privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || 'public',
  },

  tiktok: {
    enabled: parseBool(process.env.ENABLE_TIKTOK, true),
    webhookUrl: process.env.N8N_TIKTOK_WEBHOOK_URL || 'http://localhost:5678/webhook/3littlebosses-tiktok',
    credentialId: process.env.N8N_TIKTOK_CREDENTIAL_ID || 'waMts0FrkIYhCuzv',
    channelUrl: process.env.TIKTOK_CHANNEL_URL || 'https://www.tiktok.com/@3lilbosses',
  },

  twitter: {
    enabled: parseBool(process.env.ENABLE_TWITTER, false),
    mode: (process.env.TWITTER_MODE || 'cookie').toLowerCase(),
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
  },
};

config.reload = function reloadConfig() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
  }
  config.facebook.accessToken = process.env.FB_PAGE_ACCESS_TOKEN || '';
  config.facebook.pageId = process.env.FB_PAGE_ID || '';
  config.facebook.enabled = parseBool(process.env.ENABLE_FACEBOOK, true);

  config.instagram.accessToken = process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || '';
  config.instagram.userId = process.env.IG_USER_ID || '';
  config.instagram.enabled = parseBool(process.env.ENABLE_INSTAGRAM, false);

  config.threads.accessToken = process.env.THREADS_ACCESS_TOKEN || '';
  config.threads.userId = process.env.THREADS_USER_ID || '';
  config.threads.enabled = parseBool(process.env.ENABLE_THREADS, false);

  config.mediaServer.publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3005').replace(/\/+$/, '');
  return config;
};

module.exports = config;
