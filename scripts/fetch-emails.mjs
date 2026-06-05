// Đọc mail theo folder, gom full luồng theo conversationId, lưu vào data/imports
// Chạy: GRAPH_TOKEN=... MAIL_FOLDER="Inbox/AI" node scripts/fetch-emails.mjs
import "./load-env.mjs";
import { buildFolderImport } from "../lib/ingest.js";
import { saveImport } from "../lib/store.js";

const folderName = process.env.MAIL_FOLDER || "Inbox";
const days = parseInt(process.env.MAIL_DAYS || "30", 10);

console.log(`Đọc folder "${folderName}" (${days} ngày gần nhất)...`);
const payload = await buildFolderImport(folderName, days, (i, total, thread) => {
  console.log(`  [${i}/${total}] ${thread.subject} (${thread.messageCount} mail)`);
});

const file = saveImport(payload, folderName);
console.log(`Đã lưu ${payload.threads.length} luồng vào data/imports/${file}`);
