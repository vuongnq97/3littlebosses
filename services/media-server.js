'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

let serverInstance = null;
let tunnelProcess = null;
const app = express();

// Phục vụ các file trong uploadsDir dưới đường dẫn /media
app.use('/media', express.static(config.uploadsDir, {
  fallthrough: false,
  setHeaders: (res, filePath) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=3600');
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: '3littlebosses-media-server', time: new Date().toISOString() });
});

// Phục vụ trang Linktree tĩnh trực tiếp tại trang chủ
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html'
}));

function getPublicMediaUrl(jobId, filename) {
  const base = config.mediaServer.publicBaseUrl;
  return `${base}/media/${jobId}/${filename}`;
}

/**
 * Tìm binary cloudflared trên máy
 */
function findCloudflaredBin() {
  const candidates = [
    'cloudflared',
    '/Users/macbook_196/homebrew/bin/cloudflared',
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
  ];
  for (const bin of candidates) {
    try {
      execSync(`${bin} --version`, { stdio: 'ignore' });
      return bin;
    } catch (e) {
      // Tiếp tục tìm
    }
  }
  return null;
}

/**
 * Cập nhật biến PUBLIC_BASE_URL trong file .env
 */
function updateEnvPublicUrl(newUrl) {
  try {
    const envPath = path.join(config.baseDir, '.env');
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, 'utf8');
    if (/^PUBLIC_BASE_URL=.*/m.test(content)) {
      content = content.replace(/^PUBLIC_BASE_URL=.*/m, `PUBLIC_BASE_URL=${newUrl}`);
    } else {
      content += `\nPUBLIC_BASE_URL=${newUrl}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  } catch (err) {
    logger.warn('MediaServer', `Không thể cập nhật .env: ${err.message}`);
  }
}

/**
 * Tự động kiểm tra và khởi tạo Cloudflare Tunnel nếu URL hiện tại không khả dụng
 */
async function ensureTunnel(port) {
  if (!config.mediaServer.autoTunnel) {
    return;
  }

  // 1. Kiểm tra xem URL công khai hiện tại có đang hoạt động không
  if (config.mediaServer.publicBaseUrl && !config.mediaServer.publicBaseUrl.includes('localhost')) {
    try {
      const res = await axios.get(`${config.mediaServer.publicBaseUrl}/health`, { timeout: 3500 });
      if (res.data?.status === 'ok') {
        logger.success('MediaServer', `Public URL hiện tại đang hoạt động tốt: ${config.mediaServer.publicBaseUrl}`);
        return;
      }
    } catch (err) {
      logger.warn('MediaServer', `Public URL cũ (${config.mediaServer.publicBaseUrl}) không phản hồi. Đang khởi tạo tunnel mới...`);
    }
  }

  // 2. Tìm binary cloudflared
  const cloudflaredBin = findCloudflaredBin();
  if (!cloudflaredBin) {
    logger.warn('MediaServer', 'Không tìm thấy lệnh cloudflared. Nếu dùng Instagram/Threads, vui lòng cài đặt cloudflared hoặc cấu hình PUBLIC_BASE_URL cố định trong .env');
    return;
  }

  // 3. Khởi chạy Cloudflare Tunnel tự động
  return new Promise((resolve) => {
    logger.info('MediaServer', `Đang tự động khởi chạy Cloudflare Quick Tunnel (${cloudflaredBin})...`);

    tunnelProcess = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${port}`]);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logger.warn('MediaServer', 'Hết thời gian 12s chờ Cloudflare Tunnel. Sẽ dùng PUBLIC_BASE_URL hiện có.');
        resolve();
      }
    }, 12000);

    const handleData = (chunk) => {
      const str = chunk.toString();
      const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        const tunnelUrl = match[0];
        config.mediaServer.publicBaseUrl = tunnelUrl;
        updateEnvPublicUrl(tunnelUrl);
        logger.success('MediaServer', `🌐 Cloudflare Tunnel đã kết nối thành công: ${tunnelUrl}`);
        logger.info('MediaServer', `Đã cập nhật PUBLIC_BASE_URL cho Instagram & Threads!`);
        resolve();
      }
    };

    tunnelProcess.stdout.on('data', handleData);
    tunnelProcess.stderr.on('data', handleData);

    tunnelProcess.on('error', (err) => {
      logger.error('MediaServer', `Lỗi khi chạy cloudflared: ${err.message}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    tunnelProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn('MediaServer', `Cloudflare Tunnel đã thoát (code: ${code})`);
      }
    });
  });
}

function startMediaServer() {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      return resolve(serverInstance);
    }
    const port = config.mediaServer.port;
    try {
      serverInstance = app.listen(port, async () => {
        logger.success('MediaServer', `Media Server đang chạy tại port ${port}`);
        try {
          await ensureTunnel(port);
        } catch (tErr) {
          logger.warn('MediaServer', `Lỗi tạo tunnel: ${tErr.message}`);
        }
        logger.info('MediaServer', `Public Media Base URL: ${config.mediaServer.publicBaseUrl}`);
        resolve(serverInstance);
      });
      serverInstance.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn('MediaServer', `Port ${port} đang bận, server có thể đã chạy từ trước.`);
          resolve(serverInstance);
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function stopMediaServer() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGINT');
    } catch (e) {}
    tunnelProcess = null;
  }
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}

process.on('SIGINT', () => {
  stopMediaServer();
});
process.on('SIGTERM', () => {
  stopMediaServer();
});
process.on('exit', () => {
  stopMediaServer();
});

module.exports = {
  startMediaServer,
  stopMediaServer,
  getPublicMediaUrl,
  app,
};
