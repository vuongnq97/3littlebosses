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
      platform: 'TikTok',
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
      platform: 'TikTok',
      message: 'Đã bỏ qua (TikTok không hỗ trợ bài đăng chỉ có hình ảnh)',
    };
  }

  const webhookUrl = config.tiktok.webhookUrl;
  if (!webhookUrl) {
    throw new Error('Chưa cấu hình N8N_TIKTOK_WEBHOOK_URL trong .env');
  }

  const filename = path.basename(files[0]);
  const port = config.mediaServer.port || 3005;
  // Ưu tiên n8n tải qua bridge nội bộ host.docker.internal để không phụ thuộc internet tunnel
  const videoUrl = `http://host.docker.internal:${port}/media/${jobId}/${filename}`;

  logger.info('TikTok', `Gửi tín hiệu webhook sang n8n: ${webhookUrl}`);

  // TikTok tối đa 5 hashtags đầu tiên, caption phải xuống dòng (enter) rồi mới tới hashtags
  const tiktokTags = (Array.isArray(hashtags) && hashtags.length > 0)
    ? hashtags.slice(0, 5)
    : ['#3LilBosses', '#ThreeLittleBosses', '#Cats', '#CatLife', '#CatLovers'];

  const pureCaption = String(caption || '').trim();
  const tiktokCaption = pureCaption
    ? `${pureCaption}\n\n${tiktokTags.join(' ')}`
    : tiktokTags.join(' ');

  logger.info('TikTok', `Caption gửi TikTok (5 tags): ${pureCaption ? `"${pureCaption}" + ` : ''}[${tiktokTags.join(', ')}]`);

  const payload = {
    route: 'command',
    command: 'upload',
    targetJobId: jobId,
    videoUrl: videoUrl,
    publicVideoUrl: getPublicMediaUrl(jobId, filename),
    videoPath: files[0],
    caption: tiktokCaption,
    hashtags: tiktokTags,
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
      || 'https://www.tiktok.com/@3lilbosses';

    return {
      success: true,
      platform: 'TikTok',
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
