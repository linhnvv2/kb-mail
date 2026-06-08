import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

// Thông tin người dùng đang đăng nhập (Nav dùng để hiển thị menu được phép + nút đăng xuất).
// Đọc từ token (cùng nguồn với middleware) — đổi quyền cần đăng nhập lại để áp dụng.
export async function GET() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { username: sess.username, name: sess.name || sess.username, role: sess.role, menus: sess.menus },
  });
}
