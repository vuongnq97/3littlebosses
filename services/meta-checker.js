'use strict';

const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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

  // 2. Kiểm tra Threads Token
  if (config.threads.enabled) {
    const tToken = config.threads.accessToken;
    if (tToken) {
      try {
        const res = await axios.get(
          `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${tToken}`,
          { httpsAgent, timeout: 10000 }
        );
        logger.success('ThreadsAuth', `Token Threads hợp lệ: @${res.data?.username || res.data?.id}`);
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

module.exports = {
  verifyMetaAccess,
};
