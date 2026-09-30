'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const sessionStore = require('../services/session-store');
const { publishMultiPlatform } = require('../services/multi-publisher');
const {
  generateJobId,
  getJobDir,
  parseCaptionAndHashtags,
  cleanJobDir,
} = require('../utils/file-helper');

async function runSmokeTest() {
  logger.divider();
  logger.info('SmokeTest', 'BẮT ĐẦU SMOKE TEST CHO HỆ THỐNG 3LITTLEBOSSES...');
  logger.divider();

  // Bật chế độ dry-run cho toàn bộ test
  config.app.dryRun = true;

  // 1. Kiểm tra parse caption & hashtag
  logger.info('SmokeTest', 'Test 1: Kiểm tra parse caption và hashtags...');
  const testInput = '3 bé mèo con nghịch ngợm đáng yêu #cat #cute #kitten #pets';
  const parsed = parseCaptionAndHashtags(testInput);
  if (parsed.caption !== '3 bé mèo con nghịch ngợm đáng yêu') {
    throw new Error(`Parse caption sai: "${parsed.caption}"`);
  }
  if (parsed.hashtags.length !== 4) {
    throw new Error(`Parse hashtags sai số lượng: ${parsed.hashtags.length}`);
  }
  logger.success('SmokeTest', `Parse text OK: Caption="${parsed.caption}", Tags=[${parsed.hashtags.join(', ')}]`);

  // 2. Kiểm tra Session Store
  logger.info('SmokeTest', 'Test 2: Kiểm tra Session Store...');
  const fakeChatId = '123456789';
  sessionStore.set(fakeChatId, { status: 'AWAITING_CAPTION', jobId: 'test_job_001' });
  if (!sessionStore.isAwaitingCaption(fakeChatId)) {
    throw new Error('SessionStore: isAwaitingCaption trả về sai');
  }
  sessionStore.clear(fakeChatId);
  if (sessionStore.get(fakeChatId) !== null) {
    throw new Error('SessionStore: clear không thành công');
  }
  logger.success('SmokeTest', 'Session Store hoạt động chính xác!');

  // 3. Giả lập đăng Video qua MultiPublisher
  logger.info('SmokeTest', 'Test 3: Giả lập xuất bản Video qua MultiPublisher (Dry-run)...');
  const testJobId = generateJobId();
  const jobDir = getJobDir(testJobId);
  const dummyVideoPath = path.join(jobDir, 'video.mp4');
  fs.writeFileSync(dummyVideoPath, 'dummy video binary content for testing');

  const progressUpdates = [];
  const videoJobData = {
    jobId: testJobId,
    mediaType: 'video',
    files: [dummyVideoPath],
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    fullText: parsed.fullText,
  };

  const videoSummary = await publishMultiPlatform(videoJobData, (update) => {
    progressUpdates.push(update);
  });

  logger.info('SmokeTest', `Tiến độ nhận được ${progressUpdates.length} updates`);
  logger.success('SmokeTest', `Kết quả Video: ${videoSummary.successCount}/${videoSummary.total} nền tảng thành công!`);

  // 4. Giả lập đăng Album Ảnh qua MultiPublisher
  logger.info('SmokeTest', 'Test 4: Giả lập xuất bản Album Ảnh qua MultiPublisher (Dry-run)...');
  const dummyPhoto1 = path.join(jobDir, 'photo_1.jpg');
  const dummyPhoto2 = path.join(jobDir, 'photo_2.jpg');
  fs.writeFileSync(dummyPhoto1, 'dummy photo 1');
  fs.writeFileSync(dummyPhoto2, 'dummy photo 2');

  const photoJobData = {
    jobId: testJobId,
    mediaType: 'images',
    files: [dummyPhoto1, dummyPhoto2],
    caption: 'Album 3 bé boss',
    hashtags: ['#cat', '#cute'],
    fullText: 'Album 3 bé boss #cat #cute',
  };

  const photoSummary = await publishMultiPlatform(photoJobData);
  logger.success('SmokeTest', `Kết quả Album ảnh: ${photoSummary.successCount}/${photoSummary.total} nền tảng thành công!`);

  // Dọn dẹp thư mục test
  cleanJobDir(testJobId);

  logger.divider();
  logger.success('SmokeTest', '🎉 TẤT CẢ CÁC BÀI KIỂM TRA SMOKE TEST ĐỀU THÀNH CÔNG RỰC RỠ!');
  logger.divider();
}

runSmokeTest().catch(err => {
  logger.error('SmokeTest', `Thất bại: ${err.message}`);
  process.exit(1);
});
