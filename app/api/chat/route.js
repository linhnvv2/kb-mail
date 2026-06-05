import { NextResponse } from "next/server";
import { supportChat } from "../../../lib/llm.js";
import { getHistory, getThreadsWithKb } from "../../../lib/store.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// AI chat: hỏi đáp dựa trên các lần hỗ trợ trước để soạn trả lời phù hợp
export async function POST(req) {
  const { messageId, question, chatHistory = [] } = await req.json();
  if (!question?.trim()) {
    return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });
  }
  try {
    let incoming = null;
    let matchedThreads = [];
    if (messageId) {
      incoming = getHistory().items[messageId] || null;
      if (incoming) {
        const { threads } = getThreadsWithKb();
        const ids = new Set((incoming.matches || []).map((m) => m.conversationId));
        matchedThreads = threads
          .filter((t) => ids.has(t.conversationId))
          .map((t) => ({
            ...t,
            score: incoming.matches.find((m) => m.conversationId === t.conversationId)?.score,
          }));
      }
    }
    const answer = await supportChat({ question, chatHistory, incoming, matchedThreads });
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json(
      { error: "Không gọi được LLM: " + e.message + ". Kiểm tra LLM_BASE_URL trong .env (LM Studio cần bật Local Server)." },
      { status: 500 }
    );
  }
}
