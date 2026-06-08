import { NextResponse } from "next/server";
import { verifyCredentials } from "../../../../lib/auth.js";
import { signSession, SESSION_COOKIE } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { username, password } = await req.json();
  const user = verifyCredentials((username || "").trim(), password || "");
  if (!user) {
    return NextResponse.json({ error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
  }
  const token = await signSession(user); // { username, name, role, menus }
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
