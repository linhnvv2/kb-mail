// Cấu hình pm2 — chạy nền: (1) web app Next, (2) job quét mail gắn cờ
// Khởi động cả hai:  pm2 start ecosystem.config.cjs
// Chỉ một app:       pm2 start ecosystem.config.cjs --only kb-mail-web
// Xem log:           pm2 logs kb-mail-web | pm2 logs kb-mail-job
// Dừng:              pm2 stop kb-mail-web | pm2 delete kb-mail-job

// Port web — đổi tại đây (hoặc đặt biến môi trường PORT khi khởi động pm2).
const PORT = process.env.PORT || 8087;

module.exports = {
  apps: [
    {
      name: "kb-mail-web",
      // Gọi trực tiếp binary của Next để pm2 quản lý đúng tiến trình (cần `npm run build` trước).
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${PORT}`,
      cwd: __dirname,
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "500M",
      out_file: "data/logs/web-out.log",
      error_file: "data/logs/web-err.log",
      time: true,
    },
    {
      name: "kb-mail-job",
      script: "scripts/flag-job.mjs",
      args: "--watch",
      cwd: __dirname,
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "300M",
      out_file: "data/logs/job-out.log",
      error_file: "data/logs/job-err.log",
      time: true, // gắn timestamp vào mỗi dòng log
    },
  ],
};
