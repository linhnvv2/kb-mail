import "./globals.css";
import Nav from "./Nav";

export const metadata = {
  title: "Quản lý kiến thức email",
  description: "Hệ thống quản lý kiến thức & hỗ trợ trả lời email tự động",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
