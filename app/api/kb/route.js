import { NextResponse } from "next/server";
import { readJson, writeJson } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

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
