'use strict';

const path = require('path');
const https = require('https');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { getPublicMediaUrl } = require('./media-server');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Polling kiểm tra trạng thái render của Media Container trên Threads
 */
async function waitForThreadsStatus(containerId, accessToken, maxWaitMs = 120000) {
  const startTime = Date.now();
  const checkUrl = `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${accessToken}`;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await axios.get(checkUrl, { httpsAgent, timeout: 15000 });
    const status = res.data?.status;

    if (status === 'FINISHED') {
      return true;
    }
    if (status === 'ERROR') {
      const detail = JSON.stringify(res.data);
      throw new Error(`Threads Container lỗi: ${res.data?.error_message || 'Unknown error'} (Chi tiết: ${detail})`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error(`Timeout chờ Threads xử lý container ${containerId}`);
}

/**
 * Đăng video hoặc ảnh lên Threads
 */
async function publishToThreads({ jobId, mediaType, files, fullText }) {
  if (config.app.dryRun) {
    logger.info('Threads', `[DRY-RUN] Giả lập đăng tải Threads (${mediaType})`);
    return {
      success: true,
      platform: 'Threads',
      type: mediaType,
      id: `simulated_threads_${Date.now()}`,
      url: 'https://threads.net',
      dryRun: true,
    };
  }

  const userId = config.threads.userId;
  const accessToken = config.threads.accessToken;

  if (!userId || !accessToken) {
    throw new Error('Chưa cấu hình THREADS_USER_ID hoặc THREADS_ACCESS_TOKEN trong .env');
  }

  const filename = path.basename(files[0]);
  const publicUrl = getPublicMediaUrl(jobId, filename);

  const payload = {
    text: fullText,
    access_token: accessToken,
  };

  if (mediaType === 'video') {
    payload.media_type = 'VIDEO';
    payload.video_url = publicUrl;
  } else {
    payload.media_type = 'IMAGE';
    payload.image_url = publicUrl;
  }

  logger.info('Threads', `Tạo Threads container từ: ${publicUrl}`);

  // 1. Tạo container
  const createRes = await axios.post(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    payload,
    { httpsAgent, timeout: 30000 }
  );

  const containerId = createRes.data?.id;
  if (!containerId) {
    throw new Error(`Không nhận được Container ID từ Threads: ${JSON.stringify(createRes.data)}`);
  }

  // 2. Chờ xử lý video (nếu là video)
  if (mediaType === 'video') {
    logger.info('Threads', `Đang chờ Threads render video...`);
    await waitForThreadsStatus(containerId, accessToken);
  }

  // 3. Publish container
  const pubRes = await axios.post(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    {
      creation_id: containerId,
      access_token: accessToken,
    },
    { httpsAgent, timeout: 30000 }
  );

  const threadId = pubRes.data?.id;
  logger.success('Threads', `Đăng bài lên Threads thành công! ID: ${threadId}`);

  // Lấy permalink chuẩn của bài đăng Threads (dạng https://www.threads.net/@user/post/xxx)
  let threadUrl = 'https://www.threads.net/@3lilbosses';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const detailRes = await axios.get(
        `https://graph.threads.net/v1.0/${threadId}?fields=permalink&access_token=${accessToken}`,
        { httpsAgent, timeout: 15000 }
      );
      if (detailRes.data?.permalink) {
        threadUrl = detailRes.data.permalink;
        logger.info('Threads', `Threads Permalink: ${threadUrl}`);
        break;
      }
    } catch (err) {
      logger.warn('Threads', `Lần ${attempt}: Chưa lấy được Threads permalink (${err.message})`);
    }
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return {
    success: true,
    platform: 'Threads',
    type: mediaType,
    id: threadId,
    url: threadUrl,
  };
}

module.exports = {
  publishToThreads,
};
