// Cấu hình pm2 — chạy nền job quét mail gắn cờ
// Khởi động:  pm2 start ecosystem.config.cjs
// Xem log:    pm2 logs kb-mail-job
// Dừng:       pm2 stop kb-mail-job   |  pm2 delete kb-mail-job
module.exports = {
  apps: [
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
