// Cấu hình chỉnh được lúc chạy (lưu data/settings.json), ưu tiên hơn biến .env.
// Hiện dùng cho GRAPH_TOKEN: admin cập nhật trong trang quản trị mà không cần restart.
import { readJson, writeJson } from "./store.js";

const FILE = "settings.json";

export function getSettings() {
  return readJson(FILE, {});
}

// Token Graph đang dùng: ưu tiên giá trị admin đã lưu, nếu chưa có thì lấy từ .env
export function getGraphToken() {
  const s = getSettings();
  return (s.graphToken && String(s.graphToken).trim()) || process.env.GRAPH_TOKEN || "";
}

// Trạng thái token để hiển thị (không lộ token đầy đủ)
export function getGraphTokenStatus() {
  const s = getSettings();
  const fromSettings = !!(s.graphToken && String(s.graphToken).trim());
  const token = getGraphToken();
  return {
    set: !!token,
    source: fromSettings ? "settings" : token ? "env" : "none",
    masked: maskToken(token),
    length: token.length,
    updatedAt: s.graphTokenUpdatedAt || null,
    updatedBy: s.graphTokenUpdatedBy || null,
  };
}

export function setGraphToken(token, by = null) {
  const s = getSettings();
  s.graphToken = String(token || "").trim();
  s.graphTokenUpdatedAt = new Date().toISOString();
  s.graphTokenUpdatedBy = by || null;
  writeJson(FILE, s);
  return getGraphTokenStatus();
}

function maskToken(t) {
  if (!t) return "";
  if (t.length <= 12) return "•".repeat(t.length);
  return t.slice(0, 6) + "…" + t.slice(-4);
}
