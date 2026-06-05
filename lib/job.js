import { fetchFlaggedMessages, getMyAddress } from "./graph.js";
import { matchKnowledge } from "./match.js";
import { getThreadsWithKb, getHistory, saveHistory } from "./store.js";

// Job: lấy mail gắn cờ → so khớp kho kiến thức → ghi vào lịch sử hỗ trợ
// Trạng thái: pending (mới) → approved (đã duyệt OK) → sent (đã gửi trả lời)
export async function runFlagJob() {
  const flagged = await fetchFlaggedMessages();
  const { threads } = getThreadsWithKb();
  const h = getHistory();
  const flaggedIds = new Set(flagged.map((m) => m.id));

  for (const m of flagged) {
    const matches = matchKnowledge(m, threads);
    const existing = h.items[m.id];
    if (existing) {
      // cập nhật đề xuất + bổ sung To/CC khi chưa gửi
      if (existing.status !== "sent") {
        existing.matches = matches;
        existing.to = m.to;
        existing.cc = m.cc;
        // mail đã "bỏ" mà được gắn cờ lại -> khôi phục vào danh sách hỗ trợ
        if (existing.status === "dismissed") {
          existing.status = "pending";
          delete existing.dismissedAt;
        }
      }
    } else {
      h.items[m.id] = {
        messageId: m.id,
        conversationId: m.conversationId,
        from: m.from,
        to: m.to,
        cc: m.cc,
        subject: m.subject,
        receivedDateTime: m.receivedDateTime,
        bodyPreview: m.bodyText.slice(0, 500),
        matches,
        draft: matches[0]?.solution || "",
        status: "pending",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // Dọn mail "pending" không còn gắn cờ -> danh sách luôn khớp hộp thư hiện tại
  // (giữ nguyên approved/sent vì đang xử lý dở hoặc đã trả lời)
  for (const [id, item] of Object.entries(h.items)) {
    if ((item.status === "pending" || item.status === "ai_drafted") && !flaggedIds.has(id)) {
      delete h.items[id];
    }
  }

  h.meta.lastJobRun = new Date().toISOString();
  h.meta.lastFlaggedCount = flagged.length;
  try {
    h.meta.owner = await getMyAddress();
  } catch {
    /* không lấy được địa chỉ chủ hộp thư cũng không sao */
  }
  saveHistory(h);
  return h;
}
