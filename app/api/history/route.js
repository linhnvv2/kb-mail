import { NextResponse } from "next/server";
import { getHistory } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Lịch sử hỗ trợ + tìm kiếm + số liệu báo cáo
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const status = searchParams.get("status") || "";

  const h = getHistory();
  let items = Object.values(h.items).sort((a, b) =>
    (b.receivedDateTime || "").localeCompare(a.receivedDateTime || "")
  );

  if (status) items = items.filter((i) => i.status === status);
  if (q) {
    items = items.filter(
      (i) =>
        i.subject?.toLowerCase().includes(q) ||
        i.from?.toLowerCase().includes(q) ||
        i.bodyPreview?.toLowerCase().includes(q) ||
        i.draft?.toLowerCase().includes(q) ||
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
    byMonth: {},
  };
  for (const i of all) {
    const m = (i.receivedDateTime || "").slice(0, 7);
    if (m) stats.byMonth[m] = (stats.byMonth[m] || 0) + 1;
  }

  return NextResponse.json({ meta: h.meta, items, stats });
}
