// Logic soạn nội dung trả lời bằng AI rồi lưu nháp (Outlook) hoặc gửi thật.
// Dùng chung cho: route /api/auto-draft (lưu nháp thủ công) và job nền (rule tự xử lý).
import { supportChat } from "./llm.js";
import { createReplyDraft, replyToMessage, unflagMessage } from "./graph.js";
import { getHistory, getThreadsWithKb, updateHistoryItem } from "./store.js";

export const COMPOSE_Q =
  "Hãy soạn NỘI DUNG MAIL TRẢ LỜI hoàn chỉnh cho email đang xử lý, dựa vào các lần hỗ trợ trước (kiến thức bên trên). " +
  "Yêu cầu văn phong:\n" +
  "- Viết tự nhiên như một người thật trong team hỗ trợ kỹ thuật đang trả lời đồng nghiệp, KHÔNG máy móc.\n" +
  '- Mở đầu bằng lời chào phù hợp (vd: "Dear anh/chị," hoặc "Chào <tên người gửi>,").\n' +
  "- Nêu rõ HƯỚNG XỬ LÝ cụ thể: các bước/cách giải quyết vấn đề, dựa trên giải pháp trong kiến thức đã khớp. Nếu cần thêm thông tin thì hỏi lại lịch sự.\n" +
  '- Kết thúc bằng lời cảm ơn và chữ ký ngắn gọn (vd: "Trân trọng,\\nTeam Hỗ trợ ISC").\n' +
  '- Tiếng Việt, ngắn gọn, đúng trọng tâm. CHỈ trả về nội dung mail, KHÔNG kèm chú thích hay tiêu đề "Nội dung:".';

// Dựng danh sách kiến thức đã khớp (kèm điểm) cho một history item.
function matchedThreadsFor(item) {
  const { threads } = getThreadsWithKb();
  const ids = new Set((item.matches || []).map((m) => m.conversationId));
  return threads
    .filter((t) => ids.has(t.conversationId))
    .map((t) => ({
      ...t,
      score: item.matches.find((m) => m.conversationId === t.conversationId)?.score,
    }));
}

// Gộp người nhận, bỏ chủ hộp thư & trùng lặp (so sánh không phân biệt hoa thường).
function mergeRecipients(base, extra, owner) {
  const seen = new Set();
  const out = [];
  for (const a of [...(base || []), ...(extra || [])]) {
    const key = (a || "").toLowerCase();
    if (!key || key === owner || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// Soạn AI rồi lưu nháp (send=false) hoặc gửi thật (send=true) cho một mail.
// opts: { send, ruleTo, ruleCc, unflag, rule }
// Trả về { ok, item, savedToMail?, sent? } hoặc ném lỗi.
export async function autoProcess(messageId, opts = {}) {
  const { send = false, ruleTo = [], ruleCc = [], unflag = false, rule = null } = opts;

  const h = getHistory();
  const item = h.items[messageId];
  if (!item) throw new Error("Không tìm thấy mail");
  if (item.status === "sent" || item.status === "dismissed") {
    throw new Error("Mail đã gửi/đã bỏ, không xử lý tự động.");
  }

  const matchedThreads = matchedThreadsFor(item);
  const draft = (await supportChat({ question: COMPOSE_Q, incoming: item, matchedThreads })).trim();

  const owner = (h.meta?.owner || "").toLowerCase();
  const extraTo = mergeRecipients(item.to, ruleTo, owner);
  const cc = mergeRecipients(item.cc, ruleCc, owner);

  const ruleInfo = rule ? { ruleId: rule.id, ruleName: rule.name } : {};

  if (send) {
    await replyToMessage(messageId, draft, { extraTo, cc });
    if (unflag) {
      try {
        await unflagMessage(messageId);
      } catch {
        /* bỏ cờ lỗi không ảnh hưởng việc đã gửi */
      }
    }
    const updated = updateHistoryItem(messageId, {
      draft,
      status: "sent",
      sentAt: new Date().toISOString(),
      autoSent: true,
      ...ruleInfo,
    });
    return { ok: true, sent: true, item: updated };
  }

  // Lưu nháp vào Outlook (giữ nháp hệ thống dù lưu Outlook lỗi)
  let savedToMail = false;
  let draftWebLink = null;
  try {
    const d = await createReplyDraft(messageId, draft, { extraTo, cc });
    savedToMail = true;
    draftWebLink = d?.webLink || null;
  } catch {
    /* không lưu được vào Outlook vẫn giữ nháp trong hệ thống */
  }

  const updated = updateHistoryItem(messageId, {
    draft,
    status: "ai_drafted",
    autoDraftedAt: new Date().toISOString(),
    draftSavedToMail: savedToMail,
    ...(draftWebLink && { draftWebLink }),
    ...ruleInfo,
  });
  return { ok: true, savedToMail, item: updated };
}
