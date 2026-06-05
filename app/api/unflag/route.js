import { NextResponse } from "next/server";
import { unflagMessage } from "../../../lib/graph.js";
import { getHistory, saveHistory } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Bỏ cờ mail trong Outlook + chuyển trạng thái "dismissed" (đã bỏ) — rời danh sách hỗ trợ
// nhưng vẫn lưu lại để vào báo cáo/thống kê.
export async function POST(req) {
  const { messageId } = await req.json();
  if (!messageId) return NextResponse.json({ error: "Thiếu messageId" }, { status: 400 });
  try {
    await unflagMessage(messageId);
    const h = getHistory();
    if (h.items[messageId]) {
      h.items[messageId].status = "dismissed";
      h.items[messageId].dismissedAt = new Date().toISOString();
      saveHistory(h);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
