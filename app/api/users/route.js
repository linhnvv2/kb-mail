import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "../../../lib/session.js";
import { listUsers, upsertUser, deleteUser, getUser } from "../../../lib/auth.js";
import { MENU_PATHS } from "../../../lib/menus.js";

export const dynamic = "force-dynamic";

// Xác minh người gọi là admin (middleware đã chặn, đây là lớp phòng vệ thứ hai)
async function requireAdmin() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const sess = token ? await verifySession(token) : null;
  return sess && sess.role === "admin" ? sess : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ users: listUsers(), menus: MENU_PATHS });
}

// Tạo mới / cập nhật user (mật khẩu để trống khi sửa = giữ nguyên)
export async function POST(req) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  try {
    const { username, password, name, role, menus } = await req.json();
    const cleanMenus = Array.isArray(menus) ? menus.filter((m) => MENU_PATHS.includes(m)) : undefined;
    const user = upsertUser(username, { password, name, role, menus: cleanMenus });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const { username } = await req.json();
  if (!username) return NextResponse.json({ error: "Thiếu username" }, { status: 400 });
  if (username === admin.username) {
    return NextResponse.json({ error: "Không thể tự xóa tài khoản đang đăng nhập" }, { status: 400 });
  }
  if (!getUser(username)) return NextResponse.json({ error: "Tài khoản không tồn tại" }, { status: 404 });
  deleteUser(username);
  return NextResponse.json({ ok: true });
}
