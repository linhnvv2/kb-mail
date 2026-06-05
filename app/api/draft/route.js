import { NextResponse } from "next/server";
import { updateHistoryItem } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Lưu nháp trả lời / duyệt OK / bỏ duyệt
export async function POST(req) {
  const { messageId, draft, status } = await req.json();
  if (!messageId) return NextResponse.json({ error: "Thiếu messageId" }, { status: 400 });
  const patch = {};
  if (draft !== undefined) patch.draft = draft;
  if (status === "approved") {
    patch.status = "approved";
    patch.approvedAt = new Date().toISOString();
  } else if (status === "pending") {
    patch.status = "pending";
  }
  const item = updateHistoryItem(messageId, patch);
  if (!item) return NextResponse.json({ error: "Không tìm thấy mail trong lịch sử" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}
