"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MENUS } from "../lib/menus.js";

export default function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, [pathname]);

  // Đóng menu mỗi khi chuyển trang
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (pathname === "/login") return null;

  const isAdmin = user?.role === "admin";
  const links = MENUS.filter((m) => isAdmin || (user?.menus || []).includes(m.path));

  return (
    <nav className={`topnav${open ? " open" : ""}`}>
      <div className="topnav-bar">
        <span className="brand">📚 KB Mail</span>
        <button
          className="nav-toggle"
          aria-label="Mở menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      <div className="topnav-menu">
        {links.map((m) => (
          <Link key={m.path} href={m.path} className={pathname === m.path ? "active" : ""}>
            {m.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href="/admin" className={pathname === "/admin" ? "active" : ""}>🛠️ Quản trị</Link>
        )}
        {user && (
          <span className="nav-user">
            <span title={user.username}>👤 {user.name}{isAdmin ? " (admin)" : ""}</span>
            <button className="nav-logout" onClick={logout}>Đăng xuất</button>
          </span>
        )}
      </div>
    </nav>
  );
}
