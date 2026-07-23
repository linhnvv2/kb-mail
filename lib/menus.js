// Danh sách menu dùng chung (Nav, trang quản trị, middleware). Pure data — Edge-safe.
export const MENUS = [
  { path: "/", label: "📚 Quản lý kiến thức" },
  { path: "/inbox", label: "📥 Inbox" },
  { path: "/tasks", label: "🗂️ Task" },
  { path: "/suggestions", label: "✉️ Hỗ trợ trả lời" },
  { path: "/rules", label: "⚙️ Cấu hình rule tự động" },
  { path: "/history", label: "📜 Lịch sử & báo cáo" },
  { path: "/report", label: "📊 Báo cáo trực quan" },
];

export const MENU_PATHS = MENUS.map((m) => m.path);

// Ánh xạ một đường dẫn (trang hoặc API) về menu mà nó thuộc về.
// Trả về null nếu không gắn với menu nào (cho mọi user đã đăng nhập, vd /api/tutor).
const API_MENU = {
  "/api/threads": "/", "/api/kb": "/", "/api/classify": "/", "/api/import-msg": "/",
  "/api/imports": "/", "/api/fetch-folder": "/", "/api/tag-config": "/",
  "/api/inbox": "/inbox",
  "/api/tasks": "/tasks",
  "/api/suggestions": "/suggestions", "/api/chat": "/suggestions", "/api/draft": "/suggestions",
  "/api/auto-draft": "/suggestions", "/api/send-mail": "/suggestions", "/api/unflag": "/suggestions",
  "/api/rules": "/rules",
  "/api/history": "/history", "/api/report": "/report",
};

export function routeMenu(pathname) {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/inbox")) return "/inbox";
  if (pathname.startsWith("/tasks")) return "/tasks";
  if (pathname.startsWith("/suggestions")) return "/suggestions";
  if (pathname.startsWith("/rules")) return "/rules";
  if (pathname.startsWith("/history")) return "/history";
  if (pathname.startsWith("/report")) return "/report";
  for (const prefix in API_MENU) if (pathname.startsWith(prefix)) return API_MENU[prefix];
  return null;
}
