'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const rootDir = path.resolve(__dirname, '..');
const storageDir = path.join(rootDir, 'storage');
const browserDataDir = path.join(storageDir, 'twitter-browser');
const outputFile = path.join(storageDir, 'twitter-captured.json');

// Tạo thư mục nếu chưa có
fs.mkdirSync(browserDataDir, { recursive: true });

// Đồng bộ session đăng nhập từ Chrome Profile 6 (Three Little Bosses) nếu chưa có
const chromeProfile6 = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome/Profile 6');
const targetDefault = path.join(browserDataDir, 'Default');

if (!fs.existsSync(targetDefault) && fs.existsSync(chromeProfile6)) {
  console.log('📋 Đang sao chép phiên đăng nhập X từ Profile 6 vào môi trường capture độc lập...');
  fs.mkdirSync(targetDefault, { recursive: true });
  try {
    execSync(`rsync -a --exclude="Singleton*" "${chromeProfile6}/" "${targetDefault}/"`);
  } catch (_) {}
}

// Xóa file lock cũ nếu có
try {
  for (const f of fs.readdirSync(browserDataDir)) {
    if (f.startsWith('Singleton')) {
      try { fs.unlinkSync(path.join(browserDataDir, f)); } catch (_) {}
    }
  }
} catch (_) {}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('🌐 3LITTLEBOSSES - X (TWITTER) NETWORK SNIFFER & CAPTURE TOOL');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('⏳ Đang mở trình duyệt Chrome có công cụ tự động bắt gói tin...');

(async () => {
  const context = await chromium.launchPersistentContext(browserDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const capturedData = {
    capturedAt: new Date().toISOString(),
    uploadRequests: [],
    createTweet: null,
    cookies: [],
  };

  // Lắng nghe tất cả request mạng
  page.on('request', async (req) => {
    const reqUrl = req.url();

    // 1. Bắt request upload media
    if (reqUrl.includes('upload.twitter.com') || reqUrl.includes('upload.x.com')) {
      console.log(`\n📦 [CAPTURED MEDIA UPLOAD] ${req.method()} ${reqUrl.substring(0, 80)}...`);
      capturedData.uploadRequests.push({
        url: reqUrl,
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
        time: new Date().toISOString(),
      });
      fs.writeFileSync(outputFile, JSON.stringify(capturedData, null, 2));
    }

    // 2. Bắt request CreateTweet (GraphQL)
    if (reqUrl.includes('CreateTweet')) {
      console.log('\n🎯 [BẮT ĐƯỢC REQUEST CREATETWEET!]');
      console.log(`URL: ${reqUrl}`);
      capturedData.createTweet = {
        url: reqUrl,
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
        time: new Date().toISOString(),
      };
      fs.writeFileSync(outputFile, JSON.stringify(capturedData, null, 2));
    }
  });

  // Lắng nghe phản hồi (Response)
  page.on('response', async (res) => {
    const resUrl = res.url();
    if (resUrl.includes('CreateTweet')) {
      try {
        const body = await res.json();
        console.log('\n🎉 [PHẢN HỒI CREATETWEET THÀNH CÔNG]');
        console.log('Status:', res.status());
        if (capturedData.createTweet) {
          capturedData.createTweet.responseStatus = res.status();
          capturedData.createTweet.responseBody = body;
        }

        // Lấy toàn bộ cookies của x.com
        const cookies = await context.cookies(['https://x.com', 'https://twitter.com']);
        capturedData.cookies = cookies;

        fs.writeFileSync(outputFile, JSON.stringify(capturedData, null, 2));
        console.log(`\n💾 ĐÃ LƯU TOÀN BỘ GÓI TIN & COOKIES VÀO:`);
        console.log(`   👉 ${outputFile}`);
        console.log('═══════════════════════════════════════════════════════════════════\n');
      } catch (err) {
        console.log('Không thể parse response body:', err.message);
      }
    }
  });

  console.log('👉 Đang điều hướng tới https://x.com/compose/post ...');
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' });

  console.log('\n💡 HƯỚNG DẪN:');
  console.log('1. Tại cửa sổ Chrome vừa hiện lên, bạn chọn Video và gõ Status.');
  console.log('2. Bấm nút "Post" (Đăng).');
  console.log('3. Hệ thống sẽ TỰ ĐỘNG chụp lại 100% request, cookies, headers và lưu lại!');
})();
