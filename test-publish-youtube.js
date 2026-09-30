'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { publishToYouTube } = require('./services/youtube-publisher');
const logger = require('./utils/logger');

async function testUploadYouTube() {
  const videoPath = '/Users/macbook_196/Workspace/something-dev/3littlebosses/assets/final_merged_9_16.mp4';
  if (!fs.existsSync(videoPath)) {
    console.error(`Không tìm thấy file video tại: ${videoPath}`);
    process.exit(1);
  }

  logger.info('Test', '--- BẮT ĐẦU TEST UPLOAD YOUTUBE SHORTS ---');
  logger.info('Test', `File: ${videoPath}`);

  try {
    const result = await publishToYouTube({
      mediaType: 'video',
      files: [videoPath],
      caption: '3 bé mèo con siêu đáng yêu 🐾',
      hashtags: ['#cute', '#cat', '#kitten', '#3littlebosses', '#Shorts'],
      fullText: '3 bé mèo con siêu đáng yêu tinh nghịch nhà 3LittleBosses 🐾\n\n#cute #cat #kitten #3littlebosses #Shorts',
    });

    logger.success('Test', '🎉 TEST UPLOAD YOUTUBE THÀNH CÔNG RỰC RỠ!');
    logger.success('Test', `Video ID: ${result.id}`);
    logger.success('Test', `Link xem: ${result.url}`);
    logger.success('Test', `Link Shorts: https://www.youtube.com/shorts/${result.id}`);
  } catch (err) {
    logger.error('Test', `Upload thất bại: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
    process.exit(1);
  }
}

testUploadYouTube();
