"use client";
// Báo cáo trực quan: ai gửi/nhận nhiều nhất, tổng mail theo khoảng thời gian.
import { useEffect, useState } from "react";

// Thanh bar ngang đơn giản (không dùng thư viện chart)
// Con số nằm NGOÀI thanh nên luôn đọc được kể cả khi giá trị nhỏ.
function BarChart({ rows, color = "var(--primary)", unit = "mail", empty }) {
  if (!rows || rows.length === 0) return <p className="muted">{empty || "Không có dữ liệu."}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="barchart">
      {rows.map((r) => (
        <div className="bar-row" key={r.name}>
          <div className="bar-label" title={r.name}>{r.name}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: (r.count / max) * 100 + "%", background: color }} />
          </div>
          <div className="bar-num">{r.count}<span className="bar-unit"> {unit}</span></div>
        </div>
      ))}
    </div>
  );
}

export default function ReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch("/api/report?" + params.toString());
    setData(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const months = Object.entries(data?.byMonth || {}).map(([name, count]) => ({ name, count }));

  return (
    <div>
      <h1>Báo cáo trực quan</h1>

      {/* Bộ lọc khoảng thời gian */}
      <div className="card" style={{ marginBottom: 14 }}>
        <span className="label" style={{ marginTop: 0 }}>📅 Khoảng thời gian (theo ngày nhận mail)</span>
        <div className="row">
          <label className="muted">Từ
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ marginLeft: 6 }} />
          </label>
          <label className="muted">Đến
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ marginLeft: 6 }} />
          </label>
          <button className="primary" disabled={loading} onClick={load}>
            {loading ? "Đang tính..." : "🔍 Xem báo cáo"}
          </button>
          {(from || to) && (
            <button className="ghost" onClick={() => { setFrom(""); setTo(""); setTimeout(load, 0); }}>
              ↺ Toàn bộ thời gian
            </button>
          )}
          {data?.dataRange?.min && (
            <span className="muted">Dữ liệu có từ {data.dataRange.min} → {data.dataRange.max}</span>
          )}
        </div>
      </div>

      {/* Thẻ tổng quan */}
      <div className="row" style={{ marginBottom: 14 }}>
        {[
          ["Tổng số mail", data?.totalMessages ?? 0],
          ["Số luồng có mail", data?.threadsInRange ?? 0],
          [
            "Khoảng lọc",
            data?.appliedRange?.from || data?.appliedRange?.to
              ? `${data.appliedRange.from || "…"} → ${data.appliedRange.to || "…"}`
              : "Tất cả",
          ],
        ].map(([label, val]) => (
          <div className="card" key={label} style={{ minWidth: 180, textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{val}</div>
            <div className="muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="report-grid">
        <div className="card">
          <b>📤 Người gửi nhiều nhất</b>
          <p className="muted" style={{ margin: "2px 0 10px" }}>Top theo số mail đã gửi</p>
          <BarChart rows={data?.topSenders} color="var(--primary)" empty="Chưa có mail trong khoảng này." />
        </div>
        <div className="card">
          <b>📥 Người nhận nhiều nhất</b>
          <p className="muted" style={{ margin: "2px 0 10px" }}>Top theo số mail nhận được (To + CC)</p>
          <BarChart rows={data?.topRecipients} color="var(--accent)" empty="Chưa có mail trong khoảng này." />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b>📈 Số mail theo tháng</b>
        <p className="muted" style={{ margin: "2px 0 10px" }}>Phân bố mail nhận theo từng tháng trong khoảng đã chọn</p>
        <BarChart rows={months} color="var(--success)" empty="Chưa có mail trong khoảng này." />
      </div>
    </div>
  );
}
