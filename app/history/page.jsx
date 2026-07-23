"use client";
// Lịch sử hỗ trợ: tìm kiếm, trạng thái, báo cáo
import { useEffect, useState } from "react";

const STATUS_LABEL = {
  pending: "⏳ Chờ xử lý",
  ai_drafted: "🤖 AI đã xử lý",
  approved: "✔ Đã duyệt",
  sent: "✅ Đã gửi",
  resolved: "✅ Đã xử lý",
  dismissed: "🚩 Đã bỏ",
};

export default function HistoryPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rule, setRule] = useState(""); // "" = tất cả, "__auto__" = mọi mail do rule xử lý, hoặc tên rule
  const [data, setData] = useState({ items: [], stats: {}, meta: {} });
  const [open, setOpen] = useState(null);
  const [kbForm, setKbForm] = useState(null); // messageId đang mở form nạp KB
  const [kbData, setKbData] = useState({});   // messageId -> { tags, summary, solution }
  const [kbBusy, setKbBusy] = useState({});
  const [kbSaved, setKbSaved] = useState({}); // conversationId -> true (đã nạp KB)

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (rule) params.set("rule", rule);
    const res = await fetch("/api/history?" + params.toString());
    setData(await res.json());
  }
  useEffect(() => { load(); }, [status, rule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mở form nạp KB cho 1 mail — điền sẵn từ dữ liệu có sẵn (tags từ matched, draft làm solution).
  function openKbForm(item) {
    if (kbForm === item.messageId) { setKbForm(null); return; }
    if (!kbData[item.messageId]) {
      const suggestedTags = [...new Set((item.matches || []).flatMap((m) => m.matchedTags || []))];
      setKbData((d) => ({
        ...d,
        [item.messageId]: {
          tags: suggestedTags.join(", "),
          summary: "",
          solution: item.draft || item.matches?.[0]?.solution || "",
        },
      }));
    }
    setKbForm(item.messageId);
  }

  // Nạp mail vào Kho kiến thức: lưu tags/summary/solution theo conversationId.
  async function saveKb(item) {
    const conversationId = item.conversationId;
    if (!conversationId) { alert("Mail này không có conversationId nên không nạp KB được."); return; }
    const form = kbData[item.messageId] || {};
    const tags = (form.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
    const summary = (form.summary || "").trim();
    const solution = (form.solution || "").trim();
    if (!summary && !solution && tags.length === 0) {
      alert("Nhập ít nhất tag, tóm tắt, hoặc giải pháp trước khi nạp.");
      return;
    }
    setKbBusy((b) => ({ ...b, [item.messageId]: true }));
    try {
      const r = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, tags, summary, solution }),
      });
      const out = await r.json();
      if (out.error) { alert(out.error); }
      else {
        setKbSaved((s) => ({ ...s, [conversationId]: true }));
        setKbForm(null);
      }
    } catch (e) { alert(e.message); }
    setKbBusy((b) => ({ ...b, [item.messageId]: false }));
  }

  const s = data.stats || {};
  const months = Object.entries(s.byMonth || {}).sort((a, b) => b[0].localeCompare(a[0]));
  const rules = Object.entries(s.byRule || {}).sort((a, b) => b[1].total - a[1].total);

  return (
    <div>
      <h1>Lịch sử hỗ trợ & báo cáo</h1>

      <div className="row" style={{ marginBottom: 14 }}>
        {[
          ["Tổng số mail hỗ trợ", s.total],
          ["Chờ xử lý", s.pending],
          ["AI đã xử lý", s.aiDrafted],
          ["Đã duyệt", s.approved],
          ["Đã gửi trả lời", s.sent],
          ["Đã xử lý (thủ công)", s.resolved],
          ["Đã bỏ", s.dismissed],
          ["Có kiến thức khớp", s.matched],
          ["Tự xử lý bởi rule", s.autoProcessed],
          ["Rule tự gửi thật", s.autoSent],
        ].map(([label, val]) => (
          <div className="card" key={label} style={{ minWidth: 150, textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{val ?? 0}</div>
            <div className="muted">{label}</div>
          </div>
        ))}
      </div>

      {months.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Theo tháng</b>
          <div className="row" style={{ marginTop: 6 }}>
            {months.map(([m, c]) => (
              <span key={m} className="tag">{m}: {c} mail</span>
            ))}
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row">
            <b>🤖 Hỗ trợ theo rule</b>
            <button
              className="ghost"
              style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 12, ...(rule === "__auto__" ? { background: "#e3edff" } : {}) }}
              onClick={() => setRule(rule === "__auto__" ? "" : "__auto__")}
            >
              {rule === "__auto__" ? "✕ Bỏ lọc" : "Xem tất cả mail do rule xử lý"}
            </button>
          </div>
          <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {rules.map(([name, c]) => (
              <button
                key={name}
                className="ghost"
                style={{ textAlign: "left", ...(rule === name ? { background: "#e3edff", borderColor: "#b9cdfb" } : {}) }}
                title="Bấm để xem các mail do rule này xử lý"
                onClick={() => setRule(rule === name ? "" : name)}
              >
                <b>{name}</b> · {c.total} mail
                <span className="muted" style={{ fontSize: 12 }}> (📝 {c.drafted} nháp · 📤 {c.sent} gửi)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {rule && (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="tag">
            Đang lọc: {rule === "__auto__" ? "mọi mail do rule xử lý" : `rule "${rule}"`}
          </span>
          <button className="ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setRule("")}>
            ✕ Bỏ lọc
          </button>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          type="text"
          style={{ maxWidth: 320 }}
          placeholder="Tìm theo tiêu đề, người gửi, nội dung, tag..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="primary" onClick={load}>🔍 Tìm</button>
        {["", "pending", "ai_drafted", "approved", "sent", "resolved", "dismissed"].map((st) => (
          <button
            key={st}
            className="ghost"
            style={st === status ? { background: "#e3edff" } : {}}
            onClick={() => setStatus(st)}
          >
            {st === "" ? "Tất cả" : STATUS_LABEL[st]}
          </button>
        ))}
        <span className="muted">·</span>
        <button
          className="ghost"
          style={rule === "__auto__" ? { background: "#ede9fe", borderColor: "#c4b5fd" } : {}}
          title="Chỉ mail được rule tự động xử lý"
          onClick={() => setRule(rule === "__auto__" ? "" : "__auto__")}
        >
          🤖 Xử lý bởi rule
        </button>
      </div>

      {(data.items || []).length === 0 && (
        <div className="card"><p className="muted">Không có bản ghi nào.</p></div>
      )}

      {(data.items || []).map((item) => (
        <div className="card" key={item.messageId} style={{ marginBottom: 10 }}>
          <div className="row" style={{ cursor: "pointer" }}
            onClick={() => setOpen(open === item.messageId ? null : item.messageId)}>
            <b>{item.subject || "(không tiêu đề)"}</b>
            <span className="tag">{STATUS_LABEL[item.status] || item.status}</span>
            {item.ruleName && (
              <span className="tag" title="Mail được rule tự xử lý">
                🤖 {item.ruleName}{item.autoSent ? " · 📤 tự gửi" : " · 📝 nháp"}
              </span>
            )}
            <span className="muted">
              {item.from} · {new Date(item.receivedDateTime).toLocaleString("vi-VN")}
              {item.sentAt && ` · gửi lúc ${new Date(item.sentAt).toLocaleString("vi-VN")}`}
            </span>
          </div>
          {open === item.messageId && (
            <div style={{ marginTop: 8 }}>
              <span className="label">Nội dung mail</span>
              <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{item.bodyPreview}</p>
              {(item.matches || []).length > 0 && (
                <>
                  <span className="label">Kiến thức đã khớp</span>
                  {item.matches.map((m) => (
                    <div className="msg" key={m.conversationId}>
                      <div className="head"><b>{m.subject}</b> <span className="badge-score">điểm {m.score}</span></div>
                      {m.solution && <div style={{ fontSize: 13 }}>✅ {m.solution}</div>}
                    </div>
                  ))}
                </>
              )}
              {item.draft && (
                <>
                  <span className="label">Nội dung trả lời {item.status === "sent" ? "(đã gửi)" : "(nháp)"}</span>
                  <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{item.draft}</p>
                </>
              )}

              <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
                <button
                  className="ghost"
                  style={{ padding: "5px 12px", color: "#6d28d9", borderColor: "#ddd6fe" }}
                  onClick={() => openKbForm(item)}
                  disabled={!item.conversationId}
                  title={item.conversationId ? "Nạp mail này vào Kho kiến thức (tags/tóm tắt/giải pháp)" : "Mail không có conversationId"}
                >
                  📥 {kbForm === item.messageId ? "Đóng form KB" : "Nạp vào Kho kiến thức"}
                </button>
                {kbSaved[item.conversationId] && (
                  <span className="tag" style={{ background: "#ede9fe", color: "#6d28d9" }}>✅ đã nạp KB</span>
                )}
              </div>

              {kbForm === item.messageId && (
                <div style={{ marginTop: 10, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#6d28d9" }}>
                    📥 Nạp vào Kho kiến thức
                  </div>
                  <label className="label" style={{ marginTop: 0 }}>Tags (phân cách bởi dấu phẩy)</label>
                  <input
                    type="text"
                    style={{ width: "100%", fontSize: 13 }}
                    placeholder="vd: lương presale, hóa đơn, SGCP01522"
                    value={kbData[item.messageId]?.tags || ""}
                    onChange={(e) => setKbData((d) => ({ ...d, [item.messageId]: { ...d[item.messageId], tags: e.target.value } }))}
                  />
                  <label className="label">Tóm tắt vấn đề</label>
                  <textarea
                    rows={3}
                    style={{ width: "100%", fontSize: 13 }}
                    placeholder="Tóm tắt ngắn gọn nội dung/vấn đề của mail này"
                    value={kbData[item.messageId]?.summary || ""}
                    onChange={(e) => setKbData((d) => ({ ...d, [item.messageId]: { ...d[item.messageId], summary: e.target.value } }))}
                  />
                  <label className="label">Giải pháp / cách xử lý</label>
                  <textarea
                    rows={5}
                    style={{ width: "100%", fontSize: 13 }}
                    placeholder="Cách đã xử lý vấn đề này (dùng làm gợi ý cho các mail tương tự sau)"
                    value={kbData[item.messageId]?.solution || ""}
                    onChange={(e) => setKbData((d) => ({ ...d, [item.messageId]: { ...d[item.messageId], solution: e.target.value } }))}
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="primary" disabled={kbBusy[item.messageId]} onClick={() => saveKb(item)}>
                      {kbBusy[item.messageId] ? "⏳ Đang lưu..." : "💾 Lưu vào KB"}
                    </button>
                    <button className="ghost" onClick={() => setKbForm(null)}>Hủy</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
