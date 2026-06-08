import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session.js";
import { routeMenu } from "./lib/menus.js";

// Bảo vệ toàn bộ trang & API (trừ /login và /api/auth/*):
// - chưa đăng nhập         -> trang: redirect /login?next=... | API: 401
// - vùng admin (/admin, /api/users) -> chỉ role 'admin'
// - menu không được gán    -> trang: redirect về menu đầu tiên được phép | API: 403
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sess = token ? await verifySession(token) : null;
  const isApi = pathname.startsWith("/api/");

  if (!sess) {
    if (isApi) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isAdmin = sess.role === "admin";
  const allowed = isAdmin ? null : sess.menus || [];
  const fallback = isAdmin ? "/" : allowed[0] || null;

  const deny = () => {
    if (isApi) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = fallback || "/login";
    url.search = "";
    return NextResponse.redirect(url);
  };

  // Vùng quản trị
  if (pathname === "/admin" || pathname.startsWith("/api/users") || pathname.startsWith("/api/settings")) {
    return isAdmin ? NextResponse.next() : deny();
  }

  // Phân quyền theo menu
  const menu = routeMenu(pathname);
  if (menu && !isAdmin && !allowed.includes(menu)) {
    return deny();
  }
  return NextResponse.next();
}

// Bỏ qua nội bộ Next và file tĩnh (có dấu chấm trong đường dẫn)
export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.).*)"],
};
