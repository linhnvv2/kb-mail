import { fetchFlaggedMessages, fetchUnreadFolderMessages, getMyAddress } from "./graph.js";
import { matchKnowledge } from "./match.js";
import { getThreadsWithKb, getHistory, saveHistory, getRules } from "./store.js";
import { evaluateRules } from "./rules.js";
import { autoProcess } from "./autoReply.js";

const INBOX_MAX_PER_RUN = 15; // cap số mail inbox tự xử lý (soạn nháp) mỗi vòng quét

// Job: quét mail (gắn cờ và/hoặc inbox chưa đọc) → so khớp kho kiến thức → ghi lịch sử → áp rule.
// Nguồn quét theo cấu hình rules.json: "flagged" (mặc định) hoặc "inbox" (kèm xử lý gắn cờ).
// Trạng thái: pending → ai_drafted (rule lưu nháp) → approved → sent (đã gửi / rule tự gửi).
export async function runFlagJob() {
  const rulesData = getRules();
  const scanInbox = rulesData.scanSource === "inbox";
  const { threads } = getThreadsWithKb();
  const h = getHistory();

  // ===== 1. Mail gắn cờ (luôn xử lý — giữ nguyên luồng hỗ trợ thủ công) =====
  const flagged = await fetchFlaggedMessages();
  const flaggedIds = new Set(flagged.map((m) => m.id));

  for (const m of flagged) {
    const matches = matchKnowledge(m, threads);
    const existing = h.items[m.id];
    if (existing) {
      if (existing.status !== "sent") {
        existing.matches = matches;
        existing.to = m.to;
        existing.cc = m.cc;
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
        source: "flagged",
        createdAt: new Date().toISOString(),
      };
    }
  }

  // Dọn mail "pending"/"ai_drafted" GẮN CỜ không còn cờ -> danh sách khớp hộp thư hiện tại.
  // Bỏ qua item nguồn inbox (không gắn cờ nên không nằm trong flaggedIds).
  for (const [id, item] of Object.entries(h.items)) {
    if (
      item.source !== "inbox" &&
      (item.status === "pending" || item.status === "ai_drafted") &&
      !flaggedIds.has(id)
    ) {
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
  saveHistory(h); // lưu trước khi áp rule: autoProcess đọc/ghi history qua store

  // Rule trên mail gắn cờ: cho phép cả tự gửi thật (action "reply")
  await applyRules(flagged, h, rulesData, { allowSend: true });

  // ===== 2. Inbox chưa đọc (nếu bật) — rule CHỈ LƯU NHÁP, không bao giờ tự gửi =====
  if (scanInbox) {
    try {
      const inbox = await fetchUnreadFolderMessages(rulesData.scanFolder); // mặc định: chỉ mail hôm nay
      await applyRulesInbox(inbox, threads, rulesData);
    } catch (e) {
      console.error(`[rule] quét inbox lỗi: ${e.message}`);
    }
  }

  return getHistory();
}

function enabledRules(rulesData) {
  return (rulesData.rules || []).some((r) => r && r.enabled !== false);
}

// Áp rule cho mail gắn cờ đang chờ, chưa từng được rule động tới.
async function applyRules(flagged, h, rulesData, { allowSend }) {
  if (!enabledRules(rulesData)) return;

  for (const m of flagged) {
    const item = h.items[m.id];
    if (!item || item.status !== "pending" || item.ruleId || item.autoDraftedAt || item.autoSent) {
      continue;
    }
    const rule = evaluateRules(m, item.matches, rulesData);
    if (!rule || !rule.action || rule.action === "none") continue;
    if (rule.requireKnowledgeMatch !== false && !(item.matches || []).length) continue;

    const send = allowSend && rule.action === "reply";
    try {
      const res = await autoProcess(m.id, {
        send,
        ruleTo: rule.to || [],
        ruleCc: rule.cc || [],
        unflag: send && rule.unflagAfterSend !== false,
        rule,
      });
      console.log(
        `[rule] mail "${m.subject || "(không tiêu đề)"}" khớp rule "${rule.name}" -> ` +
          (res.sent ? "ĐÃ GỬI" : "đã lưu nháp")
      );
    } catch (e) {
      console.error(`[rule] lỗi xử lý mail "${m.subject}" với rule "${rule.name}": ${e.message}`);
    }
  }
}

// Áp rule cho mail INBOX chưa đọc: tạo bản ghi lịch sử + soạn nháp (KHÔNG tự gửi).
// Dedup theo messageId (đã có trong history -> bỏ qua). Cap INBOX_MAX_PER_RUN mỗi vòng.
async function applyRulesInbox(messages, threads, rulesData) {
  if (!enabledRules(rulesData)) return;
  let processed = 0;
  let skippedForCap = 0;

  for (const m of messages) {
    const h = getHistory();
    if (h.items[m.id]) continue; // đã xử lý ở vòng trước

    const matches = matchKnowledge(m, threads);
    const rule = evaluateRules(m, matches, rulesData);
    if (!rule || !rule.action || rule.action === "none") continue;
    if (rule.requireKnowledgeMatch !== false && !matches.length) continue;

    if (processed >= INBOX_MAX_PER_RUN) {
      skippedForCap++;
      continue;
    }

    // Ghi bản ghi lịch sử trước (autoProcess đọc item theo messageId)
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
      draft: "",
      status: "pending",
      source: "inbox",
      createdAt: new Date().toISOString(),
    };
    saveHistory(h);

    try {
      await autoProcess(m.id, {
        send: false, // inbox: chỉ lưu nháp, không bao giờ tự gửi
        ruleTo: rule.to || [],
        ruleCc: rule.cc || [],
        rule,
      });
      processed++;
      console.log(`[rule] inbox: mail "${m.subject || "(không tiêu đề)"}" khớp rule "${rule.name}" -> đã lưu nháp`);
    } catch (e) {
      console.error(`[rule] inbox: lỗi xử lý "${m.subject}" với rule "${rule.name}": ${e.message}`);
    }
  }

  if (skippedForCap) {
    console.log(`[rule] inbox: đã đạt cap ${INBOX_MAX_PER_RUN} mail/vòng, còn ${skippedForCap} mail khớp sẽ xử lý ở vòng sau.`);
  }
}
