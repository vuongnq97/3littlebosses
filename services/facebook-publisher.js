'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const logger = require('../utils/logger');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Tự động tìm Page Access Token nếu token truyền vào là User Token
 */
async function resolvePageToken(pageId, token, apiVersion = 'v21.0') {
  try {
    const meRes = await axios.get(`https://graph.facebook.com/${apiVersion}/me?access_token=${token}`, { httpsAgent });
    if (meRes.data?.id === pageId) {
      return token;
    }
    const accRes = await axios.get(`https://graph.facebook.com/${apiVersion}/me/accounts?access_token=${token}`, { httpsAgent });
    const match = accRes.data?.data?.find(p => p.id === pageId);
    if (match?.access_token) {
      logger.info('Facebook', `Đã tự động lấy Page Token cho Page: ${match.name} (${pageId})`);
      return match.access_token;
    }
  } catch (_) {}
  return token;
}

/**
 * Đăng video lên Facebook Reels qua Meta RUplink
 */

async function publishVideoReel(videoPath, caption, options = {}) {
  const pageId = options.pageId || config.facebook.pageId;
  let accessToken = options.accessToken || config.facebook.accessToken;
  const apiVersion = config.facebook.apiVersion || 'v21.0';

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file không tồn tại: ${videoPath}`);
  }

  const fileSize = fs.statSync(videoPath).size;
  accessToken = await resolvePageToken(pageId, accessToken, apiVersion);
  const graphBaseUrl = `https://graph.facebook.com/${apiVersion}`;

  logger.info('Facebook', `Bắt đầu upload Reel: ${path.basename(videoPath)} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

  // Bước 1: Khởi tạo upload session
  const initRes = await axios.post(
    `${graphBaseUrl}/${pageId}/video_reels`,
    {
      upload_phase: 'start',
      access_token: accessToken,
    },
    { timeout: 30000, httpsAgent }
  );

  const videoId = initRes.data?.video_id;
  const uploadUrl = initRes.data?.upload_url;

  if (!videoId || !uploadUrl) {
    throw new Error(`Không thể khởi tạo Facebook Reel session: ${JSON.stringify(initRes.data)}`);
  }

  // Bước 2: Upload dữ liệu nhị phân lên RUplink
  const fileBuffer = fs.readFileSync(videoPath);
  await axios.post(uploadUrl, fileBuffer, {
    headers: {
      'Authorization': `OAuth ${accessToken}`,
      'offset': '0',
      'file_size': String(fileSize),
      'Content-Type': 'application/octet-stream',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 180000,
    httpsAgent,
  });

  // Bước 3: Hoàn tất và xuất bản Reel
  const finishRes = await axios.post(
    `${graphBaseUrl}/${pageId}/video_reels`,
    {
      upload_phase: 'finish',
      access_token: accessToken,
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: caption,
    },
    { timeout: 30000, httpsAgent }
  );

  const postId = finishRes.data?.post_id || videoId;
  logger.success('Facebook', `Đăng Reel thành công! Video ID: ${videoId} | Post ID: ${postId}`);

  return {
    success: true,
    platform: 'Facebook Fanpage',
    type: 'reel',
    id: videoId,
    postId,
    url: `https://www.facebook.com/reel/${videoId}`,
  };
}

/**
 * Đăng ảnh hoặc album ảnh lên Facebook Fanpage
 */
async function publishPhotos(photoPaths, caption, options = {}) {
  const pageId = options.pageId || config.facebook.pageId;
  let accessToken = options.accessToken || config.facebook.accessToken;
  const apiVersion = config.facebook.apiVersion || 'v21.0';

  accessToken = await resolvePageToken(pageId, accessToken, apiVersion);
  const graphBaseUrl = `https://graph.facebook.com/${apiVersion}`;

  if (!photoPaths || photoPaths.length === 0) {
    throw new Error('Danh sách ảnh trống');
  }

  // Nếu chỉ có 1 ảnh: Đăng trực tiếp vào /{pageId}/photos
  if (photoPaths.length === 1) {
    const photoPath = photoPaths[0];
    const form = new FormData();
    form.append('source', fs.createReadStream(photoPath));
    form.append('caption', caption);
    form.append('access_token', accessToken);

    const res = await axios.post(`${graphBaseUrl}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      httpsAgent,
    });

    const photoId = res.data?.id || res.data?.post_id;
    logger.success('Facebook', `Đăng 1 ảnh thành công! Photo ID: ${photoId}`);

    return {
      success: true,
      platform: 'Facebook Fanpage',
      type: 'photo',
      id: photoId,
      url: `https://www.facebook.com/${photoId}`,
    };
  }

  // Nếu có nhiều ảnh: Upload từng ảnh với published: false, sau đó ghép vào 1 post feed
  logger.info('Facebook', `Đang upload ${photoPaths.length} ảnh cho album...`);
  const mediaFbids = [];

  for (let i = 0; i < photoPaths.length; i++) {
    const photoPath = photoPaths[i];
    const form = new FormData();
    form.append('source', fs.createReadStream(photoPath));
    form.append('published', 'false');
    form.append('access_token', accessToken);

    const uploadRes = await axios.post(`${graphBaseUrl}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      httpsAgent,
    });

    if (uploadRes.data?.id) {
      mediaFbids.push({ media_fbid: uploadRes.data.id });
    }
  }

  // Đăng post hoàn chỉnh kèm danh sách ảnh đính kèm
  const feedRes = await axios.post(
    `${graphBaseUrl}/${pageId}/feed`,
    {
      message: caption,
      attached_media: mediaFbids,
      access_token: accessToken,
    },
    { timeout: 30000, httpsAgent }
  );

  const postId = feedRes.data?.id;
  logger.success('Facebook', `Đăng album ${mediaFbids.length} ảnh thành công! Post ID: ${postId}`);

  return {
    success: true,
    platform: 'Facebook Fanpage',
    type: 'album',
    id: postId,
    url: `https://www.facebook.com/${postId}`,
  };
}

/**
 * Entry point cho Facebook Publisher
 */
async function publishToFacebook({ mediaType, files, fullText, options = {} }) {
  if (config.app.dryRun) {
    logger.info('Facebook', `[DRY-RUN] Giả lập đăng tải Facebook (${mediaType})`);
    return {
      success: true,
      platform: 'Facebook Fanpage',
      type: mediaType,
      id: `simulated_fb_${Date.now()}`,
      url: 'https://facebook.com',
      dryRun: true,
    };
  }

  if (!config.facebook.pageId || !config.facebook.accessToken) {
    throw new Error('Chưa cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN trong .env');
  }

  if (mediaType === 'video') {
    return await publishVideoReel(files[0], fullText, options);
  } else {
    return await publishPhotos(files, fullText, options);
  }
}

module.exports = {
  publishToFacebook,
  publishVideoReel,
  publishPhotos,
};
