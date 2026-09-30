'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

let serverInstance = null;
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

function startMediaServer() {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      return resolve(serverInstance);
    }
    const port = config.mediaServer.port;
    try {
      serverInstance = app.listen(port, () => {
        logger.success('MediaServer', `Media Server đang chạy tại port ${port}`);
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
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}

module.exports = {
  startMediaServer,
  stopMediaServer,
  getPublicMediaUrl,
  app,
};
