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
  const [support, setSupport] = useState(null);
  const [period, setPeriod] = useState("month");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const [rep, sup] = await Promise.all([
      fetch("/api/report?" + params.toString()).then((r) => r.json()),
      fetch("/api/report/support-stats?" + params.toString() + "&period=" + period).then((r) => r.json()),
    ]);
    setData(rep);
    setSupport(sup);
    setLoading(false);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (support) load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* ===== Thống kê hoạt động HỖ TRỢ (cho tổng quản) ===== */}
      <div className="card" style={{ marginTop: 20, borderTop: "3px solid var(--primary)" }}>
        <div className="row" style={{ alignItems: "center" }}>
          <b style={{ fontSize: 16 }}>🧑‍💼 Thống kê hỗ trợ — tổng quản</b>
          <span style={{ marginLeft: "auto" }} className="muted">Xem theo:</span>
          <button
            className={period === "week" ? "primary" : "ghost"}
            onClick={() => setPeriod("week")}
          >
            📆 Tuần
          </button>
          <button
            className={period === "month" ? "primary" : "ghost"}
            onClick={() => setPeriod("month")}
          >
            🗓️ Tháng
          </button>
        </div>
        <p className="muted" style={{ margin: "6px 0 12px" }}>
          Hoạt động hỗ trợ (mail đã tiếp nhận/xử lý) theo {period === "week" ? "tuần" : "tháng"}.
        </p>

        {/* Thẻ tổng quan hỗ trợ */}
        <div className="row" style={{ marginBottom: 14 }}>
          {[
            ["Tổng mail hỗ trợ", support?.summary?.total ?? 0],
            ["Đã trả lời (gửi)", support?.summary?.sent ?? 0],
            ["AI soạn nháp", support?.summary?.aiDrafted ?? 0],
            ["Tỉ lệ AI hỗ trợ", (support?.summary?.aiDraftRate ?? 0) + "%"],
          ].map(([label, val]) => (
            <div className="card" key={label} style={{ minWidth: 150, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{val}</div>
              <div className="muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="report-grid">
          <div className="card">
            <b>📊 Số mail hỗ trợ theo {period === "week" ? "tuần" : "tháng"}</b>
            <p className="muted" style={{ margin: "2px 0 10px" }}>
              Tổng quản nhìn nhanh: {period === "week" ? "tuần" : "tháng"} nào bận nhất
            </p>
            <BarChart
              rows={Object.entries(support?.byPeriod || {}).map(([name, v]) => ({ name, count: v.total }))}
              color="var(--primary)"
              empty="Chưa có dữ liệu hỗ trợ trong khoảng này."
            />
          </div>
          <div className="card">
            <b>🙋 Khách hỏi nhiều nhất</b>
            <p className="muted" style={{ margin: "2px 0 10px" }}>Top người gửi mail cần hỗ trợ</p>
            <BarChart rows={support?.topSenders} color="var(--accent)" empty="Chưa có dữ liệu." />
          </div>
        </div>
      </div>
    </div>
  );
}
