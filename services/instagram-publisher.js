'use strict';

const path = require('path');
const https = require('https');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { getPublicMediaUrl } = require('./media-server');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });


/**
 * Polling kiểm tra trạng thái render của Media Container trên Instagram
 */
async function waitForContainerStatus(containerId, accessToken, apiVersion = 'v21.0', maxWaitMs = 120000) {
  const startTime = Date.now();
  const checkUrl = `https://graph.facebook.com/${apiVersion}/${containerId}?fields=status_code,status&access_token=${accessToken}`;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await axios.get(checkUrl, { httpsAgent, timeout: 15000 });
    const statusCode = res.data?.status_code;

    if (statusCode === 'FINISHED') {
      return true;
    }
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      const detail = JSON.stringify(res.data);
      throw new Error(`Instagram Container lỗi với status_code: ${statusCode} (Chi tiết: ${detail})`);
    }

    // Chờ 3 giây trước lần poll kế tiếp
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error(`Timeout chờ Instagram xử lý container ${containerId} sau ${maxWaitMs / 1000}s`);
}

/**
 * Lấy permalink chuẩn của bài đăng Instagram từ Meta Graph API
 */
async function fetchInstagramPermalink(mediaId, accessToken, apiVersion = 'v21.0') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${mediaId}?fields=permalink&access_token=${accessToken}`,
        { httpsAgent, timeout: 15000 }
      );
      if (res.data?.permalink) {
        logger.info('Instagram', `Instagram Permalink: ${res.data.permalink}`);
        return res.data.permalink;
      }
    } catch (err) {
      logger.warn('Instagram', `Lần ${attempt}: Chưa lấy được permalink (${err.message})`);
    }
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return 'https://www.instagram.com/3lilbosses/';
}

/**
 * Đăng Instagram Reels
 */
async function publishInstagramReel(jobId, videoPath, caption) {
  const userId = config.instagram.userId;
  const accessToken = config.instagram.accessToken;
  const apiVersion = config.instagram.apiVersion;
  const filename = path.basename(videoPath);
  const publicVideoUrl = getPublicMediaUrl(jobId, filename);

  logger.info('Instagram', `Bắt đầu tạo Reel Container từ URL: ${publicVideoUrl}`);

  // 1. Tạo Container
  const createRes = await axios.post(
    `https://graph.facebook.com/${apiVersion}/${userId}/media`,
    {
      media_type: 'REELS',
      video_url: publicVideoUrl,
      caption: caption,
      access_token: accessToken,
    },
    { httpsAgent, timeout: 30000 }
  );

  const containerId = createRes.data?.id;
  if (!containerId) {
    throw new Error(`Không nhận được Container ID từ Instagram: ${JSON.stringify(createRes.data)}`);
  }

  // 2. Chờ xử lý video
  logger.info('Instagram', `Container ID: ${containerId}. Đang đợi Instagram encode video...`);
  await waitForContainerStatus(containerId, accessToken, apiVersion);

  // 3. Xuất bản Reel
  const publishRes = await axios.post(
    `https://graph.facebook.com/${apiVersion}/${userId}/media_publish`,
    {
      creation_id: containerId,
      access_token: accessToken,
    },
    { httpsAgent, timeout: 30000 }
  );

  const mediaId = publishRes.data?.id;
  logger.success('Instagram', `Đăng Instagram Reel thành công! Media ID: ${mediaId}`);
  const permalink = await fetchInstagramPermalink(mediaId, accessToken, apiVersion);

  return {
    success: true,
    platform: 'Instagram',
    type: 'reel',
    id: mediaId,
    url: permalink,
  };
}

/**
 * Đăng ảnh hoặc Carousel lên Instagram
 */
async function publishInstagramPhotos(jobId, photoPaths, caption) {
  const userId = config.instagram.userId;
  const accessToken = config.instagram.accessToken;
  const apiVersion = config.instagram.apiVersion;

  // Trường hợp 1: Ảnh đơn
  if (photoPaths.length === 1) {
    const filename = path.basename(photoPaths[0]);
    const publicImageUrl = getPublicMediaUrl(jobId, filename);

    logger.info('Instagram', `Đăng 1 ảnh từ URL: ${publicImageUrl}`);
    const createRes = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${userId}/media`,
      {
        image_url: publicImageUrl,
        caption: caption,
        access_token: accessToken,
      },
      { httpsAgent, timeout: 30000 }
    );

    const containerId = createRes.data?.id;
    await waitForContainerStatus(containerId, accessToken, apiVersion, 30000);

    const pubRes = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${userId}/media_publish`,
      {
        creation_id: containerId,
        access_token: accessToken,
      },
      { httpsAgent, timeout: 30000 }
    );

    const mediaId = pubRes.data?.id;
    logger.success('Instagram', `Đăng ảnh Instagram thành công! ID: ${mediaId}`);
    const permalink = await fetchInstagramPermalink(mediaId, accessToken, apiVersion);
    return {
      success: true,
      platform: 'Instagram',
      type: 'photo',
      id: mediaId,
      url: permalink,
    };
  }

  // Trường hợp 2: Carousel (nhiều ảnh)
  logger.info('Instagram', `Đang tạo Carousel gồm ${photoPaths.length} ảnh...`);
  const itemContainerIds = [];

  for (const photoPath of photoPaths) {
    const filename = path.basename(photoPath);
    const itemUrl = getPublicMediaUrl(jobId, filename);

    const itemRes = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${userId}/media`,
      {
        is_carousel_item: true,
        image_url: itemUrl,
        access_token: accessToken,
      },
      { httpsAgent, timeout: 30000 }
    );
    if (itemRes.data?.id) {
      itemContainerIds.push(itemRes.data.id);
    }
  }

  // Tạo Carousel container tổng
  const carouselRes = await axios.post(
    `https://graph.facebook.com/${apiVersion}/${userId}/media`,
    {
      media_type: 'CAROUSEL',
      children: itemContainerIds.join(','),
      caption: caption,
      access_token: accessToken,
    },
    { httpsAgent, timeout: 30000 }
  );

  const carouselContainerId = carouselRes.data?.id;
  await waitForContainerStatus(carouselContainerId, accessToken, apiVersion, 60000);

  // Xuất bản Carousel
  const pubRes = await axios.post(
    `https://graph.facebook.com/${apiVersion}/${userId}/media_publish`,
    {
      creation_id: carouselContainerId,
      access_token: accessToken,
    },
    { httpsAgent, timeout: 30000 }
  );

  const mediaId = pubRes.data?.id;
  logger.success('Instagram', `Đăng Carousel Instagram thành công! ID: ${mediaId}`);
  const permalink = await fetchInstagramPermalink(mediaId, accessToken, apiVersion);
  return {
    success: true,
    platform: 'Instagram',
    type: 'carousel',
    id: mediaId,
    url: permalink,
  };
}

/**
 * Entry point cho Instagram Publisher
 */
async function publishToInstagram({ jobId, mediaType, files, fullText }) {
  if (config.app.dryRun) {
    logger.info('Instagram', `[DRY-RUN] Giả lập đăng tải Instagram (${mediaType})`);
    return {
      success: true,
      platform: 'Instagram',
      type: mediaType,
      id: `simulated_ig_${Date.now()}`,
      url: 'https://instagram.com',
      dryRun: true,
    };
  }

  // Xuất bản qua Meta Graph API chính thức
  logger.info('Instagram', 'Đang xuất bản qua Meta Graph API...');
  if (!config.instagram.userId || !config.instagram.accessToken) {
    throw new Error('Chưa cấu hình IG_USER_ID hoặc IG_ACCESS_TOKEN (hoặc FB_PAGE_ACCESS_TOKEN) trong .env');
  }

  if (mediaType === 'video') {
    return await publishInstagramReel(jobId, files[0], fullText);
  } else {
    return await publishInstagramPhotos(jobId, files, fullText);
  }
}


module.exports = {
  publishToInstagram,
  publishInstagramReel,
  publishInstagramPhotos,
};
