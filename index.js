'use strict';

// Xử lý TLS cho môi trường macOS & proxy nội bộ
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { startMediaServer, stopMediaServer } = require('./services/media-server');
const { startTelegramPolling, stopTelegramPolling } = require('./services/telegram-bot');
const { verifyMetaAccess } = require('./services/meta-checker');

// Kiểm tra cờ CLI
const args = process.argv.slice(2);
if (args.includes('--dry-run')) {
  config.app.dryRun = true;
}

function printBanner() {
  console.log(`
\x1b[36m   ██████╗ ██╗     ██╗████████╗████████╗██╗     ███████╗██████╗  ██████╗ ███████╗███████╗███████╗
  ╚════██╗██║     ██║╚══██╔══╝╚══██╔══╝██║     ██╔════╝██╔══██╗██╔═══██╗██╔════╝██╔════╝██╔════╝
   █████╔╝██║     ██║   ██║      ██║   ██║     █████╗  ██████╔╝██║   ██║███████╗███████╗███████╗
   ╚═══██╗██║     ██║   ██║      ██║   ██║     ██╔══╝  ██╔══██╗██║   ██║╚════██║╚════██║╚════██║
  ██████╔╝███████╗██║   ██║      ██║   ███████╗███████╗██████╔╝╚██████╔╝███████║███████║███████║
  ╚═════╝ ╚══════╝╚═╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝╚══════╝╚══════╝\x1b[0m
  \x1b[1m🚀 Multi-Platform Auto Publisher (Telegram Bot Hub)\x1b[0m
  ------------------------------------------------------------
  • Facebook Fanpage: ${config.facebook.enabled ? '🟢 Bật' : '⚪ Tắt'}
  • Instagram:        ${config.instagram.enabled ? '🟢 Bật' : '⚪ Tắt'}
  • Threads:          ${config.threads.enabled ? '🟢 Bật' : '⚪ Tắt'}
  • YouTube:          ${config.youtube.enabled ? '🟢 Bật' : '⚪ Tắt'}
  • TikTok (n8n):     ${config.tiktok.enabled ? '🟢 Bật' : '⚪ Tắt'}
  • X (Twitter):      ${config.twitter.enabled ? '🟢 Bật' : '⚪ Tắt'}
  • Chế độ:           ${config.app.dryRun ? '🟡 DRY-RUN' : '🟢 LIVE'}
  ------------------------------------------------------------
  `);
}

async function bootstrap() {
  printBanner();

  // 1. Khởi chạy Media Server tĩnh (cung cấp URL công khai cho Meta & Threads)
  try {
    await startMediaServer();
  } catch (err) {
    logger.error('App', `Không thể khởi chạy Media Server: ${err.message}`);
  }

  // 2. Kiểm tra nhanh trạng thái Meta API Tokens
  verifyMetaAccess().catch(() => {});

  // 2. Kiểm tra nếu chạy chế độ test
  if (args.includes('--test')) {
    logger.info('Test', 'Đang chạy kiểm tra cú pháp và nạp modules...');
    logger.success('Test', 'Tất cả modules và cấu hình đã tải thành công!');
    process.exit(0);
  }

  // 3. Khởi chạy Telegram Bot Long Polling
  if (config.telegram.botToken) {
    startTelegramPolling().catch(err => {
      logger.error('Telegram', `Lỗi nghiêm trọng trong Telegram polling: ${err.message}`);
    });
  } else {
    logger.warn('App', 'TELEGRAM_BOT_TOKEN đang để trống trong .env.');
    logger.info('App', 'Vui lòng điền TELEGRAM_BOT_TOKEN vào file .env để kích hoạt nhận video/ảnh.');
  }
}

// Xử lý dừng server an toàn
function shutdown(signal) {
  logger.info('App', `Nhận tín hiệu ${signal}. Đang đóng các tiến trình...`);
  stopTelegramPolling();
  stopMediaServer();
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch(err => {
  logger.error('App', `Khởi động thất bại: ${err.stack || err.message}`);
  process.exit(1);
});
