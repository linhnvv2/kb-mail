// Quản lý tài khoản (chạy phía Node) — mật khẩu băm scrypt + muối, lưu data/users.json.
// users.json: { [username]: { name, hash, role: 'admin'|'user', menus: [...], createdAt, updatedAt } }
// - role 'admin': toàn quyền (mọi menu) + quản lý user. Trường menus bị bỏ qua.
// - role 'user' : chỉ các menu trong `menus`.
import crypto from "node:crypto";
import { readJson, writeJson } from "./store.js";
import { MENU_PATHS } from "./menus.js";

const FILE = "users.json";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [, salt, hashHex] = stored.split("$");
    const calc = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hashHex, "hex");
    return calc.length === expected.length && crypto.timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}

export function getUsers() {
  return readJson(FILE, {});
}

export function getUser(username) {
  return getUsers()[username] || null;
}

// Menu thực tế của một user (admin = tất cả)
export function effectiveMenus(user) {
  if (!user) return [];
  return user.role === "admin" ? [...MENU_PATHS] : (user.menus || []);
}

// Thông tin công khai (đưa vào token / trả cho client) — không kèm hash
export function publicUser(username, user = getUser(username)) {
  if (!user) return null;
  return { username, name: user.name || username, role: user.role || "user", menus: effectiveMenus(user) };
}

// Trả về publicUser nếu đúng mật khẩu, ngược lại null
export function verifyCredentials(username, password) {
  const u = getUser(username);
  if (!u || !verifyPassword(password, u.hash)) return null;
  return publicUser(username, u);
}

// Tạo mới hoặc cập nhật. Bỏ trống password khi sửa để giữ mật khẩu cũ.
export function upsertUser(username, { password, name, role, menus } = {}) {
  username = (username || "").trim();
  if (!username) throw new Error("Thiếu tên đăng nhập");
  const users = getUsers();
  const existing = users[username];
  const hash = password ? hashPassword(password) : existing?.hash;
  if (!hash) throw new Error("Tài khoản mới cần mật khẩu");
  const finalRole = role ?? existing?.role ?? "user";
  users[username] = {
    name: name ?? existing?.name ?? username,
    hash,
    role: finalRole,
    menus: finalRole === "admin" ? [] : (menus ?? existing?.menus ?? []),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILE, users);
  return publicUser(username, users[username]);
}

export function deleteUser(username) {
  const users = getUsers();
  delete users[username];
  writeJson(FILE, users);
}

// Danh sách user (không kèm hash) cho trang quản trị
export function listUsers() {
  return Object.entries(getUsers()).map(([username, u]) => ({
    username,
    name: u.name || username,
    role: u.role || "user",
    menus: u.role === "admin" ? [...MENU_PATHS] : (u.menus || []),
    updatedAt: u.updatedAt || u.createdAt || null,
  }));
}
