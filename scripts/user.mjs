// Quản lý tài khoản đăng nhập (lưu data/users.json).
//   npm run user admin <username> <password> [tên]        -> tạo admin (toàn quyền)
//   npm run user add   <username> <password> [tên]        -> tạo user (mặc định mọi menu)
//   npm run user del   <username>
//   npm run user list
// Gán quyền menu chi tiết: dùng trang /admin trên giao diện.
import "./load-env.mjs";
import { upsertUser, deleteUser, listUsers } from "../lib/auth.js";
import { MENU_PATHS } from "../lib/menus.js";

const [cmd, a, b, ...rest] = process.argv.slice(2);
const name = rest.join(" ") || a;

if (cmd === "admin") {
  if (!a || !b) { console.error("Cách dùng: npm run user admin <username> <password> [tên]"); process.exit(1); }
  upsertUser(a, { password: b, name, role: "admin" });
  console.log(`✓ Đã tạo/cập nhật ADMIN: ${a}`);
} else if (cmd === "add") {
  if (!a || !b) { console.error("Cách dùng: npm run user add <username> <password> [tên]"); process.exit(1); }
  upsertUser(a, { password: b, name, role: "user", menus: [...MENU_PATHS] });
  console.log(`✓ Đã tạo/cập nhật user: ${a} (mặc định mọi menu — chỉnh quyền tại /admin)`);
} else if (cmd === "del") {
  if (!a) { console.error("Cách dùng: npm run user del <username>"); process.exit(1); }
  deleteUser(a);
  console.log(`✓ Đã xóa tài khoản: ${a}`);
} else if (cmd === "list") {
  const users = listUsers();
  console.log(users.length
    ? users.map((u) => `- ${u.username} [${u.role}] (${u.name}) → ${u.role === "admin" ? "toàn bộ" : (u.menus.join(", ") || "chưa gán")}`).join("\n")
    : "(chưa có tài khoản nào)");
} else {
  console.log("Lệnh: admin <u> <p> [tên] | add <u> <p> [tên] | del <u> | list");
}
