import { NextResponse } from "next/server";
import { fetchUnreadFolderMessages, replyToMessage, fetchConversation } from "../../../lib/graph.js";
import { matchKnowledge } from "../../../lib/match.js";
import { supportChat } from "../../../lib/llm.js";
import {
  getThreadsWithKb, getRules,
  getInboxCache, saveInboxCache, saveInboxDraft, markInboxSent, removeInboxItem,
  addHistoryItem,
} from "../../../lib/store.js";
import { COMPOSE_Q } from "../../../lib/autoReply.js";
import { parseEmails } from "../../../lib/email.js";

export const dynamic = "force-dynamic";

// GET /api/inbox            -> trả CACHE đã lưu (persist, không gọi Graph)
// GET /api/inbox?refresh=1  -> quét mail mới từ Graph + so khớp KB, lưu cache rồi trả
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "1";
  const folder = searchParams.get("folder") || getRules().scanFolder || "Inbox";

  // Không refresh -> trả nguyên cache đã lưu (giữ lại sau reload)
  if (!refresh) {
    const cache = getInboxCache();
    return NextResponse.json({ ...cache, count: (cache.items || []).length, cached: true });
  }

  try {
    const [{ threads }, messages] = await Promise.all([
      Promise.resolve(getThreadsWithKb()),
      fetchUnreadFolderMessages(folder),
    ]);

    const items = messages.map((m) => {
      const matches = matchKnowledge(m, threads, 3);
      return {
        messageId: m.id,
        conversationId: m.conversationId,
        from: m.from,
        to: m.to || [],
        cc: m.cc || [],
        subject: m.subject,
        receivedDateTime: m.receivedDateTime,
        bodyPreview: (m.bodyText || "").slice(0, 400),
        matches: matches.map((mt) => ({
          conversationId: mt.conversationId,
          subject: mt.subject,
          score: mt.score,
          matchedTags: mt.matchedTags || [],
          summary: mt.summary || "",
          solution: mt.solution || "",
        })),
        topScore: matches[0]?.score ?? 0,
      };
    });
    items.sort((a, b) => (b.receivedDateTime || "").localeCompare(a.receivedDateTime || ""));

    // MERGE với cache cũ: giữ lại mail đã quét trước đó dù lần này Graph không trả
    // (mail bị đánh dấu đã đọc, hoặc rơi qua mốc "hôm nay" của filter) -> không bị "mất".
    // Mail mới ghi đè bản cũ cùng messageId (cập nhật nội dung/khớp KB mới nhất).
    const prev = getInboxCache();
    const merged = new Map();
    for (const it of prev.items || []) merged.set(it.messageId, it);
    for (const it of items) merged.set(it.messageId, it); // mới đè cũ
    const mergedItems = [...merged.values()].sort(
      (a, b) => (b.receivedDateTime || "").localeCompare(a.receivedDateTime || "")
    );

    // Giữ toàn bộ drafts/sent cho các mail còn trong danh sách gộp
    const ids = new Set(mergedItems.map((i) => i.messageId));
    const keepDrafts = {};
    const keepSent = {};
    for (const [id, v] of Object.entries(prev.drafts || {})) if (ids.has(id)) keepDrafts[id] = v;
    for (const [id, v] of Object.entries(prev.sent || {})) if (ids.has(id)) keepSent[id] = v;

    const cache = { folder, fetchedAt: new Date().toISOString(), items: mergedItems, drafts: keepDrafts, sent: keepSent };
    saveInboxCache(cache);
    return NextResponse.json({ ...cache, count: mergedItems.length, cached: false, newCount: items.length });
  } catch (e) {
    // Lỗi Graph (vd token hết hạn) -> vẫn trả cache cũ để không mất dữ liệu đã quét
    const cache = getInboxCache();
    return NextResponse.json(
      { ...cache, count: (cache.items || []).length, cached: true, error: e.message },
      { status: 200 }
    );
  }
}

// POST /api/inbox
//  { action:"suggest", messageId }              -> sinh gợi ý AI + LƯU vào cache
//  { action:"send", messageId, to?, cc? }       -> gửi trả lời (reply) qua Graph, đánh dấu sent
//  { action:"remove", messageId }               -> gỡ mail khỏi danh sách inbox đã lưu
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "suggest";
    const { messageId } = body;
    if (!messageId) return NextResponse.json({ error: "Thiếu messageId" }, { status: 400 });

    if (action === "remove") {
      removeInboxItem(messageId);
      return NextResponse.json({ ok: true, removed: true });
    }

    // action = resolve — đánh dấu mail "Đã xử lý": ghi vào lịch sử hỗ trợ
    // (status "resolved") rồi gỡ khỏi danh sách Inbox. Lấy nội dung từ cache
    // (mail đã quét), kèm gợi ý AI đã lưu (nếu có) làm nội dung trả lời.
    if (action === "resolve") {
      const cache = getInboxCache();
      const item = (cache.items || []).find((x) => x.messageId === messageId);
      if (!item) return NextResponse.json({ error: "Mail không còn trong danh sách Inbox" }, { status: 404 });
      const wasSent = !!cache.sent?.[messageId];
      const draft = cache.drafts?.[messageId] || "";
      const saved = addHistoryItem({
        messageId,
        conversationId: item.conversationId,
        from: item.from,
        to: item.to || [],
        cc: item.cc || [],
        subject: item.subject,
        receivedDateTime: item.receivedDateTime,
        bodyPreview: item.bodyPreview || "",
        matches: item.matches || [],
        draft,
        status: wasSent ? "sent" : "resolved",
        source: "inbox",
        ...(wasSent && { sentAt: cache.sent[messageId] }),
        resolvedAt: new Date().toISOString(),
      });
      removeInboxItem(messageId);
      return NextResponse.json({ ok: true, resolved: true, item: saved });
    }

    if (action === "thread") {
      // Lấy toàn bộ luồng hội thoại (group thread) của mail để xem context trả lời qua lại.
      const cache = getInboxCache();
      const item = (cache.items || []).find((x) => x.messageId === messageId);
      const conversationId = body.conversationId || item?.conversationId;
      if (!conversationId) return NextResponse.json({ error: "Mail không có conversationId" }, { status: 400 });
      const msgs = await fetchConversation(conversationId);
      return NextResponse.json({
        ok: true,
        conversationId,
        count: msgs.length,
        messages: msgs.map((m) => ({
          messageId: m.id,
          from: m.from,
          to: m.to || [],
          cc: m.cc || [],
          subject: m.subject,
          receivedDateTime: m.receivedDateTime,
          bodyText: (m.bodyText || "").slice(0, 4000),
        })),
      });
    }

    if (action === "send") {
      const cache = getInboxCache();
      const draft = (body.draft ?? cache.drafts?.[messageId] ?? "").trim();
      if (!draft) return NextResponse.json({ error: "Chưa có nội dung trả lời. Bấm 'Gợi ý trả lời' trước." }, { status: 400 });
      const toList = parseEmails(body.to || "");
      const ccList = parseEmails(body.cc || "");
      await replyToMessage(messageId, draft, { extraTo: toList, cc: ccList });
      const updated = markInboxSent(messageId);
      return NextResponse.json({ ok: true, sent: true, sentAt: updated.sent[messageId] });
    }

    // action = suggest — dùng dữ liệu từ CACHE trước (mail có thể đã đọc/qua ngày,
    // Graph không trả nữa nhưng vẫn còn trong danh sách đã quét). Fallback sang Graph.
    const cache = getInboxCache();
    const cachedItem = (cache.items || []).find((x) => x.messageId === messageId);
    const { threads } = getThreadsWithKb();

    let incoming, matched;
    if (cachedItem) {
      matched = (cachedItem.matches || []).map((mt) => ({
        conversationId: mt.conversationId, subject: mt.subject, score: mt.score,
        matchedTags: mt.matchedTags || [], summary: mt.summary || "", solution: mt.solution || "",
        // supportChat cần các field context — bổ sung từ threads nếu có
      }));
      // nạp đầy đủ thread khớp để AI có context tốt hơn
      const ids = new Set(matched.map((m) => m.conversationId));
      matched = threads.filter((t) => ids.has(t.conversationId))
        .map((t) => ({ ...t, score: cachedItem.matches.find((m) => m.conversationId === t.conversationId)?.score }));
      incoming = { from: cachedItem.from, subject: cachedItem.subject, bodyPreview: cachedItem.bodyPreview || "" };
    } else {
      const folder = body.folder || cache.folder || getRules().scanFolder || "Inbox";
      const messages = await fetchUnreadFolderMessages(folder);
      const m = messages.find((x) => x.id === messageId);
      if (!m) return NextResponse.json({ error: "Mail không còn trong danh sách (đã gỡ/di chuyển?)" }, { status: 404 });
      matched = matchKnowledge(m, threads, 3);
      incoming = { from: m.from, subject: m.subject, bodyPreview: (m.bodyText || "").slice(0, 1000) };
    }

    const draft = (await supportChat({ question: COMPOSE_Q, incoming, matchedThreads: matched })).trim();
    saveInboxDraft(messageId, draft); // persist gợi ý
    return NextResponse.json({ messageId, draft, matchCount: matched.length, topScore: matched[0]?.score ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
