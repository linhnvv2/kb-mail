"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Quản lý kiến thức"],
  ["/suggestions", "Hỗ trợ trả lời"],
  ["/history", "Lịch sử & báo cáo"],
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="topnav">
      <span className="brand">📚 KB Mail</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={pathname === href ? "active" : ""}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
