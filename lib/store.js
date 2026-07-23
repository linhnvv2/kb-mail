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

// ===== Rule tự xử lý mail gắn cờ: data/rules.json { scanIntervalMinutes, rules: [...] } =====
// Mỗi rule tự quyết hành động (none/draft/reply); action "reply" gửi mail thật.
// scanIntervalMinutes: chu kỳ quét của job nền (null -> dùng JOB_INTERVAL_MINUTES/mặc định 10).
// scanSource: "flagged" (mail gắn cờ) | "inbox" (mail chưa đọc trong folder). scanFolder: folder cho chế độ inbox.
export function getRules() {
  return readJson("rules.json", {
    scanIntervalMinutes: null,
    scanSource: "flagged",
    scanFolder: "Inbox",
    rules: [],
  });
}

export function saveRules(data) {
  const n = Number(data?.scanIntervalMinutes);
  writeJson("rules.json", {
    scanIntervalMinutes: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
    scanSource: data?.scanSource === "inbox" ? "inbox" : "flagged",
    scanFolder: String(data?.scanFolder || "Inbox").trim() || "Inbox",
    rules: Array.isArray(data?.rules) ? data.rules : [],
  });
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

// Upsert 1 mail vào lịch sử hỗ trợ (dùng khi đánh dấu "Đã xử lý" từ Inbox).
// Giữ các field cũ nếu item đã tồn tại (không ghi đè draft/matches đã có nếu patch không kèm).
export function addHistoryItem(item = {}) {
  const { messageId } = item;
  if (!messageId) return null;
  const h = getHistory();
  const now = new Date().toISOString();
  const prev = h.items[messageId] || {};
  h.items[messageId] = {
    ...prev,
    ...item,
    messageId,
    createdAt: prev.createdAt || now,
    updatedAt: now,
  };
  saveHistory(h);
  return h.items[messageId];
}

// ===== Công việc (Task): data/tasks.json { items: [ {...} ] } =====
// Trạng thái: "todo" (chờ xử lý) | "doing" (đang làm) | "done" (hoàn thành).
// Task có thể tạo từ mail trong Inbox (kèm messageId/subject/from + nội dung gợi ý).
export function getTasks() {
  return readJson("tasks.json", { items: [] });
}

export function saveTasks(data) {
  writeJson("tasks.json", { items: Array.isArray(data?.items) ? data.items : [] });
}

const VALID_TASK_STATUS = new Set(["todo", "doing", "done"]);

export function addTask(input = {}) {
  const t = getTasks();
  const now = new Date().toISOString();
  const task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: String(input.title || "").trim() || "(công việc không tiêu đề)",
    note: String(input.note || ""),
    status: VALID_TASK_STATUS.has(input.status) ? input.status : "todo",
    // nguồn từ mail (tuỳ chọn)
    messageId: input.messageId || null,
    conversationId: input.conversationId || null,
    from: input.from || null,
    subject: input.subject || null,
    createdAt: now,
    updatedAt: now,
    doneAt: null,
  };
  t.items.unshift(task);
  saveTasks(t);
  return task;
}

export function updateTask(id, patch = {}) {
  const t = getTasks();
  const idx = t.items.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  const cur = t.items[idx];
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  if (patch.status && !VALID_TASK_STATUS.has(patch.status)) next.status = cur.status;
  // đánh dấu thời điểm hoàn thành
  if (next.status === "done" && cur.status !== "done") next.doneAt = new Date().toISOString();
  if (next.status !== "done") next.doneAt = null;
  next.id = cur.id; // không cho đổi id
  t.items[idx] = next;
  saveTasks(t);
  return next;
}

// Xóa mềm: chuyển task vào SỌT RÁC (deleted=true) thay vì xóa hẳn.
export function deleteTask(id) {
  const t = getTasks();
  const idx = t.items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  t.items[idx] = {
    ...t.items[idx],
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveTasks(t);
  return true;
}

// Khôi phục task từ sọt rác về lại danh sách (giữ nguyên status cũ).
export function restoreTask(id) {
  const t = getTasks();
  const idx = t.items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const { deleted, deletedAt, ...rest } = t.items[idx];
  t.items[idx] = { ...rest, updatedAt: new Date().toISOString() };
  saveTasks(t);
  return true;
}

// Xóa VĨNH VIỄN 1 task khỏi sọt rác.
export function purgeTask(id) {
  const t = getTasks();
  const before = t.items.length;
  t.items = t.items.filter((x) => x.id !== id);
  if (t.items.length === before) return false;
  saveTasks(t);
  return true;
}

// Dọn sạch sọt rác (xóa vĩnh viễn tất cả task đã deleted).
export function emptyTaskTrash() {
  const t = getTasks();
  const removed = t.items.filter((x) => x.deleted).length;
  t.items = t.items.filter((x) => !x.deleted);
  saveTasks(t);
  return removed;
}

// ===== Ghi chú riêng của task (notes[]) — tách biệt với `note` (nội dung mail gốc) =====
// Mỗi ghi chú: { id, text, at }. Thêm/xóa từng cái, không đụng nội dung gốc.
export function addTaskNote(id, text) {
  const t = getTasks();
  const idx = t.items.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  const note = {
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: String(text || "").trim(),
    at: new Date().toISOString(),
  };
  if (!note.text) return null;
  const cur = t.items[idx];
  const notes = Array.isArray(cur.notes) ? cur.notes : [];
  t.items[idx] = { ...cur, notes: [...notes, note], updatedAt: new Date().toISOString() };
  saveTasks(t);
  return note;
}

export function deleteTaskNote(id, noteId) {
  const t = getTasks();
  const idx = t.items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const cur = t.items[idx];
  const notes = (cur.notes || []).filter((n) => n.id !== noteId);
  t.items[idx] = { ...cur, notes, updatedAt: new Date().toISOString() };
  saveTasks(t);
  return true;
}

// ===== Inbox cache: data/inbox-cache.json =====
// Lưu kết quả quét mail gần nhất + gợi ý AI đã sinh, để reload không mất.
// { fetchedAt, folder, items: {...}, drafts: { [messageId]: text }, sent: { [messageId]: iso } }
export function getInboxCache() {
  return readJson("inbox-cache.json", { fetchedAt: null, folder: "Inbox", items: [], drafts: {}, sent: {} });
}

export function saveInboxCache(cache) {
  const cur = getInboxCache();
  writeJson("inbox-cache.json", {
    fetchedAt: cache.fetchedAt ?? cur.fetchedAt,
    folder: cache.folder ?? cur.folder,
    items: Array.isArray(cache.items) ? cache.items : cur.items,
    drafts: cache.drafts ?? cur.drafts,
    sent: cache.sent ?? cur.sent,
  });
}

// Lưu gợi ý AI cho 1 mail (giữ lại các cái cũ)
export function saveInboxDraft(messageId, draft) {
  const c = getInboxCache();
  c.drafts = { ...c.drafts, [messageId]: draft };
  writeJson("inbox-cache.json", c);
  return c;
}

// Đánh dấu 1 mail đã gửi trả lời
export function markInboxSent(messageId) {
  const c = getInboxCache();
  c.sent = { ...c.sent, [messageId]: new Date().toISOString() };
  writeJson("inbox-cache.json", c);
  return c;
}

// Gỡ 1 mail khỏi danh sách inbox đã lưu (dọn thủ công mail đã xử lý xong).
export function removeInboxItem(messageId) {
  const c = getInboxCache();
  c.items = (c.items || []).filter((it) => it.messageId !== messageId);
  if (c.drafts) delete c.drafts[messageId];
  if (c.sent) delete c.sent[messageId];
  writeJson("inbox-cache.json", c);
  return c;
}
