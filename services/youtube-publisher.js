'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Lấy Access Token mới từ Refresh Token
 */
async function getAccessToken() {
  const { clientId, clientSecret, refreshToken } = config.youtube;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Chưa cấu hình YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET hoặc YOUTUBE_REFRESH_TOKEN trong .env');
  }

  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    { timeout: 15000 }
  );

  return res.data.access_token;
}

/**
 * Đăng video lên YouTube (tự động nhận diện Shorts nếu video ngắn)
 */
async function publishToYouTube({ mediaType, files, caption, hashtags, fullText }) {
  if (config.app.dryRun) {
    logger.info('YouTube', `[DRY-RUN] Giả lập đăng tải YouTube (${mediaType})`);
    return {
      success: true,
      platform: 'YouTube',
      type: mediaType,
      id: `simulated_yt_${Date.now()}`,
      url: 'https://youtube.com',
      dryRun: true,
    };
  }

  // YouTube chỉ hỗ trợ Video
  if (mediaType !== 'video') {
    logger.warn('YouTube', 'Bỏ qua: YouTube chỉ hỗ trợ tải lên tệp Video.');
    return {
      success: true,
      skipped: true,
      platform: 'YouTube',
      message: 'Đã bỏ qua (YouTube không hỗ trợ bài đăng chỉ có hình ảnh)',
    };
  }

  const videoPath = files[0];
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video không tồn tại: ${videoPath}`);
  }

  const accessToken = await getAccessToken();

  // Đảm bảo có thẻ #Shorts cho video ngắn
  let title = caption || '3 Little Bosses';
  if (!title.toLowerCase().includes('#shorts')) {
    title = `${title} #Shorts`;
  }
  // Giới hạn độ dài title YouTube (tối đa 100 ký tự)
  if (title.length > 100) {
    title = title.substring(0, 96) + '...';
  }

  const cleanTags = (hashtags || []).map(h => h.replace(/^#/, ''));
  if (!cleanTags.includes('Shorts')) cleanTags.push('Shorts');

  const fileSize = fs.statSync(videoPath).size;
  logger.info('YouTube', `Bắt đầu upload video (${(fileSize / 1024 / 1024).toFixed(2)} MB): "${title}"`);

  // 1. Khởi tạo phiên tải lên có thể tiếp tục (Resumable Upload)
  const initRes = await axios.post(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      snippet: {
        title,
        description: fullText || title,
        tags: cleanTags,
        categoryId: '15', // Pets & Animals
      },
      status: {
        privacyStatus: config.youtube.privacyStatus || 'public',
        selfDeclaredMadeForKids: false,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': fileSize,
        'X-Upload-Content-Type': 'video/mp4',
      },
      timeout: 30000,
    }
  );

  const uploadUrl = initRes.headers['location'];
  if (!uploadUrl) {
    throw new Error('Không nhận được upload URL từ YouTube API');
  }

  // 2. Stream dữ liệu video lên YouTube
  logger.info('YouTube', `Đang tải luồng dữ liệu video lên YouTube...`);
  const fileStream = fs.createReadStream(videoPath);
  const uploadRes = await axios.put(uploadUrl, fileStream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 300000,
  });

  const videoId = uploadRes.data?.id;
  logger.success('YouTube', `Đăng YouTube Shorts thành công! Video ID: ${videoId}`);

  return {
    success: true,
    platform: 'YouTube',
    type: 'video',
    id: videoId,
    url: `https://youtu.be/${videoId}`,
  };
}

module.exports = {
  publishToYouTube,
};
