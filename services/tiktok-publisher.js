'use strict';

const path = require('path');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { getPublicMediaUrl } = require('./media-server');

/**
 * Đăng video TikTok thông qua n8n Webhook / Community Node (tái sử dụng kiến trúc n8n sẵn có)
 */
async function publishToTikTok({ jobId, mediaType, files, fullText, caption, hashtags }) {
  if (config.app.dryRun) {
    logger.info('TikTok', `[DRY-RUN] Giả lập kích hoạt n8n TikTok Upload (${mediaType})`);
    return {
      success: true,
      platform: 'TikTok (via n8n)',
      type: mediaType,
      id: `simulated_tiktok_${Date.now()}`,
      url: 'https://tiktok.com',
      dryRun: true,
    };
  }

  // TikTok chỉ hỗ trợ Video
  if (mediaType !== 'video') {
    logger.warn('TikTok', 'Bỏ qua: TikTok chỉ hỗ trợ video ngắn.');
    return {
      success: true,
      skipped: true,
      platform: 'TikTok (via n8n)',
      message: 'Đã bỏ qua (TikTok không hỗ trợ bài đăng chỉ có hình ảnh)',
    };
  }

  const webhookUrl = config.tiktok.webhookUrl;
  if (!webhookUrl) {
    throw new Error('Chưa cấu hình N8N_TIKTOK_WEBHOOK_URL trong .env');
  }

  const filename = path.basename(files[0]);
  const publicVideoUrl = getPublicMediaUrl(jobId, filename);

  logger.info('TikTok', `Gửi tín hiệu webhook sang n8n: ${webhookUrl}`);

  // Caption đầy đủ kèm hashtags từ Telegram
  const combinedCaption = fullText || [caption, ...(Array.isArray(hashtags) ? hashtags : [])].filter(Boolean).join(' ');

  const payload = {
    route: 'command',
    command: 'upload',
    targetJobId: jobId,
    videoUrl: publicVideoUrl,
    videoPath: files[0],
    caption: combinedCaption,
    hashtags: hashtags || [],
    tiktokCredentialId: config.tiktok.credentialId,
    timestamp: Date.now(),
  };

  try {
    const res = await axios.post(webhookUrl, payload, { timeout: 30000 });
    logger.success('TikTok', `Webhook n8n TikTok đã kích hoạt thành công!`);
    const tiktokUrl = res.data?.data?.share_url 
      || res.data?.data?.url 
      || res.data?.data?.post_url
      || res.data?.share_url
      || config.tiktok.channelUrl
      || 'https://www.tiktok.com/@three_littlebosses';

    return {
      success: true,
      platform: 'TikTok (via n8n)',
      type: 'video',
      id: jobId,
      data: res.data,
      url: tiktokUrl,
    };
  } catch (err) {
    // Nếu n8n không phản hồi hoặc offline
    logger.error('TikTok', `Lỗi khi gọi n8n TikTok Webhook: ${err.message}`);
    throw new Error(`n8n TikTok Webhook error: ${err.message}`);
  }
}

module.exports = {
  publishToTikTok,
};
