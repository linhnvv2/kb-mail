// Job: quét mail gắn cờ qua Graph API → so khớp kho kiến thức → data/suggestions.json
// Chạy 1 lần:  npm run job
// Chạy định kỳ: npm run job:watch  (chu kỳ JOB_INTERVAL_MINUTES, mặc định 10 phút)
import "./load-env.mjs";
import { runFlagJob } from "../lib/job.js";
import { getRules } from "../lib/store.js";

// Chu kỳ quét (phút): ưu tiên cấu hình trên trang (rules.json) -> JOB_INTERVAL_MINUTES -> 10.
function intervalMinutes() {
  const fromConfig = getRules().scanIntervalMinutes;
  if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
  return parseInt(process.env.JOB_INTERVAL_MINUTES || "10", 10) || 10;
}

async function once() {
  try {
    const result = await runFlagJob();
    const items = Object.values(result.items || {});
    const matched = items.filter((i) => (i.matches || []).length > 0).length;
    console.log(
      `[${result.meta?.lastJobRun}] ${result.meta?.lastFlaggedCount ?? items.length} mail gắn cờ, ${matched} mail có đề xuất từ kho kiến thức.`
    );
  } catch (e) {
    console.error("Job lỗi:", e.message);
  }
}

await once();

if (process.argv.includes("--watch")) {
  // Dùng setTimeout đệ quy (không setInterval) để mỗi vòng đọc lại chu kỳ từ rules.json
  // -> đổi "chu kỳ quét" trên trang Cấu hình rule tự động có hiệu lực ngay vòng kế tiếp.
  console.log(`Watch mode: chạy lại mỗi ${intervalMinutes()} phút (Ctrl+C để dừng).`);
  const loop = () => {
    const minutes = intervalMinutes();
    setTimeout(async () => {
      await once();
      loop();
    }, minutes * 60000);
  };
  loop();
}
