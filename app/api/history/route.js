import { NextResponse } from "next/server";
import { getHistory } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Lịch sử hỗ trợ + tìm kiếm + số liệu báo cáo
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const status = searchParams.get("status") || "";
  const rule = searchParams.get("rule") || ""; // lọc theo tên rule đã xử lý mail

  const h = getHistory();
  let items = Object.values(h.items).sort((a, b) =>
    (b.receivedDateTime || "").localeCompare(a.receivedDateTime || "")
  );

  if (status) items = items.filter((i) => i.status === status);
  if (rule === "__auto__") items = items.filter((i) => !!i.ruleId);
  else if (rule) items = items.filter((i) => i.ruleName === rule);
  if (q) {
    items = items.filter(
      (i) =>
        i.subject?.toLowerCase().includes(q) ||
        i.from?.toLowerCase().includes(q) ||
        i.bodyPreview?.toLowerCase().includes(q) ||
        i.draft?.toLowerCase().includes(q) ||
        i.ruleName?.toLowerCase().includes(q) ||
        (i.matches || []).some((m) => (m.matchedTags || []).some((t) => t.toLowerCase().includes(q)))
    );
  }

  const all = Object.values(h.items);
  const stats = {
    total: all.length,
    pending: all.filter((i) => i.status === "pending").length,
    aiDrafted: all.filter((i) => i.status === "ai_drafted").length,
    approved: all.filter((i) => i.status === "approved").length,
    sent: all.filter((i) => i.status === "sent").length,
    dismissed: all.filter((i) => i.status === "dismissed").length,
    matched: all.filter((i) => (i.matches || []).length > 0).length,
    autoProcessed: all.filter((i) => !!i.ruleId).length, // tự xử lý bởi rule
    autoSent: all.filter((i) => !!i.autoSent).length,    // rule tự gửi thật
    byMonth: {},
    byRule: {}, // { [ruleName]: { total, drafted, sent } }
  };
  for (const i of all) {
    const m = (i.receivedDateTime || "").slice(0, 7);
    if (m) stats.byMonth[m] = (stats.byMonth[m] || 0) + 1;
    if (i.ruleName) {
      const r = (stats.byRule[i.ruleName] ||= { total: 0, drafted: 0, sent: 0 });
      r.total++;
      if (i.autoSent) r.sent++;
      else r.drafted++;
    }
  }

  return NextResponse.json({ meta: h.meta, items, stats });
}
