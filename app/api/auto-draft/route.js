import { NextResponse } from "next/server";
import { autoProcess } from "../../../lib/autoReply.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Tự động soạn nội dung trả lời (AI) + lưu nháp hệ thống + lưu nháp vào Outlook.
// Logic soạn/lưu nằm trong lib/autoReply.js (dùng chung với job nền).
export async function POST(req) {
  const { messageId } = await req.json();
  if (!messageId) return NextResponse.json({ error: "Thiếu messageId" }, { status: 400 });

  try {
    const { savedToMail, item } = await autoProcess(messageId, { send: false });
    return NextResponse.json({ ok: true, savedToMail, item });
  } catch (e) {
    const known = ["Không tìm thấy mail", "Mail đã gửi/đã bỏ, không xử lý tự động."];
    const status = known.includes(e.message) ? (e.message.startsWith("Không") ? 404 : 400) : 500;
    return NextResponse.json(
      { error: status === 500 ? "Soạn tự động lỗi: " + e.message : e.message },
      { status }
    );
  }
}
