import { NextResponse } from "next/server";
import { getThreadsWithKb } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Báo cáo trực quan trên toàn bộ kho mail (đã gộp, khử trùng lặp):
// - ai gửi nhiều nhất, ai nhận nhiều nhất
// - tổng số mail theo khoảng thời gian (lọc from/to) + chuỗi theo tháng
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from"); // YYYY-MM-DD
  const toParam = searchParams.get("to");
  const start = fromParam ? new Date(fromParam + "T00:00:00") : null;
  const end = toParam ? new Date(toParam + "T23:59:59.999") : null;

  const { threads } = getThreadsWithKb();

  const senders = new Map();
  const recipients = new Map();
  const byMonth = {};
  let totalMessages = 0;
  let threadsInRange = 0;
  let minDate = null;
  let maxDate = null;

  const bump = (map, key) => {
    const k = (key || "").trim().toLowerCase();
    if (k) map.set(k, (map.get(k) || 0) + 1);
  };

  for (const t of threads) {
    let hit = false;
    for (const m of t.messages || []) {
      const dt = m.receivedDateTime ? new Date(m.receivedDateTime) : null;
      if (dt && !isNaN(dt)) {
        if (!minDate || dt < minDate) minDate = dt;
        if (!maxDate || dt > maxDate) maxDate = dt;
        if (start && dt < start) continue;
        if (end && dt > end) continue;
      } else if (start || end) {
        continue; // có lọc thời gian nhưng mail thiếu ngày -> bỏ
      }
      hit = true;
      totalMessages++;
      bump(senders, m.from);
      // người nhận = To ∪ CC (mỗi địa chỉ tính 1 lần / mail)
      const recv = new Set([...(m.to || []), ...(m.cc || [])].map((x) => (x || "").trim().toLowerCase()));
      recv.delete("");
      for (const r of recv) recipients.set(r, (recipients.get(r) || 0) + 1);
      const ym = m.receivedDateTime.slice(0, 7);
      byMonth[ym] = (byMonth[ym] || 0) + 1;
    }
    if (hit) threadsInRange++;
  }

  const top = (map, n = 12) =>
    [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

  return NextResponse.json({
    totalMessages,
    threadsInRange,
    totalThreads: threads.length,
    dataRange: {
      min: minDate ? minDate.toISOString().slice(0, 10) : null,
      max: maxDate ? maxDate.toISOString().slice(0, 10) : null,
    },
    appliedRange: { from: fromParam || null, to: toParam || null },
    topSenders: top(senders),
    topRecipients: top(recipients),
    byMonth: Object.fromEntries(Object.entries(byMonth).sort()),
  });
}
