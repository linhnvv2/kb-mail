import { NextResponse } from "next/server";
import { tutorChat } from "../../../lib/llm.js";
import { getThreadsWithKb } from "../../../lib/store.js";
import { matchKnowledge } from "../../../lib/match.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Gia sư: hỏi đáp về kho kiến thức. Tự tìm các luồng liên quan theo câu hỏi rồi đưa vào ngữ cảnh LLM.
export async function POST(req) {
  const { question, chatHistory = [] } = await req.json();
  if (!question?.trim()) {
    return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });
  }
  try {
    const { threads } = getThreadsWithKb();
    // dùng lại thuật toán so khớp của job để lấy kiến thức liên quan nhất
    const matched = matchKnowledge({ subject: question, bodyText: question }, threads, 5);
    const byId = new Map(threads.map((t) => [t.conversationId, t]));
    const kbThreads = matched
      .map((m) => byId.get(m.conversationId) && { ...byId.get(m.conversationId), score: m.score })
      .filter(Boolean);

    const answer = await tutorChat({ question, chatHistory, kbThreads });
    return NextResponse.json({
      answer,
      sources: kbThreads.map((t) => ({ subject: t.subject, tags: t.tags || [], score: t.score })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Không gọi được LLM: " + e.message + ". Kiểm tra LLM_BASE_URL trong .env (LM Studio cần bật Local Server)." },
      { status: 500 }
    );
  }
}
