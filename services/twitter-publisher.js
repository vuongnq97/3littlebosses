'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const { chromium } = require('playwright');
const config = require('../config');
const logger = require('../utils/logger');

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Xây dựng Authorization Header cho OAuth 1.0a (Dành cho chế độ API chính thức)
 */
function buildOAuthHeader(method, requestUrl, extraParams = {}) {
  const { apiKey: consumerKey, apiSecret: consumerSecret, accessToken: token, accessSecret: tokenSecret } = config.twitter;

  if (!consumerKey || !consumerSecret || !token || !tokenSecret) {
    throw new Error('Chưa cấu hình đầy đủ TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET trong .env');
  }

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...extraParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(k => `${percentEncode(k)}=${percentEncode(String(allParams[k]))}`)
    .join('&');

  const urlBase = requestUrl.split('?')[0];
  const baseString = `${method.toUpperCase()}&${percentEncode(urlBase)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;
  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');
}

/**
 * Đăng Tweet qua Cookie / Headless Browser (Miễn phí 100%, không tốn API Credits)
 */
async function publishViaCookie({ mediaType, files, fullText }) {
  const browserDataDir = path.resolve(__dirname, '../storage/twitter-browser');
  if (!fs.existsSync(browserDataDir)) {
    throw new Error('Chưa tìm thấy phiên đăng nhập X trong storage/twitter-browser. Vui lòng chạy node scripts/snap-twitter-network.js một lần.');
  }

  logger.info('Twitter', `[Cookie Mode] Đang mở phiên duyệt ngầm để đăng bài...`);
  const context = await chromium.launchPersistentContext(browserDataDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    logger.info('Twitter', `[Cookie Mode] Mở trang soạn bài...`);
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const dialog = page.locator('div[role="dialog"]').last();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });

    // 1. Nhập caption
    const editor = dialog.locator('div[data-testid="tweetTextarea_0"]');
    await editor.waitFor({ timeout: 15000 });
    await editor.click();
    await editor.fill(fullText);

    // 2. Upload video hoặc ảnh
    if (files && files.length > 0) {
      const fileInput = dialog.locator('input[data-testid="fileInput"]');
      const filesToUpload = mediaType === 'video' ? [files[0]] : files.slice(0, 4);
      logger.info('Twitter', `[Cookie Mode] Đang tải lên ${filesToUpload.length} tệp (${mediaType})...`);
      await fileInput.setInputFiles(filesToUpload);

      // Chờ video render xong
      logger.info('Twitter', `[Cookie Mode] Đang chờ Twitter xử lý media...`);
      const postBtn = dialog.locator('button[data-testid="tweetButton"]');
      await postBtn.waitFor({ state: 'visible', timeout: 60000 });

      let isReady = false;
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(2000);
        const disabled = await postBtn.isDisabled();
        if (!disabled) {
          isReady = true;
          break;
        }
      }
      if (!isReady) {
        throw new Error('Nút Post không sẵn sàng sau khi upload media.');
      }
    }

    // 3. Bấm nút Đăng và bắt GraphQL Response để lấy Tweet ID
    logger.info('Twitter', `[Cookie Mode] Đang bấm Đăng Tweet...`);
    const submitBtn = dialog.locator('button[data-testid="tweetButton"]');
    await submitBtn.waitFor({ state: 'visible', timeout: 15000 });

    let createdTweetId = null;
    const responsePromise = page.waitForResponse(
      res => res.url().includes('CreateTweet') && res.request().method() === 'POST',
      { timeout: 35000 }
    ).then(async (res) => {
      try {
        const json = await res.json();
        createdTweetId = json?.data?.create_tweet?.tweet_results?.result?.rest_id;
      } catch (_) {}
    }).catch(() => null);

    // Kích hoạt click trực tiếp qua DOM để vượt qua overlay chắn pointer của Twitter
    await page.evaluate(() => {
      const btn = document.querySelector('div[role="dialog"] button[data-testid="tweetButton"]') ||
                  document.querySelector('button[data-testid="tweetButton"]');
      if (btn) btn.click();
    });

    await responsePromise;

    // Chờ giao diện hoàn tất
    await page.waitForTimeout(4000);

    const tweetUrl = createdTweetId ? `https://x.com/3LittleBoss/status/${createdTweetId}` : 'https://x.com/3LittleBoss';
    logger.success('Twitter', `🎉 Đăng bài lên X (Twitter) qua Cookie thành công! ID: ${createdTweetId || 'N/A'}`);

    return {
      success: true,
      platform: 'X (Twitter)',
      type: mediaType,
      mode: 'cookie',
      id: createdTweetId,
      url: tweetUrl,
    };
  } finally {
    await context.close();
  }
}

/**
 * Đăng video hoặc ảnh lên X (Twitter) qua Official API (Yêu cầu có Credits)
 */
async function publishViaApi({ mediaType, files, fullText }) {
  let mediaIds = [];
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

  if (mediaType === 'video') {
    const videoPath = files[0];
    const fileSize = fs.statSync(videoPath).size;
    logger.info('Twitter', `[API Mode] Upload video (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

    // INIT
    const initParams = { command: 'INIT', total_bytes: fileSize.toString(), media_type: 'video/mp4', media_category: 'tweet_video' };
    const initAuth = buildOAuthHeader('POST', uploadUrl, initParams);
    const initRes = await axios.post(uploadUrl, new URLSearchParams(initParams).toString(), {
      headers: { Authorization: initAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });
    const mediaId = initRes.data.media_id_string;

    // APPEND
    const CHUNK_SIZE = 4 * 1024 * 1024;
    const fd = fs.openSync(videoPath, 'r');
    const buffer = Buffer.alloc(CHUNK_SIZE);
    let segmentIndex = 0;
    let bytesRead = 0;
    try {
      while ((bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, null)) > 0) {
        const form = new FormData();
        form.append('command', 'APPEND');
        form.append('media_id', mediaId);
        form.append('segment_index', segmentIndex.toString());
        form.append('media', buffer.subarray(0, bytesRead), { filename: 'blob' });
        const appendAuth = buildOAuthHeader('POST', uploadUrl);
        await axios.post(uploadUrl, form, {
          headers: { ...form.getHeaders(), Authorization: appendAuth },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 60000,
        });
        segmentIndex++;
      }
    } finally {
      fs.closeSync(fd);
    }

    // FINALIZE
    const finalizeParams = { command: 'FINALIZE', media_id: mediaId };
    const finalizeAuth = buildOAuthHeader('POST', uploadUrl, finalizeParams);
    await axios.post(uploadUrl, new URLSearchParams(finalizeParams).toString(), {
      headers: { Authorization: finalizeAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });

    mediaIds = [mediaId];
  }

  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const tweetPayload = { text: fullText };
  if (mediaIds.length > 0) {
    tweetPayload.media = { media_ids: mediaIds };
  }
  const tweetAuth = buildOAuthHeader('POST', tweetUrl);
  const tweetRes = await axios.post(tweetUrl, tweetPayload, {
    headers: { Authorization: tweetAuth, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const tweetId = tweetRes.data?.data?.id;
  logger.success('Twitter', `🎉 Đăng Tweet qua API thành công! ID: ${tweetId}`);

  return {
    success: true,
    platform: 'X (Twitter)',
    type: mediaType,
    mode: 'api',
    id: tweetId,
    url: `https://x.com/i/status/${tweetId}`,
  };
}

/**
 * Entry point: Tự động điều hướng theo TWITTER_MODE ('cookie' hoặc 'api')
 */
async function publishToTwitter({ mediaType, files, fullText }) {
  if (config.app.dryRun) {
    logger.info('Twitter', `[DRY-RUN] Giả lập đăng tải X (Twitter) (${mediaType})`);
    return {
      success: true,
      platform: 'X (Twitter)',
      type: mediaType,
      id: `simulated_x_${Date.now()}`,
      url: 'https://x.com',
      dryRun: true,
    };
  }

  const mode = config.twitter.mode || 'cookie';
  if (mode === 'api') {
    return await publishViaApi({ mediaType, files, fullText });
  } else {
    return await publishViaCookie({ mediaType, files, fullText });
  }
}

module.exports = {
  publishToTwitter,
  publishViaCookie,
  publishViaApi,
};
