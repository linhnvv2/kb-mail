import { NextResponse } from "next/server";
import { readJson, writeJson, deleteThread } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Xóa một luồng khỏi kho kiến thức (ẩn khỏi danh sách + bỏ tag/summary/solution)
export async function DELETE(req) {
  const { conversationId } = await req.json();
  if (!conversationId) {
    return NextResponse.json({ error: "Thiếu conversationId" }, { status: 400 });
  }
  deleteThread(conversationId);
  return NextResponse.json({ ok: true });
}

// Lưu tags / summary / solution cho một luồng
export async function POST(req) {
  const { conversationId, tags, summary, solution } = await req.json();
  if (!conversationId) {
    return NextResponse.json({ error: "Thiếu conversationId" }, { status: 400 });
  }
  const kb = readJson("knowledge.json", {});
  kb[conversationId] = {
    ...(kb[conversationId] || {}),
    ...(tags !== undefined && { tags }),
    ...(summary !== undefined && { summary }),
    ...(solution !== undefined && { solution }),
    updatedAt: new Date().toISOString(),
  };
  writeJson("knowledge.json", kb);
  return NextResponse.json({ ok: true });
}
