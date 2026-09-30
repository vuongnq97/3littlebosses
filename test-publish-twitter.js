'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { publishToTwitter } = require('./services/twitter-publisher');
const logger = require('./utils/logger');

async function testUploadTwitter() {
  const videoPath = '/Users/macbook_196/Workspace/something-dev/3littlebosses/assets/final_merged_9_16.mp4';
  if (!fs.existsSync(videoPath)) {
    console.error(`Không tìm thấy file: ${videoPath}`);
    process.exit(1);
  }

  logger.info('Test', '--- BẮT ĐẦU TEST ĐĂNG VIDEO LÊN X (TWITTER) ---');
  logger.info('Test', `File: ${videoPath}`);

  try {
    const result = await publishToTwitter({
      mediaType: 'video',
      files: [videoPath],
      caption: '3 bé mèo con siêu quậy 🐾',
      hashtags: ['#cat', '#cute', '#pets', '#3littlebosses'],
      fullText: '3 bé mèo con siêu quậy nhà 3LittleBosses 🐾\n\n#cat #cute #pets #3littlebosses',
    });

    logger.success('Test', '🎉 TEST ĐĂNG X (TWITTER) THÀNH CÔNG RỰC RỠ!');
    logger.success('Test', `Tweet ID: ${result.id}`);
    logger.success('Test', `Link xem Tweet: ${result.url}`);
  } catch (err) {
    logger.error('Test', `Đăng bài thất bại: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
    process.exit(1);
  }
}

testUploadTwitter();
