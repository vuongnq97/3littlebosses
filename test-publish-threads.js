'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const config = require('./config');
const { startMediaServer, stopMediaServer } = require('./services/media-server');
const logger = require('./utils/logger');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function waitForThreadsStatus(containerId, accessToken, maxWaitMs = 180000) {
  const startTime = Date.now();
  const checkUrl = `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${accessToken}`;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await axios.get(checkUrl, { httpsAgent, timeout: 15000 });
    const status = res.data?.status;
    logger.info('Threads', `Trạng thái render container ${containerId}: ${status}`);

    if (status === 'FINISHED') {
      return true;
    }
    if (status === 'ERROR') {
      throw new Error(`Threads Container lỗi: ${res.data?.error_message || JSON.stringify(res.data)}`);
    }

    await new Promise(r => setTimeout(r, 4000));
  }

  throw new Error(`Timeout chờ Threads xử lý container ${containerId}`);
}

async function run() {
  const videoSource = '/Users/macbook_196/Workspace/something-dev/3littlebosses/assets/final_merged_9_16.mp4';
  if (!fs.existsSync(videoSource)) {
    throw new Error(`Không tìm thấy video tại: ${videoSource}`);
  }

  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;

  console.log('--- THÔNG TIN CẤU HÌNH THREADS ---');
  console.log('Threads User ID:', userId);
  console.log('Public Base URL:', publicBaseUrl);
  console.log('-----------------------------------');

  // 1. Khởi động Media Server
  await startMediaServer();

  // 2. Chuẩn bị file vào thư mục upload
  const jobId = `test_threads_${Date.now()}`;
  const jobDir = path.join(config.uploadsDir, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const targetFilename = path.basename(videoSource);
  const targetPath = path.join(jobDir, targetFilename);
  fs.copyFileSync(videoSource, targetPath);
  logger.success('Test', `Đã sao chép video vào: ${targetPath}`);

  const videoPublicUrl = `${publicBaseUrl}/media/${jobId}/${targetFilename}`;
  logger.info('Test', `Public Video URL: ${videoPublicUrl}`);

  // Test xem URL nội bộ có tải được không
  try {
    const checkHead = await axios.head(`http://localhost:${config.mediaServer.port}/media/${jobId}/${targetFilename}`);
    logger.success('Test', `Media server local phục vụ tốt (Status: ${checkHead.status}, Size: ${checkHead.headers['content-length']} bytes)`);
  } catch (e) {
    logger.warn('Test', `Cảnh báo kiểm tra local media: ${e.message}`);
  }

  // 3. Caption & Hashtag
  const caption = 'Thử nghiệm tự động đăng video lên Threads từ 3LittleBosses 🐾\n\n#cute #cat #kitten #3littlebosses';

  // 4. Bước 1: Tạo Media Container
  logger.info('Threads', `Đang gửi yêu cầu tạo Media Container lên Threads...`);
  const createPayload = {
    media_type: 'VIDEO',
    video_url: videoPublicUrl,
    text: caption,
    access_token: accessToken,
  };

  const createRes = await axios.post(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    createPayload,
    { httpsAgent, timeout: 30000 }
  );

  const containerId = createRes.data?.id;
  if (!containerId) {
    throw new Error(`Không nhận được Container ID: ${JSON.stringify(createRes.data)}`);
  }
  logger.success('Threads', `Tạo Container thành công! Container ID: ${containerId}`);

  // 5. Bước 2: Chờ Threads tải video và render
  logger.info('Threads', `Đang chờ Threads tải và xử lý video...`);
  await waitForThreadsStatus(containerId, accessToken);

  // 6. Bước 3: Xuất bản (Publish)
  logger.info('Threads', `Đang xuất bản bài đăng...`);
  const pubRes = await axios.post(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    {
      creation_id: containerId,
      access_token: accessToken,
    },
    { httpsAgent, timeout: 30000 }
  );

  const postId = pubRes.data?.id;
  logger.success('Threads', `🎉 XUẤT BẢN THÀNH CÔNG LÊN THREADS!`);
  logger.success('Threads', `Post ID: ${postId}`);

  // Lấy permalink bài viết nếu có
  try {
    const postDetails = await axios.get(
      `https://graph.threads.net/v1.0/${postId}?fields=id,permalink,text&access_token=${accessToken}`,
      { httpsAgent }
    );
    if (postDetails.data?.permalink) {
      logger.success('Threads', `🔗 Xem bài viết tại: ${postDetails.data.permalink}`);
    }
  } catch (err) {
    logger.info('Threads', `Link bài viết: https://www.threads.net/@three_littlebosses`);
  }

  // Dọn dẹp
  stopMediaServer();
  process.exit(0);
}

run().catch(err => {
  logger.error('Threads Test', `Thất bại: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
  stopMediaServer();
  process.exit(1);
});
