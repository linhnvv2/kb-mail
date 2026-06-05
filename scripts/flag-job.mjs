// Job: quét mail gắn cờ qua Graph API → so khớp kho kiến thức → data/suggestions.json
// Chạy 1 lần:  npm run job
// Chạy định kỳ: npm run job:watch  (chu kỳ JOB_INTERVAL_MINUTES, mặc định 10 phút)
import "./load-env.mjs";
import { runFlagJob } from "../lib/job.js";

async function once() {
  try {
    const result = await runFlagJob();
    const matched = result.items.filter((i) => i.matches.length > 0).length;
    console.log(
      `[${result.ranAt}] ${result.items.length} mail gắn cờ, ${matched} mail có đề xuất từ kho kiến thức.`
    );
  } catch (e) {
    console.error("Job lỗi:", e.message);
  }
}

await once();

if (process.argv.includes("--watch")) {
  const minutes = parseInt(process.env.JOB_INTERVAL_MINUTES || "10", 10);
  console.log(`Watch mode: chạy lại mỗi ${minutes} phút (Ctrl+C để dừng).`);
  setInterval(once, minutes * 60000);
}
