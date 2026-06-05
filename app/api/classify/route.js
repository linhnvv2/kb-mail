import { NextResponse } from "next/server";
import { classifyThread } from "../../../lib/llm.js";
import { getThreadsWithKb, readJson, writeJson } from "../../../lib/store.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// AI tự phân loại luồng email qua LLM: sinh tags + summary + solution
// body: { conversationId } — 1 luồng, hoặc { all: true } — mọi luồng chưa có tag
export async function POST(req) {
  const { conversationId, all } = await req.json();
  const { threads } = getThreadsWithKb();
  const existingTags = [...new Set(threads.flatMap((t) => t.tags || []))];

  let targets = [];
  if (conversationId) {
    targets = threads.filter((t) => t.conversationId === conversationId);
  } else if (all) {
    targets = threads.filter((t) => !(t.tags || []).length);
  }
  if (!targets.length) {
    return NextResponse.json({ error: "Không có luồng nào cần phân loại" }, { status: 400 });
  }

  const kb = readJson("knowledge.json", {});
  const results = [];
  for (const t of targets) {
    try {
      const r = await classifyThread(t, existingTags);
      kb[t.conversationId] = {
        ...(kb[t.conversationId] || {}),
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        summary: String(r.summary || ""),
        // không ghi đè giải pháp đã nhập tay
        solution: kb[t.conversationId]?.solution || String(r.solution || ""),
        classifiedByAI: true,
        updatedAt: new Date().toISOString(),
      };
      writeJson("knowledge.json", kb);
      results.push({ conversationId: t.conversationId, ok: true, ...r });
    } catch (e) {
      results.push({ conversationId: t.conversationId, ok: false, error: e.message });
    }
  }
  return NextResponse.json({ results });
}
