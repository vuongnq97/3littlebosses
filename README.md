# 🐾 3LittleBosses — Multi-Platform Auto Publisher

Hệ thống độc lập tự động đăng **1 Video** hoặc **Nhiều Hình Ảnh** lên đồng thời 6 nền tảng mạng xã hội thông qua tương tác với **Telegram Bot**:
1. **Facebook Fanpage** (Facebook Reels & Photo Posts/Album qua Meta Graph API)
2. **Instagram** (Instagram Reels & Carousels qua Meta Graph API)
3. **Threads** (Videos & Photos qua Threads API)
4. **YouTube** (Shorts & Standard Videos qua YouTube Data API v3)
5. **TikTok** (TikTok Video qua Webhook n8n / API)
6. **X (Twitter)** (Chunked Video Upload & Tweet Photos qua Twitter API v2)

---

## 🎯 Luồng hoạt động (Workflow)

1. Bạn gửi **1 Video** hoặc **1 Album ảnh** vào Telegram Bot.
2. Bot tự động tải dữ liệu về máy chủ và lưu trữ tạm thời.
3. Bot gửi tin nhắn phản hồi:
   > 🎬 *Đã nhận 1 video! Vui lòng nhập Caption và Hashtag (hoặc gõ `/skip` để dùng mặc định, `/cancel` để hủy)...*
4. Bạn gõ trả lời nội dung bài đăng (Ví dụ: `3 bé mèo con tinh nghịch #cat #cute #pets`).
5. Bot lập tức xuất bản song song lên các nền tảng đã bật và cập nhật tiến độ real-time kèm link bài đăng vào tin nhắn!

---

## 🚀 Hướng dẫn cài đặt & khởi chạy (Độc lập 100%)

### Bước 1: Chuẩn bị môi trường & thư viện
```bash
# Di chuyển vào thư mục dự án
cd 3littlebosses

# Cài đặt thư viện độc lập
npm install
```

### Bước 2: Cấu hình file `.env`
Sao chép `.env.example` thành `.env` (nếu chưa có) và cập nhật các thông số cần thiết:

```env
# 1. Telegram Bot (Bắt buộc)
TELEGRAM_BOT_TOKEN=điền_bot_token_từ_BotFather
ALLOWED_CHAT_IDS=chat_id_của_bạn (để trống nếu cho phép tất cả)

# 2. Facebook Fanpage (Meta Graph API)
ENABLE_FACEBOOK=true
FB_PAGE_ID=your_page_id
FB_PAGE_ACCESS_TOKEN=your_page_access_token

# 3. Instagram (Reels & Photos qua Meta Graph API)
ENABLE_INSTAGRAM=true
IG_USER_ID=your_instagram_business_account_id
IG_ACCESS_TOKEN= (để trống sẽ dùng chung FB_PAGE_ACCESS_TOKEN)



# 4. Threads
ENABLE_THREADS=false
THREADS_USER_ID=your_threads_user_id
THREADS_ACCESS_TOKEN=your_threads_token

# 5. YouTube Shorts
ENABLE_YOUTUBE=false
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

# 6. TikTok (n8n Webhook riêng)
ENABLE_TIKTOK=true
N8N_TIKTOK_WEBHOOK_URL=http://localhost:5678/webhook/3littlebosses-tiktok
N8N_TIKTOK_CREDENTIAL_ID=cJDNuW2i1tFFXivi

# 7. X (Twitter)
ENABLE_TWITTER=false
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=

# 8. Media Server URL (Cho Meta / Threads kéo video/ảnh)
PUBLIC_BASE_URL=http://localhost:3005
```

> **Mẹo:** Nếu bạn chạy local và cần Meta tải video qua `PUBLIC_BASE_URL`, bạn có thể dùng Cloudflare Tunnel hoặc ngrok:
> ```bash
> ngrok http 3005
> ```
> Rồi gán URL ngrok vào `PUBLIC_BASE_URL` trong `.env`.

---

### Bước 3: Khởi động hệ thống

#### Chế độ kiểm tra giả lập (DRY-RUN - không gửi API thật):
```bash
node index.js --dry-run
```


#### Chế độ chạy thực tế (LIVE):
```bash
node index.js
```

---

## 📱 Các lệnh trong Telegram Bot

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `/start` hoặc `/help` | Xem hướng dẫn sử dụng bot |
| `/status` | Kiểm tra trạng thái các nền tảng đang kích hoạt |
| `/skip` | Sử dụng Caption và Hashtag mặc định |
| `/cancel` | Hủy bỏ lượt tải lên hiện tại |

---

## 🛠️ Cấu trúc dự án

```
3littlebosses/
├── package.json
├── index.js                     # Main entry point (khởi động Telegram bot & Media server)
├── config.js                    # Quản lý cấu hình tập trung
├── .env                         # File cấu hình bí mật (đã gitignored)
├── .gitignore                   # Loại trừ file nhạy cảm và media tạm
├── index.html                   # Trang Link in Bio (Linktree) chính thức
├── style.css                    # Giao diện Glassmorphism Linktree
├── script.js                    # Logic tương tác (QR Code, Share, âm thanh meow)
├── vercel.json                  # Cấu hình deploy Vercel
├── assets/
│   └── avatar.jpg               # Ảnh đại diện Studio 3 chú mèo
├── services/
│   ├── telegram-bot.js          # Xử lý Telegram polling, download media, tương tác hỏi caption
│   ├── multi-publisher.js       # Master orchestrator xuất bản đa nền tảng song song
│   ├── facebook-publisher.js    # Facebook Reels binary upload & Photo/Album post
│   ├── instagram-publisher.js   # Instagram Reels & Carousel/Single photo (Graph API)
│   ├── threads-publisher.js     # Threads API (Video & Photo)
│   ├── youtube-publisher.js     # YouTube Data API v3 (Upload Shorts/Video)
│   ├── tiktok-publisher.js      # Kết nối n8n Webhook TikTok workflow
│   ├── twitter-publisher.js     # Twitter API v2 (Chunked video & photo tweet)
│   ├── media-server.js          # Express server phục vụ media tĩnh & Linktree
│   └── session-store.js         # Lưu trữ trạng thái phiên làm việc theo Telegram chat ID
├── storage/
│   └── uploads/                 # Lưu trữ file tạm thời
└── utils/
    ├── logger.js                # Hệ thống log màu
    └── file-helper.js           # Phân loại video, ảnh, tách hashtag
```

---

## 🌐 Trang Link in Bio (Linktree) & Deploy Vercel

Dự án đã tích hợp sẵn trang web **Linktree** tại [index.html](file:///Users/macbook_196/Workspace/something-dev/3littlebosses/index.html) phục vụ cho bio mạng xã hội (Facebook, Instagram, Threads, TikTok, YouTube, X).

### 1. Xem trước trên máy:
Khi bot đang chạy (`node index.js`), bạn có thể mở trực tiếp:
👉 `http://localhost:3005` (hoặc mở file `index.html` trong trình duyệt).

### 2. Đẩy lên GitHub repo riêng & Deploy Vercel:
```bash
cd /Users/macbook_196/Workspace/something-dev/3littlebosses

git init
git add .
git commit -m "feat: initial commit for 3littlebosses with multi-publisher and linktree"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/3littlebosses.git
git push -u origin main
```

Sau đó vào **[vercel.com](https://vercel.com)** $\rightarrow$ **Add New Project** $\rightarrow$ chọn repo `3littlebosses` $\rightarrow$ bấm **Deploy**. Vercel sẽ tự động nhận diện `index.html` và cấp link online miễn phí!
