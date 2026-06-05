import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const IMPORTS_DIR = path.join(DATA_DIR, "imports");

function ensureDirs() {
  if (!fs.existsSync(IMPORTS_DIR)) fs.mkdirSync(IMPORTS_DIR, { recursive: true });
}

export function readJson(name, fallback) {
  ensureDirs();
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(name, data) {
  ensureDirs();
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), "utf8");
}

// ===== Imports: mỗi lần nạp/fetch lưu thành một file riêng trong data/imports =====
export function saveImport(data, label = "") {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safe = label.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
  const name = `emails-${stamp}${safe ? "-" + safe : ""}.json`;
  fs.writeFileSync(path.join(IMPORTS_DIR, name), JSON.stringify(data, null, 2), "utf8");
  return name;
}

export function listImports() {
  ensureDirs();
  const files = fs.readdirSync(IMPORTS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(IMPORTS_DIR, f), "utf8"));
        return {
          file: f,
          folder: j.folder || "",
          exportedAt: j.exportedAt || null,
          threadCount: (j.threads || []).length,
        };
      } catch {
        return { file: f, folder: "?", exportedAt: null, threadCount: 0 };
      }
    })
    .sort((a, b) => (b.exportedAt || b.file).localeCompare(a.exportedAt || a.file));
}

function readAllImportThreads() {
  ensureDirs();
  const threads = [];
  // tương thích ngược: data/emails.json cũ
  const legacy = readJson("emails.json", null);
  if (legacy?.threads) threads.push(...legacy.threads);
  for (const f of fs.readdirSync(IMPORTS_DIR).filter((x) => x.endsWith(".json"))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(IMPORTS_DIR, f), "utf8"));
      for (const t of j.threads || []) threads.push({ ...t, _import: f });
    } catch {}
  }
  return threads;
}

// Gộp mọi file import, khử trùng lặp theo conversationId (giữ bản nhiều mail nhất)
export function getThreadsWithKb() {
  const all = readAllImportThreads();
  const byConv = new Map();
  for (const t of all) {
    const prev = byConv.get(t.conversationId);
    if (!prev || (t.messages?.length || 0) >= (prev.messages?.length || 0)) {
      byConv.set(t.conversationId, t);
    }
  }
  const kb = readJson("knowledge.json", {});
  const deleted = new Set(getDeleted());
  const threads = [...byConv.values()]
    .filter((t) => !deleted.has(t.conversationId)) // ẩn luồng đã xóa khỏi kho kiến thức
    .map((t) => ({
      ...t,
      tags: kb[t.conversationId]?.tags ?? t.tags ?? [],
      summary: kb[t.conversationId]?.summary ?? t.summary ?? "",
      solution: kb[t.conversationId]?.solution ?? t.solution ?? "",
    }))
    .sort((a, b) => (b.lastReceived || "").localeCompare(a.lastReceived || ""));
  return { threads, imports: listImports() };
}

// ===== Luồng đã xóa khỏi kho kiến thức: data/deleted.json [conversationId] =====
// Lưu theo conversationId để luồng không hiện lại sau lần fetch/nạp sau.
export function getDeleted() {
  return readJson("deleted.json", []);
}

// Xóa một luồng khỏi kho kiến thức: ẩn khỏi danh sách + bỏ tag/summary/solution.
// Trả về false nếu conversationId trống.
export function deleteThread(conversationId) {
  if (!conversationId) return false;
  const deleted = new Set(getDeleted());
  deleted.add(conversationId);
  writeJson("deleted.json", [...deleted]);
  const kb = readJson("knowledge.json", {});
  if (kb[conversationId]) {
    delete kb[conversationId];
    writeJson("knowledge.json", kb);
  }
  return true;
}

// Khôi phục luồng đã xóa (bỏ khỏi danh sách ẩn)
export function restoreThread(conversationId) {
  const next = getDeleted().filter((id) => id !== conversationId);
  writeJson("deleted.json", next);
  return true;
}

// ===== Cấu hình người nhận theo tag: data/tag-config.json { [tag]: { to: [], cc: [] } } =====
export function getTagConfig() {
  return readJson("tag-config.json", {});
}

export function saveTagConfig(cfg) {
  writeJson("tag-config.json", cfg);
}

// ===== Lịch sử hỗ trợ: data/history.json { meta, items: { [messageId]: {...} } } =====
export function getHistory() {
  return readJson("history.json", { meta: { lastJobRun: null }, items: {} });
}

export function saveHistory(h) {
  writeJson("history.json", h);
}

export function updateHistoryItem(messageId, patch) {
  const h = getHistory();
  if (!h.items[messageId]) return null;
  h.items[messageId] = { ...h.items[messageId], ...patch };
  saveHistory(h);
  return h.items[messageId];
}
