/**
 * Đổi short-lived User token -> long-lived User token -> Page token KHÔNG HẾT HẠN,
 * rồi ghi vào .env (FB_PAGE_ACCESS_TOKEN, và IG_ACCESS_TOKEN nếu đang trống).
 *
 * Yêu cầu trong .env: FB_APP_ID, FB_APP_SECRET, FB_PAGE_ID
 * Cách dùng:
 *   FB_SHORT_LIVED_TOKEN=<token> node scripts/refresh-fb-token.js
 *   (hoặc không truyền -> dùng FB_PAGE_ACCESS_TOKEN hiện tại trong .env)
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ENV_PATH = path.join(__dirname, '..', '.env');
const { FB_APP_ID, FB_APP_SECRET, FB_PAGE_ID, FB_API_VERSION = 'v21.0' } = process.env;
const shortToken = process.env.FB_SHORT_LIVED_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
const GRAPH = `https://graph.facebook.com/${FB_API_VERSION}`;

function setEnv(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
}

(async () => {
  if (!FB_APP_ID || !FB_APP_SECRET || !FB_PAGE_ID || !shortToken) {
    throw new Error('Thiếu FB_APP_ID / FB_APP_SECRET / FB_PAGE_ID / token trong .env');
  }

  // 1. short-lived -> long-lived user token
  const ex = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: FB_APP_ID,
      client_secret: FB_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
  const longUserToken = ex.data.access_token;
  console.log(`✔ Long-lived user token OK (expires_in=${ex.data.expires_in ?? 'n/a'}s)`);

  // 2. lấy Page token từ long-lived user token
  const accounts = await axios.get(`${GRAPH}/me/accounts`, {
    params: { access_token: longUserToken, limit: 100 },
  });
  const page = (accounts.data.data || []).find((p) => p.id === FB_PAGE_ID);
  if (!page) {
    const names = (accounts.data.data || []).map((p) => `${p.name} (${p.id})`).join(', ') || '(trống)';
    throw new Error(`Không tìm thấy Page ${FB_PAGE_ID}. Các Page khả dụng: ${names}`);
  }
  console.log(`✔ Tìm thấy Page: ${page.name}`);

  // 3. kiểm tra hạn của Page token
  const dbg = await axios.get(`${GRAPH}/debug_token`, {
    params: { input_token: page.access_token, access_token: `${FB_APP_ID}|${FB_APP_SECRET}` },
  });
  const d = dbg.data.data;
  console.log(
    `✔ Page token: type=${d.type}, expires_at=${d.expires_at} ${d.expires_at === 0 ? '(KHÔNG HẾT HẠN)' : ''}`
  );
  console.log(`  scopes: ${(d.scopes || []).join(', ')}`);

  // 4. ghi .env (không in token ra console)
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  env = setEnv(env, 'FB_PAGE_ACCESS_TOKEN', page.access_token);
  if (/^IG_ACCESS_TOKEN=\s*$/m.test(env)) {
    env = setEnv(env, 'IG_ACCESS_TOKEN', page.access_token);
    console.log('✔ IG_ACCESS_TOKEN đang trống -> đã dùng chung Page token');
  }
  fs.writeFileSync(ENV_PATH, env);
  console.log('✔ Đã cập nhật .env');
})().catch((e) => {
  console.error('✘ Lỗi:', e.response?.data?.error?.message || e.message);
  process.exit(1);
});
