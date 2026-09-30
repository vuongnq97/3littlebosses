'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const { cleanJobDir } = require('../utils/file-helper');

const { publishToFacebook } = require('./facebook-publisher');
const { publishToInstagram } = require('./instagram-publisher');
const { publishToThreads } = require('./threads-publisher');
const { publishToYouTube } = require('./youtube-publisher');
const { publishToTikTok } = require('./tiktok-publisher');
const { publishToTwitter } = require('./twitter-publisher');

/**
 * Điều phối đăng tải đa nền tảng đồng thời
 *
 * @param {object} jobData
 * @param {string} jobData.jobId
 * @param {'video'|'images'} jobData.mediaType
 * @param {string[]} jobData.files
 * @param {string} jobData.caption
 * @param {string[]} jobData.hashtags
 * @param {string} jobData.fullText
 * @param {function} [onProgress] Callback cập nhật tiến độ cho Telegram Bot
 */
async function publishMultiPlatform(jobData, onProgress = () => {}) {
  const { jobId, mediaType, files, caption, hashtags, fullText } = jobData;
  logger.divider();
  logger.info('MultiPublisher', `Bắt đầu xuất bản đa nền tảng cho ${jobId} (${mediaType.toUpperCase()})`);
  logger.info('MultiPublisher', `Nội dung: "${caption.substring(0, 60)}..."`);
  logger.divider();

  const tasks = [];

  // 1. Facebook Fanpage
  if (config.facebook.enabled) {
    tasks.push({
      name: 'Facebook Fanpage',
      key: 'facebook',
      runner: () => publishToFacebook(jobData),
    });
  }

  // 2. Instagram
  if (config.instagram.enabled) {
    tasks.push({
      name: 'Instagram',
      key: 'instagram',
      runner: () => publishToInstagram(jobData),
    });
  }

  // 3. Threads
  if (config.threads.enabled) {
    tasks.push({
      name: 'Threads',
      key: 'threads',
      runner: () => publishToThreads(jobData),
    });
  }

  // 4. YouTube
  if (config.youtube.enabled) {
    tasks.push({
      name: 'YouTube',
      key: 'youtube',
      runner: () => publishToYouTube(jobData),
    });
  }

  // 5. TikTok
  if (config.tiktok.enabled) {
    tasks.push({
      name: 'TikTok',
      key: 'tiktok',
      runner: () => publishToTikTok(jobData),
    });
  }

  // 6. X (Twitter)
  if (config.twitter.enabled) {
    tasks.push({
      name: 'X (Twitter)',
      key: 'twitter',
      runner: () => publishToTwitter(jobData),
    });
  }

  if (tasks.length === 0) {
    logger.warn('MultiPublisher', 'Không có nền tảng nào được kích hoạt trong cấu hình .env');
    return {
      success: false,
      jobId,
      results: [],
      error: 'Tất cả các nền tảng đều đang bị tắt (ENABLE_* = false)',
    };
  }

  // Báo cáo trạng thái ban đầu
  for (const t of tasks) {
    onProgress({
      platform: t.name,
      key: t.key,
      status: 'PENDING',
      message: 'Đang xếp hàng...',
    });
  }

  // Thực thi song song (Parallel execution)
  const taskPromises = tasks.map(async (t) => {
    onProgress({
      platform: t.name,
      key: t.key,
      status: 'RUNNING',
      message: 'Đang upload...',
    });

    try {
      const res = await t.runner();
      if (res.skipped) {
        onProgress({
          platform: t.name,
          key: t.key,
          status: 'SKIPPED',
          message: res.message || 'Đã bỏ qua',
        });
        return { platform: t.name, key: t.key, status: 'SKIPPED', ...res };
      }

      onProgress({
        platform: t.name,
        key: t.key,
        status: 'SUCCESS',
        url: res.url,
        id: res.id,
        message: 'Thành công!',
      });
      return { platform: t.name, key: t.key, status: 'SUCCESS', ...res };
    } catch (err) {
      const errMsg = err.message || 'Lỗi không xác định';
      logger.error('MultiPublisher', `Thất bại tại [${t.name}]: ${errMsg}`);
      onProgress({
        platform: t.name,
        key: t.key,
        status: 'FAILED',
        error: errMsg,
        message: `Lỗi: ${errMsg}`,
      });
      return { platform: t.name, key: t.key, status: 'FAILED', error: errMsg };
    }
  });

  const settled = await Promise.all(taskPromises);

  // Dọn dẹp file tạm nếu cấu hình autoCleanup
  if (config.app.autoCleanup) {
    const timer = setTimeout(() => {
      logger.info('MultiPublisher', `Tự động dọn dẹp thư mục tạm cho ${jobId}`);
      cleanJobDir(jobId);
    }, 60000); // Giữ 1 phút cho các luồng async nếu có trước khi dọn
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }


  const successCount = settled.filter(r => r.status === 'SUCCESS').length;
  logger.divider();
  logger.info('MultiPublisher', `Hoàn thành xuất bản: ${successCount}/${settled.length} thành công.`);
  logger.divider();

  return {
    success: successCount > 0,
    jobId,
    total: settled.length,
    successCount,
    results: settled,
  };
}

module.exports = {
  publishMultiPlatform,
};
