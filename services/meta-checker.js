'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Cập nhật một biến trong file .env
 */
function updateEnvKey(key, value) {
  try {
    const envPath = path.join(config.baseDir, '.env');
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, 'utf8');
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch (err) {
    logger.warn('MetaAuth', `Không thể ghi ${key} vào .env: ${err.message}`);
  }
}

/**
 * Tự động gia hạn (Refresh) Threads Long-Lived Token
 * Threads cho phép gia hạn token 60 ngày nếu token đã tạo được trên 24 giờ và chưa hết hạn.
 */
async function refreshThreadsToken() {
  const tToken = config.threads.accessToken;
  if (!tToken) return null;

  try {
    const res = await axios.get(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${tToken}`,
      { httpsAgent, timeout: 15000 }
    );

    const newToken = res.data?.access_token;
    const expiresIn = res.data?.expires_in; // số giây (thường là 5,184,000s = 60 ngày)
    if (newToken) {
      config.threads.accessToken = newToken;
      updateEnvKey('THREADS_ACCESS_TOKEN', newToken);
      const days = Math.round(expiresIn / 86400);
      logger.success('ThreadsAuth', `🔄 Đã tự động gia hạn Threads Token thành công! (Còn ${days} ngày hiệu lực)`);
      return newToken;
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    // Nếu lỗi do token chưa đủ 24h kể từ lần tạo/gia hạn trước thì bỏ qua bình thường
    if (msg.includes('24 hours') || msg.includes('too soon')) {
      // Token mới tạo, chưa đến lúc cần gia hạn
    } else {
      logger.info('ThreadsAuth', `Gia hạn Threads Token: ${msg}`);
    }
  }
  return null;
}

/**
 * Kiểm tra chi tiết hạn sử dụng của Facebook Page Token qua debug_token
 */
async function inspectFacebookToken(token) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/${config.facebook.apiVersion}/debug_token?input_token=${token}&access_token=${token}`,
      { httpsAgent, timeout: 10000 }
    );
    const data = res.data?.data;
    if (data) {
      const type = data.type || 'UNKNOWN';
      const expiresAt = data.expires_at; // 0 nghĩa là KHÔNG BAO GIỜ HẾT HẠN (Never Expire)
      if (expiresAt === 0) {
        logger.success('MetaAuth', `🟢 Facebook Page Token: VĨNH VIỄN (Never Expire) [Loại: ${type}]`);
      } else {
        const daysLeft = Math.max(0, Math.round((expiresAt * 1000 - Date.now()) / (1000 * 86400)));
        const expiryDate = new Date(expiresAt * 1000).toLocaleDateString('vi-VN');
        logger.warn('MetaAuth', `⏳ Facebook Token (${type}) sẽ hết hạn sau: ${daysLeft} ngày (vào ngày ${expiryDate})`);
        if (type === 'USER') {
          logger.info('MetaAuth', `💡 Mẹo lấy Token Vĩnh Viễn: Dùng User Token gọi GET /me/accounts để lấy "Page Access Token" không bao giờ hết hạn.`);
        }
      }
    }
  } catch (_) {
    // debug_token có thể yêu cầu App Token đối với một số tài khoản
  }
}

/**
 * Kiểm tra trạng thái sống / bị khoá của Meta Access Token (FB, IG, Threads)
 */
async function verifyMetaAccess() {
  // 1. Kiểm tra Facebook & Instagram Token
  if (config.facebook.enabled || config.instagram.enabled) {
    const token = config.facebook.accessToken;
    if (token) {
      try {
        const res = await axios.get(
          `https://graph.facebook.com/${config.facebook.apiVersion}/me?access_token=${token}`,
          { httpsAgent, timeout: 10000 }
        );
        logger.success('MetaAuth', `Token Meta hợp lệ: ${res.data?.name || res.data?.id}`);
        // Kiểm tra thời hạn sống
        await inspectFacebookToken(token);
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        const code = err.response?.data?.error?.code;
        if (code === 200 || msg.includes('API access blocked')) {
          logger.error('MetaAuth', `❌ Meta đang chặn API access ("API access blocked", code 200)`);
          logger.warn('MetaAuth', `👉 Hãy đăng nhập https://developers.facebook.com/ để xác nhận điều khoản/Data Use Checkup hoặc tạo Token mới.`);
        } else if (code === 190) {
          logger.error('MetaAuth', `❌ FB_PAGE_ACCESS_TOKEN đã hết hạn (code 190). Hãy tạo lại token mới.`);
        } else {
          logger.warn('MetaAuth', `Kiểm tra token Meta: ${msg}`);
        }
      }
    }
  }

  // 2. Kiểm tra & Tự động Gia hạn Threads Token
  if (config.threads.enabled) {
    const tToken = config.threads.accessToken;
    if (tToken) {
      try {
        const res = await axios.get(
          `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${tToken}`,
          { httpsAgent, timeout: 10000 }
        );
        logger.success('ThreadsAuth', `Token Threads hợp lệ: @${res.data?.username || res.data?.id}`);

        // Tự động thử gia hạn thêm 60 ngày nếu đã đủ 24 giờ
        await refreshThreadsToken();
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        const code = err.response?.data?.error?.code;
        if (code === 200 || msg.includes('API access blocked')) {
          logger.error('ThreadsAuth', `❌ Threads đang bị chặn API access ("API access blocked", code 200).`);
        } else if (code === 190) {
          logger.error('ThreadsAuth', `❌ THREADS_ACCESS_TOKEN đã hết hạn. Hãy làm mới token.`);
        } else {
          logger.warn('ThreadsAuth', `Kiểm tra token Threads: ${msg}`);
        }
      }
    }
  }
}

// Thiết lập định kỳ kiểm tra và gia hạn Threads token mỗi 24 giờ một lần
const dailyRefreshTimer = setInterval(() => {
  if (config.threads.enabled) {
    refreshThreadsToken().catch(() => {});
  }
}, 24 * 60 * 60 * 1000);

if (dailyRefreshTimer && typeof dailyRefreshTimer.unref === 'function') {
  dailyRefreshTimer.unref();
}

module.exports = {
  verifyMetaAccess,
  refreshThreadsToken,
  inspectFacebookToken,
};
