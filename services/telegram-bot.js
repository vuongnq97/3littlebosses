'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const sessionStore = require('./session-store');
const { publishMultiPlatform } = require('./multi-publisher');
const {
  generateJobId,
  getJobDir,
  isVideoFile,
  parseCaptionAndHashtags,
  cleanJobDir,
} = require('../utils/file-helper');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const tgHttp = axios.create({ httpsAgent, timeout: 60000 });

let isPolling = false;
let pollingOffset = 0;

function getBotUrl() {
  const token = config.telegram.botToken;
  if (!token) return null;
  return `https://api.telegram.org/bot${token}`;
}

async function sendTelegramMessage(chatId, text, options = {}) {
  const botUrl = getBotUrl();
  if (!botUrl) return null;

  try {
    const res = await tgHttp.post(`${botUrl}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: options.parse_mode || 'HTML',
      disable_web_page_preview: true,
      ...options,
    });
    return res.data?.result?.message_id || null;
  } catch (err) {
    logger.error('Telegram', `Lỗi sendMessage (${chatId}): ${err.response?.data?.description || err.message}`);
    return null;
  }
}

async function editTelegramMessage(chatId, messageId, text, options = {}) {
  const botUrl = getBotUrl();
  if (!botUrl || !messageId) return false;

  try {
    await tgHttp.post(`${botUrl}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parse_mode || 'HTML',
      disable_web_page_preview: true,
      ...options,
    });
    return true;
  } catch (err) {
    // Bỏ qua lỗi "message is not modified"
    if (err.response?.data?.description?.includes('message is not modified')) {
      return true;
    }
    logger.warn('Telegram', `Lỗi editMessageText (${messageId}): ${err.response?.data?.description || err.message}`);
    return false;
  }
}

async function downloadTelegramFile(fileId, destinationPath) {
  const botUrl = getBotUrl();
  const token = config.telegram.botToken;

  // 1. Lấy filePath từ Telegram
  const infoRes = await tgHttp.get(`${botUrl}/getFile`, { params: { file_id: fileId } });
  if (!infoRes.data?.ok) {
    throw new Error(`Telegram getFile thất bại: ${JSON.stringify(infoRes.data)}`);
  }

  const remoteFilePath = infoRes.data.result.file_path;
  const fileDownloadUrl = `https://api.telegram.org/file/bot${token}/${remoteFilePath}`;

  // 2. Tải binary stream về đĩa
  const writer = fs.createWriteStream(destinationPath);
  const response = await axios({
    url: fileDownloadUrl,
    method: 'GET',
    responseType: 'stream',
    httpsAgent,
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(destinationPath));
    writer.on('error', reject);
  });
}

function isChatAllowed(chatId) {
  const allowed = config.telegram.allowedChatIds;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(String(chatId));
}

/**
 * Xử lý khi nhận lệnh văn bản
 */
async function handleTextCommand(message) {
  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();

  // Kiểm tra quyền
  if (!isChatAllowed(chatId)) {
    await sendTelegramMessage(chatId, '⛔ Bạn không có quyền sử dụng bot này.');
    return;
  }

  if (text === '/start' || text === '/help') {
    const helpMsg = `
👋 <b>Chào mừng đến với 3LittleBosses Multi-Platform Publisher!</b>

Bot hỗ trợ bạn đăng 1 Video hoặc Album Ảnh đồng thời lên 6 nền tảng:
• <b>Facebook Fanpage</b> (Reels & Photos)
• <b>Instagram</b> (Reels & Carousels)
• <b>Threads</b> (Videos & Photos)
• <b>YouTube</b> (Shorts & Videos)
• <b>TikTok</b> (qua n8n)
• <b>X (Twitter)</b>

<b>Cách sử dụng:</b>
1. Gửi <b>1 Video</b> hoặc <b>1/nhiều Hình ảnh</b> trực tiếp vào đây.
2. Bot sẽ nhận media và hỏi bạn <b>Caption</b> & <b>Hashtags</b>.
3. Nhập nội dung (hoặc gõ <code>/skip</code> để dùng mặc định).
4. Bot tự động xuất bản đồng thời và báo cáo kết quả chi tiết!

<b>Các lệnh hỗ trợ:</b>
• <code>/status</code>: Xem cấu hình các nền tảng đang kích hoạt
• <code>/cancel</code>: Huỷ phiên đăng tải hiện tại
• <code>/skip</code>: Sử dụng caption mặc định khi bot đang chờ
    `.trim();
    await sendTelegramMessage(chatId, helpMsg);
    return;
  }

  if (text === '/status') {
    const statusMsg = `
⚙️ <b>TRẠNG THÁI CẤU HÌNH HỆ THỐNG:</b>
• <b>Chat ID của bạn:</b> <code>${chatId}</code>
• <b>Chế độ:</b> ${config.app.dryRun ? '🟡 DRY-RUN (Giả lập)' : '🟢 LIVE (Thực tế)'}
• <b>Facebook Fanpage:</b> ${config.facebook.enabled ? '✅ Bật' : '❌ Tắt'} (Page ID: <code>${config.facebook.pageId || 'Chưa điền'}</code>)
• <b>Instagram:</b> ${config.instagram.enabled ? '✅ Bật' : '❌ Tắt'}
• <b>Threads:</b> ${config.threads.enabled ? '✅ Bật' : '❌ Tắt'}
• <b>YouTube:</b> ${config.youtube.enabled ? '✅ Bật' : '❌ Tắt'}
• <b>TikTok (n8n):</b> ${config.tiktok.enabled ? '✅ Bật' : '❌ Tắt'}
• <b>X (Twitter):</b> ${config.twitter.enabled ? '✅ Bật' : '❌ Tắt'}
• <b>Media Server:</b> ${config.mediaServer.publicBaseUrl}
    `.trim();
    await sendTelegramMessage(chatId, statusMsg);
    return;
  }

  if (text === '/cancel') {
    if (sessionStore.get(chatId)) {
      const s = sessionStore.get(chatId);
      if (s.jobId) cleanJobDir(s.jobId);
      sessionStore.clear(chatId);
      await sendTelegramMessage(chatId, '❌ Đã huỷ phiên tải lên hiện tại.');
    } else {
      await sendTelegramMessage(chatId, 'ℹ️ Không có phiên tải lên nào đang chờ.');
    }
    return;
  }

  // Nếu đang trong trạng thái chờ nhập Caption & Hashtag
  if (sessionStore.isAwaitingCaption(chatId)) {
    const session = sessionStore.get(chatId);
    sessionStore.set(chatId, { status: 'PUBLISHING' });

    const { caption, hashtags, fullText } = parseCaptionAndHashtags(text);

    logger.info('Telegram', `Nhận Caption từ chat ${chatId}: "${caption}" | Tags: ${hashtags.join(' ')}`);

    // Gửi tin nhắn tiến độ khởi tạo
    const progressMsgId = await sendTelegramMessage(chatId, `
🚀 <b>Bắt đầu đăng tải lên đa nền tảng...</b>
📝 <b>Caption:</b> ${caption}
🏷️ <b>Hashtag:</b> ${hashtags.join(' ') || '<i>Không có</i>'}

<i>Đang khởi tạo các luồng xuất bản...</i>
    `.trim());

    // Trạng thái từng nền tảng để hiển thị real-time
    const platformStatuses = new Map();

    const formatProgressText = () => {
      let msg = `🚀 <b>TIẾN ĐỘ XUẤT BẢN ĐA NỀN TẢNG:</b>\n`;
      msg += `📝 <b>Caption:</b> ${caption}\n\n`;

      for (const [name, p] of platformStatuses.entries()) {
        let icon = '⏳';
        if (p.status === 'SUCCESS') icon = '✅';
        if (p.status === 'FAILED') icon = '❌';
        if (p.status === 'SKIPPED') icon = '⏭️';

        let line = `${icon} <b>${name}:</b> ${p.message}`;
        if (p.url) {
          line += ` — <a href="${p.url}">Xem bài đăng</a>`;
        }
        msg += `${line}\n`;
      }
      return msg.trim();
    };

    let updateTimer = null;
    const triggerMessageUpdate = () => {
      if (updateTimer) return;
      updateTimer = setTimeout(async () => {
        updateTimer = null;
        await editTelegramMessage(chatId, progressMsgId, formatProgressText());
      }, 1500);
    };

    const jobData = {
      jobId: session.jobId,
      mediaType: session.mediaType,
      files: session.files,
      caption,
      hashtags,
      fullText,
    };

    try {
      const summary = await publishMultiPlatform(jobData, (update) => {
        platformStatuses.set(update.platform, update);
        triggerMessageUpdate();
      });

      // Huỷ throttle timer và cập nhật thông báo cuối cùng
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      await editTelegramMessage(chatId, progressMsgId, formatProgressText());

      // Gửi báo cáo tổng kết
      const reportMsg = `
🎉 <b>KẾT QUẢ ĐĂNG TẢI HOÀN TẤT!</b>
• Thành công: <b>${summary.successCount}/${summary.total}</b> nền tảng.
${summary.success ? '✨ Tất cả nội dung đã được phân phối thành công!' : '⚠️ Có một số nền tảng gặp sự cố, vui lòng xem chi tiết ở trên.'}
      `.trim();
      await sendTelegramMessage(chatId, reportMsg);

    } catch (publishErr) {
      logger.error('Telegram', `Lỗi nghiêm trọng khi xuất bản: ${publishErr.message}`);
      await sendTelegramMessage(chatId, `❌ Gặp lỗi nghiêm trọng trong quá trình xuất bản: ${publishErr.message}`);
    } finally {
      sessionStore.clear(chatId);
    }
  }
}

/**
 * Xử lý khi nhận Video từ Telegram
 */
async function handleVideoMessage(message) {
  const chatId = String(message.chat.id);
  if (!isChatAllowed(chatId)) return;

  const video = message.video || message.document;
  if (!video) return;

  const fileId = video.file_id;
  const fileSizeMb = (video.file_size / (1024 * 1024)).toFixed(2);
  const duration = video.duration ? `${video.duration}s` : 'N/A';

  const notifyMsgId = await sendTelegramMessage(chatId, `📥 Đang tải video (${fileSizeMb} MB) về máy chủ... Vui lòng đợi trong giây lát!`);

  const jobId = generateJobId();
  const jobDir = getJobDir(jobId);
  const localVideoPath = path.join(jobDir, 'video.mp4');

  try {
    await downloadTelegramFile(fileId, localVideoPath);
    logger.success('Telegram', `Đã tải xong video cho chat ${chatId}: ${localVideoPath}`);

    // Cập nhật session
    sessionStore.set(chatId, {
      status: 'AWAITING_CAPTION',
      jobId,
      mediaType: 'video',
      files: [localVideoPath],
    });

    const askMsg = `
🎬 <b>ĐÃ NHẬN 1 VIDEO THÀNH CÔNG!</b>
• <b>Dung lượng:</b> ${fileSizeMb} MB | <b>Thời lượng:</b> ${duration}

✍️ <b>Vui lòng gửi Caption và Hashtag bạn muốn đặt cho bài đăng:</b>
<i>(Ví dụ: 3 bé mèo con nghịch ngợm #cat #kitten #pets #cute)</i>

💡 Gõ <code>/skip</code> để dùng Caption mặc định
💡 Gõ <code>/cancel</code> để huỷ bỏ
    `.trim();

    await editTelegramMessage(chatId, notifyMsgId, askMsg);

  } catch (err) {
    logger.error('Telegram', `Lỗi tải video: ${err.message}`);
    await editTelegramMessage(chatId, notifyMsgId, `❌ Lỗi tải video từ Telegram: ${err.message}`);
    cleanJobDir(jobId);
  }
}

/**
 * Xử lý khi nhận Hình ảnh từ Telegram (hỗ trợ gom Album ảnh)
 */
async function handlePhotoMessage(message) {
  const chatId = String(message.chat.id);
  if (!isChatAllowed(chatId)) return;

  // Lấy ảnh có độ phân giải cao nhất
  const photos = message.photo;
  if (!photos || photos.length === 0) return;
  const photo = photos[photos.length - 1];
  const fileId = photo.file_id;

  let session = sessionStore.get(chatId);

  // Nếu chưa có session gom ảnh, khởi tạo session mới
  if (!session || session.status !== 'COLLECTING_PHOTOS') {
    const jobId = generateJobId();
    const jobDir = getJobDir(jobId);
    session = sessionStore.set(chatId, {
      status: 'COLLECTING_PHOTOS',
      jobId,
      jobDir,
      mediaType: 'images',
      files: [],
    });
  }

  const photoIndex = session.files.length + 1;
  const localPhotoPath = path.join(session.jobDir, `photo_${photoIndex}.jpg`);

  // Xoá timer chờ cũ nếu đang có
  if (session.timer) {
    clearTimeout(session.timer);
  }

  // Tải ảnh về đĩa
  try {
    await downloadTelegramFile(fileId, localPhotoPath);
    session.files.push(localPhotoPath);
    logger.info('Telegram', `Đã nhận ảnh #${session.files.length} cho chat ${chatId}`);
  } catch (err) {
    logger.error('Telegram', `Lỗi tải ảnh #${photoIndex}: ${err.message}`);
  }

  // Đặt window timer gom ảnh (mặc định 4s)
  session.timer = setTimeout(async () => {
    sessionStore.set(chatId, { status: 'AWAITING_CAPTION' });

    const askMsg = `
📸 <b>ĐÃ NHẬN ${session.files.length} HÌNH ẢNH!</b>

✍️ <b>Vui lòng gửi Caption và Hashtag bạn muốn đặt cho bài đăng:</b>
<i>(Ví dụ: Bộ ảnh cưng xỉu của 3 bé boss #cat #cute #meow)</i>

💡 Gõ <code>/skip</code> để dùng Caption mặc định
💡 Gõ <code>/cancel</code> để huỷ bỏ
    `.trim();

    await sendTelegramMessage(chatId, askMsg);
  }, config.telegram.photoBatchWindowMs);
}

/**
 * Vòng lặp Long Polling nhận sự kiện từ Telegram
 */
async function startTelegramPolling() {
  if (!config.telegram.botToken) {
    logger.warn('Telegram', 'Chưa cấu hình TELEGRAM_BOT_TOKEN trong .env. Telegram bot tạm dừng.');
    return;
  }

  isPolling = true;
  logger.success('Telegram', 'Telegram Bot Polling đã kích hoạt! Đang lắng nghe sự kiện...');

  while (isPolling) {
    try {
      const botUrl = getBotUrl();
      const res = await tgHttp.get(`${botUrl}/getUpdates`, {
        params: {
          offset: pollingOffset,
          timeout: 25,
          allowed_updates: JSON.stringify(['message']),
        },
      });

      const updates = res.data?.result || [];
      for (const update of updates) {
        pollingOffset = update.update_id + 1;
        const msg = update.message;
        if (!msg) continue;

        // 1. Nhận Video
        if (msg.video || (msg.document && msg.document.mime_type?.startsWith('video/'))) {
          await handleVideoMessage(msg);
        }
        // 2. Nhận Hình ảnh
        else if (msg.photo && msg.photo.length > 0) {
          await handlePhotoMessage(msg);
        }
        // 3. Nhận Văn bản
        else if (msg.text) {
          await handleTextCommand(msg);
        }
      }
    } catch (err) {
      if (isPolling) {
        logger.warn('Telegram', `Polling tạm thời gián đoạn (${err.message}). Thử lại sau 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
}

function stopTelegramPolling() {
  isPolling = false;
}

module.exports = {
  startTelegramPolling,
  stopTelegramPolling,
  sendTelegramMessage,
  editTelegramMessage,
};
