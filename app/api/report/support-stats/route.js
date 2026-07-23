import { NextResponse } from "next/server";
import { getHistory } from "../../../../lib/store.js";

export const dynamic = "force-dynamic";

// Thống kê hoạt động hỗ trợ (từ history.json) cho TỔNG QUẢN:
// - period=week | month (mặc định month)
// - Trả về: tổng đã xử lý, phân theo trạng thái, chuỗi theo tuần/tháng,
//   top người gửi (khách hỏi nhiều nhất), tỉ lệ AI tự soạn.
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") === "week" ? "week" : "month";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const start = fromParam ? new Date(fromParam + "T00:00:00") : null;
  const end = toParam ? new Date(toParam + "T23:59:59.999") : null;

  const h = getHistory();
  const items = Object.values(h.items || {});

  const byStatus = {};
  const byPeriod = {};       // { "2026-06" | "2026-W23": {total, sent, drafted, dismissed, pending} }
  const bySender = new Map();
  let total = 0;
  let aiDrafted = 0;
  let sent = 0;

  const bucketKey = (d) => (period === "week" ? isoWeek(d) : d.toISOString().slice(0, 7));

  for (const it of items) {
    const ts = it.receivedDateTime || it.createdAt;
    const d = ts ? new Date(ts) : null;
    if (!d || isNaN(d)) continue;
    if (start && d < start) continue;
    if (end && d > end) continue;

    total++;
    const st = it.status || "pending";
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (it.autoDraftedAt || it.autoSent) aiDrafted++;
    if (st === "sent") sent++;

    const key = bucketKey(d);
    const b = (byPeriod[key] = byPeriod[key] || { total: 0, sent: 0, drafted: 0, dismissed: 0, pending: 0, approved: 0 });
    b.total++;
    if (st === "sent") b.sent++;
    else if (st === "ai_drafted") b.drafted++;
    else if (st === "dismissed") b.dismissed++;
    else if (st === "approved") b.approved++;
    else b.pending++;

    const sender = (it.from || "").trim().toLowerCase();
    if (sender) bySender.set(sender, (bySender.get(sender) || 0) + 1);
  }

  const topSenders = [...bySender.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return NextResponse.json({
    period,
    appliedRange: { from: fromParam || null, to: toParam || null },
    summary: {
      total,
      sent,
      aiDrafted,
      aiDraftRate: total ? Math.round((aiDrafted / total) * 100) : 0,
    },
    byStatus,
    byPeriod: Object.fromEntries(Object.entries(byPeriod).sort()),
    topSenders,
  });
}
