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
  const { jobId, mediaType, files, caption, hashtags, fullText, targetPlatforms } = jobData;
  logger.divider();
  const targetLabel = Array.isArray(targetPlatforms) && targetPlatforms.length > 0
    ? `[CHỈ ĐĂNG LẠI: ${targetPlatforms.join(', ')}]`
    : '[TẤT CẢ KÊNH]';
  logger.info('MultiPublisher', `Bắt đầu xuất bản đa nền tảng cho ${jobId} (${mediaType.toUpperCase()}) ${targetLabel}`);
  logger.info('MultiPublisher', `Nội dung: "${caption.substring(0, 60)}..."`);
  logger.divider();

  const allTasks = [];

  // 1. Facebook Fanpage
  if (config.facebook.enabled) {
    allTasks.push({
      name: 'Facebook Fanpage',
      key: 'facebook',
      runner: () => publishToFacebook(jobData),
    });
  }

  // 2. Instagram
  if (config.instagram.enabled) {
    allTasks.push({
      name: 'Instagram',
      key: 'instagram',
      runner: () => publishToInstagram(jobData),
    });
  }

  // 3. Threads
  if (config.threads.enabled) {
    allTasks.push({
      name: 'Threads',
      key: 'threads',
      runner: () => publishToThreads(jobData),
    });
  }

  // 4. YouTube
  if (config.youtube.enabled) {
    allTasks.push({
      name: 'YouTube',
      key: 'youtube',
      runner: () => publishToYouTube(jobData),
    });
  }

  // 5. TikTok
  if (config.tiktok.enabled) {
    allTasks.push({
      name: 'TikTok',
      key: 'tiktok',
      runner: () => publishToTikTok(jobData),
    });
  }

  // 6. X (Twitter)
  if (config.twitter.enabled) {
    allTasks.push({
      name: 'X (Twitter)',
      key: 'twitter',
      runner: () => publishToTwitter(jobData),
    });
  }

  // Lọc chỉ chạy các nền tảng được chỉ định (nếu có yêu cầu retry cụ thể)
  const tasks = (Array.isArray(targetPlatforms) && targetPlatforms.length > 0)
    ? allTasks.filter(t => targetPlatforms.includes(t.key))
    : allTasks;

  if (tasks.length === 0) {
    logger.warn('MultiPublisher', 'Không có nền tảng nào được kích hoạt hoặc thoả điều kiện lọc trong .env');
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
      let apiDetail = null;
      if (err.response?.data) {
        const d = err.response.data;
        if (d.error?.message) {
          apiDetail = d.error.message;
          if (d.error.error_subcode) {
            apiDetail += ` [subcode: ${d.error.error_subcode}]`;
          }
        } else if (d.error_message) {
          apiDetail = d.error_message;
        } else if (typeof d === 'string') {
          apiDetail = d;
        } else {
          apiDetail = JSON.stringify(d);
        }
      }
      const errMsg = apiDetail ? `${err.message} (${apiDetail})` : (err.message || 'Lỗi không xác định');
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

  // Dọn dẹp file tạm: Nếu thành công toàn bộ -> dọn sau 60s. Nếu còn lỗi -> GIỮ LẠI để user bấm Retry!
  const successCount = settled.filter(r => r.status === 'SUCCESS').length;
  const failedCount = settled.filter(r => r.status === 'FAILED').length;
  const allSuccess = settled.length > 0 && failedCount === 0;

  if (config.app.autoCleanup && allSuccess) {
    const timer = setTimeout(() => {
      logger.info('MultiPublisher', `Tất cả kênh thành công. Tự động dọn dẹp thư mục tạm cho ${jobId}`);
      cleanJobDir(jobId);
    }, 60000);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  } else if (failedCount > 0) {
    logger.info('MultiPublisher', `Còn ${failedCount} kênh thất bại. Đang giữ lại file tạm để hỗ trợ Retry từ Telegram.`);
  }

  logger.divider();
  logger.info('MultiPublisher', `Hoàn thành xuất bản: ${successCount}/${settled.length} thành công.`);
  logger.divider();

  return {
    success: allSuccess,
    jobId,
    total: settled.length,
    successCount,
    failedCount,
    results: settled,
  };
}

module.exports = {
  publishMultiPlatform,
};
