import { NextResponse } from "next/server";
import { supportChat } from "../../../lib/llm.js";
import { createReplyDraft } from "../../../lib/graph.js";
import { getHistory, getThreadsWithKb, updateHistoryItem } from "../../../lib/store.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COMPOSE_Q =
  "Hãy soạn NỘI DUNG MAIL TRẢ LỜI hoàn chỉnh cho email đang xử lý, dựa vào các lần hỗ trợ trước (kiến thức bên trên). " +
  "Yêu cầu văn phong:\n" +
  "- Viết tự nhiên như một người thật trong team hỗ trợ kỹ thuật đang trả lời đồng nghiệp, KHÔNG máy móc.\n" +
  "- Mở đầu bằng lời chào phù hợp (vd: \"Dear anh/chị,\" hoặc \"Chào <tên người gửi>,\").\n" +
  "- Nêu rõ HƯỚNG XỬ LÝ cụ thể: các bước/cách giải quyết vấn đề, dựa trên giải pháp trong kiến thức đã khớp. Nếu cần thêm thông tin thì hỏi lại lịch sự.\n" +
  "- Kết thúc bằng lời cảm ơn và chữ ký ngắn gọn (vd: \"Trân trọng,\\nTeam Hỗ trợ ISC\").\n" +
  "- Tiếng Việt, ngắn gọn, đúng trọng tâm. CHỈ trả về nội dung mail, KHÔNG kèm chú thích hay tiêu đề \"Nội dung:\".";

// Tự động soạn nội dung trả lời (AI) + lưu nháp hệ thống + lưu nháp vào Outlook
export async function POST(req) {
  const { messageId } = await req.json();
  if (!messageId) return NextResponse.json({ error: "Thiếu messageId" }, { status: 400 });

  const h = getHistory();
  const item = h.items[messageId];
  if (!item) return NextResponse.json({ error: "Không tìm thấy mail" }, { status: 404 });
  if (item.status === "sent" || item.status === "dismissed") {
    return NextResponse.json({ error: "Mail đã gửi/đã bỏ, không soạn tự động." }, { status: 400 });
  }

  try {
    // Tra cứu kiến thức đã khớp
    const { threads } = getThreadsWithKb();
    const ids = new Set((item.matches || []).map((m) => m.conversationId));
    const matchedThreads = threads
      .filter((t) => ids.has(t.conversationId))
      .map((t) => ({
        ...t,
        score: item.matches.find((m) => m.conversationId === t.conversationId)?.score,
      }));

    // Soạn nội dung bằng AI
    const draft = (await supportChat({ question: COMPOSE_Q, incoming: item, matchedThreads })).trim();

    // Lưu nháp vào Outlook (loại chủ hộp thư khỏi To)
    const owner = (h.meta?.owner || "").toLowerCase();
    const extraTo = (item.to || []).filter((a) => a && a.toLowerCase() !== owner);
    const cc = item.cc || [];
    let savedToMail = false;
    let draftWebLink = null;
    try {
      const d = await createReplyDraft(messageId, draft, { extraTo, cc });
      savedToMail = true;
      draftWebLink = d?.webLink || null;
    } catch (e) {
      // không lưu được vào Outlook vẫn giữ nháp trong hệ thống
    }

    const updated = updateHistoryItem(messageId, {
      draft,
      status: "ai_drafted",
      autoDraftedAt: new Date().toISOString(),
      draftSavedToMail: savedToMail,
      ...(draftWebLink && { draftWebLink }),
    });
    return NextResponse.json({ ok: true, savedToMail, item: updated });
  } catch (e) {
    return NextResponse.json(
      { error: "Soạn tự động lỗi: " + e.message },
      { status: 500 }
    );
  }
}
