'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('\x1b[31m[LỖI] Chưa cấu hình YOUTUBE_CLIENT_ID hoặc YOUTUBE_CLIENT_SECRET trong .env!\x1b[0m');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(clientId)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(scopes)}&` +
  `access_type=offline&` +
  `prompt=consent`;

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/oauth2callback') {
      const code = reqUrl.query.code;
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h3>Không tìm thấy authorization code!</h3>');
        return;
      }

      console.log('\n\x1b[32m✔ Đã nhận mã xác thực từ Google! Đang lấy Refresh Token...\x1b[0m');

      // Trao đổi mã code lấy tokens trực tiếp qua Google OAuth API
      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      });

      const refreshToken = tokenRes.data.refresh_token;

      if (!refreshToken) {
        console.error('\x1b[33m[Cảnh báo] Google không trả về refresh_token. Vui lòng thử lại với prompt=consent.\x1b[0m');
      } else {
        console.log('\n======================================================');
        console.log('\x1b[32m🎉 LẤY YOUTUBE_REFRESH_TOKEN THÀNH CÔNG!\x1b[0m');
        console.log('Refresh Token:');
        console.log(`\x1b[36m${refreshToken}\x1b[0m`);
        console.log('======================================================\n');

        // Tự động ghi vào file .env
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');
          if (envContent.includes('YOUTUBE_REFRESH_TOKEN=')) {
            envContent = envContent.replace(
              /YOUTUBE_REFRESH_TOKEN=.*/,
              `YOUTUBE_REFRESH_TOKEN=${refreshToken}`
            );
          } else {
            envContent += `\nYOUTUBE_REFRESH_TOKEN=${refreshToken}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
          console.log('\x1b[32m✔ Đã tự động cập nhật YOUTUBE_REFRESH_TOKEN vào file .env!\x1b[0m');
        }
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2 style="color: #16a34a;">🎉 Xác thực YouTube thành công!</h2>
          <p>YOUTUBE_REFRESH_TOKEN đã được lưu tự động vào file <code>.env</code>.</p>
          <p>Bạn có thể đóng tab này lại.</p>
        </div>
      `);

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1500);
    }
  } catch (err) {
    console.error('Lỗi khi lấy token:', err.response?.data || err.message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h3>Lỗi: ${JSON.stringify(err.response?.data || err.message)}</h3>`);
  }
});

server.listen(3000, () => {
  console.log('\n\x1b[1m🚀 ĐANG KHỞI TẠO TIẾN TRÌNH LẤY YOUTUBE_REFRESH_TOKEN...\x1b[0m');
  console.log('------------------------------------------------------------');
  console.log('\x1b[33m👉 Trình duyệt đang được mở tự động (hoặc nhấp link bên dưới):\x1b[0m\n');
  console.log(`\x1b[34m${authUrl}\x1b[0m\n`);
  console.log('------------------------------------------------------------');
  console.log('Đang lắng nghe phản hồi tại http://localhost:3000/oauth2callback ...');

  try {
    const { exec } = require('child_process');
    exec(`open "${authUrl}"`);
  } catch (_) {}
});
