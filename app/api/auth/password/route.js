import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "../../../../lib/session.js";
import { getUser, verifyPassword, upsertUser } from "../../../../lib/auth.js";

export const dynamic = "force-dynamic";

// Đổi mật khẩu của chính tài khoản đang đăng nhập (cần mật khẩu hiện tại).
export async function POST(req) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || String(newPassword).length < 6) {
    return NextResponse.json({ error: "Mật khẩu mới tối thiểu 6 ký tự" }, { status: 400 });
  }

  const u = getUser(sess.username);
  if (!u || !verifyPassword(currentPassword || "", u.hash)) {
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 400 });
  }

  upsertUser(sess.username, { password: newPassword });
  return NextResponse.json({ ok: true });
}
