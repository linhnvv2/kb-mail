"use client";
// Cấu hình quét cờ & rule: với mỗi mail gắn cờ, theo tag/chủ đề/người gửi → tự lưu nháp hoặc tự gửi.
import { useEffect, useRef, useState } from "react";

const j = (v) => (Array.isArray(v) ? v.join(", ") : v || "");

// Rule từ server (mảng) -> rule cho form (chuỗi để nhập)
function toForm(r, i) {
  return {
    id: r.id || `r_new_${i}`,
    name: r.name || "",
    enabled: r.enabled !== false,
    match: r.match === "all" ? "all" : "any",
    tags: j(r.conditions?.tags),
    subjectContains: j(r.conditions?.subjectContains),
    fromContains: j(r.conditions?.fromContains),
    action: ["none", "draft", "reply"].includes(r.action) ? r.action : "none",
    to: j(r.to),
    cc: j(r.cc),
    requireKnowledgeMatch: r.requireKnowledgeMatch !== false,
    unflagAfterSend: r.unflagAfterSend !== false,
  };
}

// Rule form -> payload gửi server (server tự tách chuỗi & validate email)
function toPayload(r) {
  return {
    id: r.id?.startsWith("r_new_") ? undefined : r.id,
    name: r.name,
    enabled: r.enabled,
    match: r.match,
    conditions: { tags: r.tags, subjectContains: r.subjectContains, fromContains: r.fromContains },
    action: r.action,
    to: r.to,
    cc: r.cc,
    requireKnowledgeMatch: r.requireKnowledgeMatch,
    unflagAfterSend: r.unflagAfterSend,
  };
}

const ACTION_LABEL = {
  none: "Không tự xử lý (chỉ chờ duyệt tay)",
  draft: "📝 Tự soạn AI + lưu nháp",
  reply: "📧 Tự soạn AI + GỬI THẬT",
};

export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [scanInterval, setScanInterval] = useState(10);
  const [scanSource, setScanSource] = useState("flagged"); // "flagged" | "inbox"
  const [scanFolder, setScanFolder] = useState("Inbox");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const skipSave = useRef(true); // bỏ qua lần auto-save ngay sau khi load dữ liệu
  const newId = useRef(0); // bộ đếm sinh id duy nhất cho rule mới (tránh trùng React key)

  async function load() {
    setLoading(true);
    skipSave.current = true;
    const d = await fetch("/api/rules").then((r) => r.json());
    setScanInterval(d.scanIntervalMinutes || 10);
    setScanSource(d.scanSource === "inbox" ? "inbox" : "flagged");
    setScanFolder(d.scanFolder || "Inbox");
    setRules((d.rules || []).map(toForm));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Tự lưu sau khi thay đổi (xóa/sửa/bật-tắt/sắp xếp) — debounce 700ms.
  useEffect(() => {
    if (loading) return;
    if (skipSave.current) { skipSave.current = false; return; }
    const t = setTimeout(() => { save({ auto: true }); }, 700);
    return () => clearTimeout(t);
  }, [rules, scanInterval, scanSource, scanFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i, patch) =>
    setRules((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const remove = (i) => setRules((rs) => rs.filter((_, k) => k !== i));
  const move = (i, dir) =>
    setRules((rs) => {
      const k = i + dir;
      if (k < 0 || k >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[k]] = [next[k], next[i]];
      return next;
    });
  const add = () =>
    setRules((rs) => [
      ...rs,
      toForm({ action: "draft", match: "any", enabled: true }, `n${newId.current++}`),
    ]);

  // auto=true: tự lưu nền (không ghi đè local state để giữ con trỏ khi đang gõ).
  async function save({ auto = false } = {}) {
    setSaving(true);
    if (!auto) setMsg("");
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanIntervalMinutes: scanInterval, scanSource, scanFolder, rules: rules.map(toPayload) }),
      });
      const out = await res.json();
      if (out.error) setMsg("⚠️ " + out.error);
      else {
        // chỉ đồng bộ lại từ server khi lưu thủ công (tránh nhảy con trỏ lúc đang gõ)
        if (!auto) {
          skipSave.current = true;
          setScanInterval(out.scanIntervalMinutes || 10);
          setScanSource(out.scanSource === "inbox" ? "inbox" : "flagged");
          setScanFolder(out.scanFolder || "Inbox");
          setRules((out.rules || []).map(toForm));
        }
        setMsg((auto ? "✅ Đã tự lưu lúc " : "✅ Đã lưu cấu hình lúc ") + new Date().toLocaleTimeString("vi-VN"));
      }
    } catch (e) {
      setMsg("⚠️ Lưu lỗi: " + e.message);
    }
    setSaving(false);
  }

  if (loading) return <div className="muted">Đang tải cấu hình...</div>;

  return (
    <div>
      <h1>⚙️ Cấu hình rule tự động</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Khi job quét mail gắn cờ, mỗi mail được xét theo các rule dưới đây (từ trên xuống).
        Rule khớp đầu tiên sẽ quyết định hành động. Áp dụng cho cả job nền (pm2) lẫn nút quét trên trang Hỗ trợ trả lời.
      </p>

      {/* Quét thêm Inbox (mail gắn cờ luôn được xử lý) */}
      <div className="card">
        <label className="row" style={{ gap: 6, cursor: "pointer", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={scanSource === "inbox"}
            onChange={(e) => setScanSource(e.target.checked ? "inbox" : "flagged")}
            style={{ marginTop: 3 }}
          />
          <span>
            <b>📥 Quét thêm Inbox (mail chưa đọc)</b>
            <div className="muted" style={{ fontSize: 13 }}>
              Mail gắn cờ luôn được xử lý. Bật thêm tùy chọn này để quét cả mail chưa đọc nhận trong hôm nay rồi áp rule. Tắt = chỉ xử lý mail gắn cờ.
            </div>
          </span>
        </label>
        {scanSource === "inbox" && (
          <>
            <label className="row" style={{ marginTop: 10, alignItems: "center" }}>
              <span className="muted">Folder quét:</span>
              <input type="text" placeholder="Inbox" value={scanFolder} onChange={(e) => setScanFolder(e.target.value)} style={{ width: 200 }} />
            </label>
            <div style={{ fontSize: 12, marginTop: 6, color: "#b45309" }}>
              ⚠️ Ở chế độ inbox, rule <b>chỉ soạn + lưu nháp</b> (không bao giờ tự gửi, kể cả rule "GỬI THẬT").
              Chỉ xét mail <b>chưa đọc nhận trong hôm nay</b>, mỗi mail xử lý 1 lần, tối đa 15 mail/vòng.
            </div>
          </>
        )}
      </div>

      {/* Chu kỳ quét tự động của job nền */}
      <div className="card">
        <label className="row" style={{ alignItems: "center" }}>
          <b>⏱ Chu kỳ quét tự động</b>
          <span className="muted">— job nền quét mail gắn cờ 1 lần mỗi</span>
          <input
            type="number"
            min={1}
            value={scanInterval}
            onChange={(e) => setScanInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
            style={{ width: 80 }}
          />
          <span className="muted">phút</span>
        </label>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Áp dụng cho job nền chạy bằng <code>npm run job:watch</code> / pm2 — đổi xong có hiệu lực ở vòng quét kế tiếp, không cần restart.
          Chạy 1 lần thủ công (<code>npm run job</code>) hay nút "Quét ngay" trên trang Hỗ trợ trả lời không bị ảnh hưởng bởi chu kỳ này.
        </div>
      </div>

      {rules.length === 0 && (
        <div className="card"><p className="muted">Chưa có rule nào. Bấm "➕ Thêm rule" để bắt đầu.</p></div>
      )}

      {rules.map((r, i) => (
        <div className="card" key={r.id} style={{ marginBottom: 12, opacity: r.enabled ? 1 : 0.6 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <label className="row" style={{ gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={r.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
              <span className="muted" style={{ fontSize: 13 }}>Bật</span>
            </label>
            <input
              type="text"
              placeholder="Tên rule (vd: Lương presale)"
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              style={{ flex: 1, fontWeight: 600 }}
            />
            <button className="ghost" style={{ padding: "4px 9px" }} title="Lên" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
            <button className="ghost" style={{ padding: "4px 9px" }} title="Xuống" disabled={i === rules.length - 1} onClick={() => move(i, 1)}>▼</button>
            <button className="ghost" style={{ padding: "4px 9px", color: "#b91c1c" }} title="Xóa rule" onClick={() => remove(i)}>🗑</button>
          </div>

          <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 13 }}>Khớp khi</span>
            <select value={r.match} onChange={(e) => update(i, { match: e.target.value })} className="auto-select">
              <option value="any">BẤT KỲ điều kiện nào đạt</option>
              <option value="all">TẤT CẢ điều kiện đạt</option>
            </select>
            <span className="muted" style={{ fontSize: 13 }}>(chỉ xét nhóm điều kiện có nhập)</span>
          </div>

          <span className="label">🏷 Tag (AI phân loại) — cách nhau bởi dấu phẩy</span>
          <input type="text" placeholder="vd: lương, presale" value={r.tags} onChange={(e) => update(i, { tags: e.target.value })} />

          <span className="label">📌 Chủ đề chứa (subject)</span>
          <input type="text" placeholder="vd: lương, hợp đồng" value={r.subjectContains} onChange={(e) => update(i, { subjectContains: e.target.value })} />

          <span className="label">👤 Người gửi / email chứa</span>
          <input type="text" placeholder="vd: @fpt.com, hr@" value={r.fromContains} onChange={(e) => update(i, { fromContains: e.target.value })} />

          <hr className="sep" style={{ margin: "12px 0" }} />

          <span className="label">Hành động khi khớp</span>
          <select className="auto-select" value={r.action} onChange={(e) => update(i, { action: e.target.value })}>
            {Object.entries(ACTION_LABEL).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          {r.action === "reply" && (
            <div style={{ fontSize: 12, marginTop: 4, color: "#b91c1c" }}>
              ⚠️ Rule này sẽ TỰ GỬI mail trả lời vào luồng ngay khi khớp, không cần người Duyệt OK.
            </div>
          )}

          {r.action !== "none" && (
            <>
              <span className="label">To bổ sung (ngoài người trong luồng)</span>
              <input type="text" placeholder="vd: a@fpt.com, b@fpt.com" value={r.to} onChange={(e) => update(i, { to: e.target.value })} />
              <span className="label">CC bổ sung</span>
              <input type="text" placeholder="vd: sep@fpt.com" value={r.cc} onChange={(e) => update(i, { cc: e.target.value })} />

              <label className="row" style={{ gap: 6, marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={r.requireKnowledgeMatch} onChange={(e) => update(i, { requireKnowledgeMatch: e.target.checked })} />
                <span style={{ fontSize: 13 }}>Chỉ tự xử lý khi có kiến thức khớp (khuyến nghị bật)</span>
              </label>
              {r.action === "reply" && (
                <label className="row" style={{ gap: 6, marginTop: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={r.unflagAfterSend} onChange={(e) => update(i, { unflagAfterSend: e.target.checked })} />
                  <span style={{ fontSize: 13 }}>Bỏ cờ mail sau khi tự gửi</span>
                </label>
              )}
            </>
          )}
        </div>
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="ghost" onClick={add}>➕ Thêm rule</button>
        <button className="primary" disabled={saving} onClick={() => save()}>{saving ? "Đang lưu..." : "💾 Lưu ngay"}</button>
        <span className="muted">{msg || "Thay đổi tự lưu sau ~1 giây."}</span>
      </div>
    </div>
  );
}
